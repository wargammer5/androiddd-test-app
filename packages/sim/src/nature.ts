import { plants as PLANTS, species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import { Biome, Mat, World } from './world.ts';
import { Rng } from './rng.ts';
import { calendar, Season } from './time.ts';
import { Obj, PLANT_TYPES, Stage, isPlant, plantObj, plantStage, plantType } from './objects.ts';
import { Mover, passable } from './pathfind.ts';

const BIOME_KEYS = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];
const PLANT_BIOMES = PLANTS.map((p) => new Set(p.biomes.map((b) => BIOME_KEYS.indexOf(b))));
const DENSITY: number[][] = BIOME_KEYS.map((bk) => PLANTS.map((p) => p.density[bk] ?? 0));
const BIOME_TREE: number[] = BIOME_KEYS.map((bk) => {
  if (bk === 'snow' || bk === 'mountain') return 1;
  if (bk === 'jungle' || bk === 'swamp') return 3;
  if (bk === 'beach' || bk === 'desert' || bk === 'savanna') return 2;
  return 0;
});
const ANIMALS = SPECIES.filter((s) => s.kind === 'animal');
const SPECIES_BIOMES = SPECIES.map((s) => new Set(s.biomes.map((b) => BIOME_KEYS.indexOf(b))));

export const SEASON_TEMP = [0, 7, -2, -12];

export const enum Cloud {
  Rain = 1,
  Snow = 2,
  Storm = 3,
}

export interface CloudState {
  x: number;
  y: number;
  r: number;
  type: number;
  life: number;
  vx: number;
  vy: number;
}

export function placePlants(w: World, rng: Rng): void {
  for (let i = 0; i < w.n; i++) {
    if (w.obj[i] !== 0 || w.mat[i] !== Mat.None) continue;
    const dens = DENSITY[w.biome[i]!]!;
    for (let t = 0; t < PLANT_TYPES; t++) {
      const d = dens[t]!;
      if (d > 0 && rng.float() < d) {
        const st = rng.chance(0.75) ? Stage.Adult : rng.irange(Stage.Sprout, Stage.Old);
        w.obj[i] = plantObj(t, st === Stage.Fruiting ? Stage.Adult : st);
        w.objData[i] = rng.int(10);
        break;
      }
    }
  }
}

export class Nature implements System {
  readonly name = 'nature';
  clouds: CloudState[] = [];
  wind: [number, number] = [1, 0];
  flash = 0;
  private rng: Rng;
  plantCount = 0;
  ecoTimer = 0;

  constructor(sim: Simulation) {
    this.rng = sim.rng.fork(91);
    this.attachedSim = sim;
  }

  seasonOffset(tick: number): number {
    const c = calendar(tick);
    const t = c.dayOfYear / 8 + 0.0;
    const s = Math.floor(t * 4) % 4;
    const frac = t * 4 - Math.floor(t * 4);
    const a = SEASON_TEMP[s]!;
    const b = SEASON_TEMP[(s + 1) % 4]!;
    return a + (b - a) * Math.max(0, frac - 0.5) * 2 * 0.5;
  }

  effTemp(w: World, i: number, off: number): number {
    return w.heat[i]! + off;
  }

  ageTemp(): number {
    return this.attachedSim ? this.attachedSim.events.mod('temp') : 0;
  }

  rainAt(w: World, i: number): boolean {
    if (this.clouds.length === 0) return false;
    const x = i % w.w;
    const y = (i - x) / w.w;
    for (const c of this.clouds) {
      if (c.type === Cloud.Snow) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < c.r * c.r) return true;
    }
    return false;
  }

  step(sim: Simulation): void {
    const w = sim.world;
    const tick = sim.tick;
    const off = this.seasonOffset(tick) + this.ageTemp();
    const season = calendar(tick).season;
    if (tick % 3 === 0) this.weather(sim, season, off);
    if (this.flash > 0) this.flash--;
    const samples = Math.max(256, w.n >> 7);
    const r = this.rng;
    const eco = sim.laws.ecosystem;
    const ecoMul = eco === 'off' ? 0 : eco === 'slow' ? 0.5 : eco === 'fast' ? 2 : 1;
    const seasonGrow = season === Season.Winter ? 0.12 : season === Season.Spring ? 1.3 : season === Season.Summer ? 1 : 0.55;
    for (let k = 0; k < samples; k++) {
      const i = r.int(w.n);
      const o = w.obj[i]!;
      const m = w.mat[i]!;
      const temp = this.effTemp(w, i, off);
      if (m === Mat.Snow) {
        if (temp > 3 && !this.snowingAt(w, i)) {
          if (w.depth[i]! <= 1) {
            w.mat[i] = Mat.Water;
            w.depth[i] = 1;
          } else w.depth[i] = w.depth[i]! - 1;
          w.wake(i, 30);
        }
      } else if (m === Mat.Water && w.depth[i]! > 0 && w.depth[i]! < 30 && temp < -6 && w.biome[i] !== Biome.Sea) {
        w.mat[i] = Mat.Ice;
        w.touch(i);
      } else if (m === Mat.Ice && temp > 1 && w.biome[i] !== Biome.Snow) {
        w.mat[i] = Mat.Water;
        w.wake(i, 20);
      }
      if (isPlant(o)) this.plant(sim, i, o, temp, seasonGrow, season);
      else if (o === Obj.Ash) {
        if (r.chance(0.08)) {
          w.obj[i] = 0;
          w.touchVisual(i);
        }
      } else if (o === Obj.Burnt) {
        if (r.chance(0.04)) {
          w.obj[i] = r.chance(0.5) ? Obj.Stump : 0;
          w.touchVisual(i);
        }
      } else if (o === Obj.Stump) {
        if (r.chance(0.03 * ecoMul + 0.01)) {
          w.obj[i] = plantObj(BIOME_TREE[w.biome[i]!]!, Stage.Sprout);
          w.objData[i] = 0;
          w.touchVisual(i);
        }
      } else if (o === 0 && m === Mat.None && ecoMul > 0 && w.zone[i] === 0 && r.float() < 0.0012 * ecoMul) {
        const dens = DENSITY[w.biome[i]!]!;
        const t = r.weighted(dens);
        if (dens[t]! > 0 && this.fit(w, i, t, temp) > 0.3) {
          w.obj[i] = plantObj(t, Stage.Seed);
          w.objData[i] = 0;
          w.touchVisual(i);
        }
      }
    }
    if (++this.ecoTimer >= (eco === 'fast' ? 120 : eco === 'slow' ? 480 : 240)) {
      this.ecoTimer = 0;
      if (ecoMul > 0) this.ecosystem(sim, ecoMul);
    }
  }

  snowingAt(w: World, i: number): boolean {
    const x = i % w.w;
    const y = (i - x) / w.w;
    for (const c of this.clouds) {
      if (c.type !== Cloud.Snow) continue;
      if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return true;
    }
    return false;
  }

  fit(w: World, i: number, t: number, temp: number): number {
    const p = PLANTS[t]!;
    if (w.mat[i] === Mat.Snow && t !== 1 && t !== 8) return 0;
    if ((w.mat[i] === Mat.Water && w.depth[i]! > 1) || w.mat[i] === Mat.Lava || w.mat[i] === Mat.Acid) return 0;
    if (temp < p.tempMin - 8 || temp > p.tempMax + 8) return 0;
    let f = PLANT_BIOMES[t]!.has(w.biome[i]!) ? 1 : 0.25;
    if (temp < p.tempMin || temp > p.tempMax) f *= 0.3;
    if (w.moist[i]! / 255 < p.moistMin) f *= 0.4;
    if (w.biome[i] === Biome.Acid || w.biome[i] === Biome.Volcanic) f *= t === 4 ? 0.8 : 0.2;
    return f;
  }

  private plant(sim: Simulation, i: number, o: number, temp: number, seasonGrow: number, season: number): void {
    const w = sim.world;
    const r = this.rng;
    const t = plantType(o);
    const st = plantStage(o);
    const p = PLANTS[t]!;
    const f = this.fit(w, i, t, temp);
    if (f === 0) {
      if (r.chance(0.25)) {
        w.obj[i] = st >= Stage.Young && t <= 3 ? Obj.Burnt : 0;
        w.touchVisual(i);
      }
      return;
    }
    const rain = (this.rainAt(w, i) ? 1.6 : 1) * sim.events.mod('growth') * (sim.events.regions.length && sim.events.inRegion('drought', i % w.w, Math.floor(i / w.w)) ? 0.1 : 1);
    if (r.float() < 0.1 * p.growth * f * seasonGrow * rain) {
      let ns = st;
      let age = w.objData[i]!;
      if (st < Stage.Adult) ns = st + 1;
      else if (st === Stage.Adult) {
        age = Math.min(15, age + 1);
        if (age >= p.life) ns = Stage.Old;
        else if (p.food > 0 && (season === Season.Spring || season === Season.Summer) && r.chance(0.5)) ns = Stage.Fruiting;
      } else if (st === Stage.Fruiting) {
        if (season === Season.Autumn || season === Season.Winter || r.chance(0.15)) {
          ns = Stage.Adult;
          this.seed(sim, i, t, 2);
        }
      } else if (st === Stage.Old) {
        if (r.chance(0.3)) {
          w.obj[i] = t <= 3 && r.chance(0.5) ? Obj.Stump : 0;
          w.objData[i] = 0;
          w.touchVisual(i);
          this.seed(sim, i, t, 3);
          return;
        }
      }
      if (ns !== st || age !== w.objData[i]) {
        w.obj[i] = plantObj(t, ns);
        w.objData[i] = age;
        w.touchVisual(i);
      }
    }
    if (st >= Stage.Adult && r.float() < p.spread * f * seasonGrow * 0.15) this.seed(sim, i, t, 3);
  }

  seed(sim: Simulation, i: number, t: number, radius: number): void {
    const w = sim.world;
    const r = this.rng;
    const x = (i % w.w) + r.irange(-radius, radius);
    const y = Math.floor(i / w.w) + r.irange(-radius, radius);
    if (!w.inside(x, y)) return;
    const j = y * w.w + x;
    if (w.obj[j] !== 0 || w.mat[j] !== Mat.None || w.road[j] || w.biome[j] === Biome.Sea || w.biome[j] === Biome.Beach && t !== 2) return;
    if (w.zone[j] !== 0 && t <= 3 && r.chance(0.8)) return;
    w.obj[j] = plantObj(t, Stage.Seed);
    w.objData[j] = 0;
    w.touchVisual(j);
  }

  private weather(sim: Simulation, season: number, off: number): void {
    const w = sim.world;
    const r = this.rng;
    const maxClouds = Math.min(8, 2 + Math.round(w.w / 192));
    const rainy = season === Season.Spring || season === Season.Autumn ? 1.6 : season === Season.Winter ? 1.2 : 0.8;
    if (sim.tick % 180 === 0 && r.chance(0.3)) {
      const dirs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ];
      this.wind = r.pick(dirs);
    }
    sim.substances.wind = this.wind;
    if (this.clouds.length < maxClouds && r.chance(0.006 * rainy)) {
      const x = r.range(0, w.w);
      const y = r.range(0, w.h);
      const ci = Math.floor(y) * w.w + Math.floor(x);
      const cold = w.baseTemp[ci]! + off < 0;
      const type = cold ? Cloud.Snow : r.chance(0.18) ? Cloud.Storm : Cloud.Rain;
      this.spawnCloud(x, y, r.range(10, 18 + w.w / 40), type, 400 + r.int(800));
    }
    for (let k = this.clouds.length - 1; k >= 0; k--) {
      const c = this.clouds[k]!;
      c.x += c.vx + this.wind[0] * 0.06;
      c.y += c.vy + this.wind[1] * 0.06;
      c.life -= 3;
      if (c.life <= 0 || c.x < -40 || c.y < -40 || c.x > w.w + 40 || c.y > w.h + 40) {
        this.clouds.splice(k, 1);
        continue;
      }
      const ci = Math.max(0, Math.min(w.h - 1, Math.floor(c.y))) * w.w + Math.max(0, Math.min(w.w - 1, Math.floor(c.x)));
      const cold = w.baseTemp[ci]! + off < 0;
      if (c.type === Cloud.Snow && !cold) c.type = Cloud.Rain;
      else if (c.type !== Cloud.Snow && cold) c.type = Cloud.Snow;
      const n = Math.ceil((c.r * c.r) / 10);
      for (let s = 0; s < n; s++) {
        const a = r.float() * Math.PI * 2;
        const d = Math.sqrt(r.float()) * c.r;
        const x = Math.floor(c.x + Math.cos(a) * d);
        const y = Math.floor(c.y + Math.sin(a) * d);
        if (!w.inside(x, y)) continue;
        const i = y * w.w + x;
        if (w.fire[i]! > 0 && c.type !== Cloud.Snow) {
          w.fire[i] = Math.max(0, w.fire[i]! - 4);
          w.wake(i, 10);
        }
        if (c.type === Cloud.Snow && w.mat[i] === Mat.None && w.biome[i] !== Biome.Sea && r.chance(0.3)) {
          w.mat[i] = Mat.Snow;
          w.depth[i] = 1;
          w.touchVisual(i);
        } else if (c.type === Cloud.Snow && w.mat[i] === Mat.Snow && w.depth[i]! < 3 && r.chance(0.05)) {
          w.depth[i] = w.depth[i]! + 1;
          w.touchVisual(i);
        }
      }
      if (c.type === Cloud.Storm && r.chance(0.006)) {
        const a = r.float() * Math.PI * 2;
        const d = Math.sqrt(r.float()) * c.r;
        this.lightning(sim, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
      }
    }
  }

  spawnCloud(x: number, y: number, r: number, type: number, life: number): void {
    if (this.clouds.length >= 8) this.clouds.shift();
    this.clouds.push({ x, y, r, type, life, vx: this.rng.range(-0.03, 0.03), vy: this.rng.range(-0.03, 0.03) });
  }

  lightning(sim: Simulation, x: number, y: number): void {
    const w = sim.world;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!w.inside(cx, cy)) return;
    this.flash = 4;
    const i = cy * w.w + cx;
    if (w.mat[i] !== Mat.Water) {
      w.fire[i] = Math.max(w.fire[i]!, 7);
      w.heat[i] = Math.max(w.heat[i]!, 150);
      w.wake(i, 40);
    }
    const cr = sim.creatures;
    cr.grid.query(x, y, 2, (j) => {
      if (Math.hypot(cr.e.x[j]! - x, cr.e.y[j]! - y) < 1.6) cr.damage(j, 60, -1);
    });
  }

  private ecosystem(sim: Simulation, mul: number): void {
    const cr = sim.creatures;
    const w = sim.world;
    const r = this.rng;
    const limit = Math.round(w.n / 700);
    let animals = 0;
    for (const d of ANIMALS) animals += cr.speciesCount[d.id]!;
    for (const d of ANIMALS) {
      if (animals >= limit) break;
      const cap = cr.animalCap(d);
      if (cr.speciesCount[d.id]! >= Math.max(2, cap * 0.25)) continue;
      const want = SPECIES_BIOMES[d.id]!;
      for (let t = 0; t < 80; t++) {
        const c = r.int(w.n);
        const x = c % w.w;
        const y = Math.floor(c / w.w);
        if (!want.has(w.biome[c]!) || w.zone[c] !== 0 || w.mat[c] !== Mat.None) continue;
        if (sim.inView(x, y, 12)) continue;
        if (!passable(w, c, d.swim ? Mover.Swim : Mover.Walk)) continue;
        const n = Math.max(2, Math.round((1 + r.int(3)) * mul));
        const ids = cr.spawnGroup(d.id, x + 0.5, y + 0.5, n);
        animals += ids.length;
        if (ids.length) sim.emit({ kind: 'respawn', text: 'ev.respawn', args: { species: d.key }, x, y });
        break;
      }
    }
  }

  countPlants(w: World): number {
    let n = 0;
    for (let i = 0; i < w.n; i++) if (isPlant(w.obj[i]!)) n++;
    this.plantCount = n;
    return n;
  }

  save(sw: SaveWriter): void {
    sw.json('N.meta', { clouds: this.clouds, wind: this.wind, rng: Array.from(this.rng.getState()), eco: this.ecoTimer });
  }

  attachedSim: Simulation | null = null;

  load(r: SaveReader): void {
    const m = r.jsonOr<{ clouds: CloudState[]; wind: [number, number]; rng: number[]; eco: number } | null>('N.meta', null);
    if (!m) return;
    if (this.attachedSim) this.attachedSim.substances.wind = m.wind;
    this.clouds = m.clouds;
    this.wind = m.wind;
    this.rng.setState(m.rng);
    this.ecoTimer = m.eco;
  }
}
