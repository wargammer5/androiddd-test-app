import { species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import type { City } from './cities.ts';
import { Job } from './cities.ts';
import { Rng } from './rng.ts';
import { placeName } from './names.ts';
import { LUT_KINGDOM, LUT_UNIT, lutSet } from './palette.ts';
import { EFlag, Task } from './entities.ts';
import { TICKS_PER_PULSE } from './time.ts';
import { Mat, Biome } from './world.ts';
import { Mover, passable } from './pathfind.ts';
import { TRAIT_INDEX } from './creatures.ts';

export interface Kingdom {
  id: number;
  name: string;
  race: number;
  color: [number, number, number];
  color2: [number, number, number];
  symbol: number;
  pattern: number;
  capital: number;
  cities: number[];
  alive: boolean;
  founded: number;
  ruler: number;
  rulerName: string;
  rulers: number;
  treasury: number;
  army: number;
  pop: number;
  extra: Record<string, number>;
  history: string[];
}

export interface Expedition {
  units: number[];
  site: number;
  kingdom: number;
  race: number;
  from: number;
  started: number;
  sea: boolean;
}

export function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export class KingdomSystem implements System {
  readonly name = 'kingdoms';
  kingdoms: Kingdom[] = [];
  expeditions: Expedition[] = [];
  protected rng: Rng;

  constructor(protected sim: Simulation) {
    this.rng = sim.rng.fork(321);
  }

  isSettler(id: number): boolean {
    for (const x of this.expeditions) if (x.units.includes(id)) return true;
    return false;
  }

  get(id: number): Kingdom | null {
    const k = this.kingdoms[id];
    return k && k.alive ? k : null;
  }

  create(city: City, from?: Kingdom): Kingdom {
    const id = this.kingdoms.length;
    const hue = (id * 0.61803398875 + this.rng.float() * 0.12) % 1;
    const k: Kingdom = {
      id,
      name: placeName(this.rng.nextU32(), city.race),
      race: city.race,
      color: hsl(hue, 0.62 + this.rng.float() * 0.2, 0.48),
      color2: hsl((hue + 0.35 + this.rng.float() * 0.3) % 1, 0.45, 0.78),
      symbol: this.rng.int(16),
      pattern: this.rng.int(4),
      capital: city.id,
      cities: [],
      alive: true,
      founded: this.sim.tick,
      ruler: -1,
      rulerName: '',
      rulers: 0,
      treasury: 0,
      army: 0,
      pop: 0,
      extra: {},
      history: [],
    };
    if (from) k.extra.parent = from.id + 1;
    this.kingdoms.push(k);
    this.assignCity(city, k);
    this.sim.onKingdomCreated(k, from);
    return k;
  }

  assignCity(city: City, k: Kingdom): void {
    const old = this.kingdoms[city.kingdom];
    if (old && old !== k) {
      old.cities = old.cities.filter((c) => c !== city.id);
      if (old.capital === city.id) this.moveCapital(old);
      if (old.alive && old.cities.length === 0) this.fall(old);
    }
    city.kingdom = k.id;
    city.loyalty = 1;
    if (!k.cities.includes(city.id)) k.cities.push(city.id);
    if (k.capital < 0 || !this.sim.cities.city(k.capital)) k.capital = city.id;
    const w = this.sim.world;
    w.kingdomOfZone[city.id + 1] = (k.id % 255) + 1;
    const e = this.sim.creatures.e;
    for (let i = 0; i < e.high; i++)
      if (e.alive[i] && e.city[i] === city.id) {
        e.kingdom[i] = k.id;
        if (e.flags[i]! & EFlag.Ruler && k.ruler !== e.id(i)) e.flags[i] = e.flags[i]! & ~EFlag.Ruler;
      }
    for (let i = 0; i < w.n; i++) if (w.zone[i] === city.id + 1) w.touchVisual(i);
    this.sim.lutDirty = true;
  }

  moveCapital(k: Kingdom): void {
    const cs = k.cities.map((c) => this.sim.cities.city(c)).filter((c): c is City => !!c);
    cs.sort((a, b) => b.pop - a.pop);
    k.capital = cs[0]?.id ?? -1;
    if (k.capital >= 0) this.log(k, `capital:${cs[0]!.name}`);
  }

  fall(k: Kingdom): void {
    if (!k.alive) return;
    k.alive = false;
    const e = this.sim.creatures.e;
    const ri = e.index(k.ruler);
    if (ri >= 0) e.flags[ri] = e.flags[ri]! & ~EFlag.Ruler;
    this.sim.onKingdomFell(k);
    this.sim.emit({ kind: 'kingdomFell', text: 'ev.kingdomFell', args: { kingdom: k.name }, important: true });
  }

  log(k: Kingdom, h: string): void {
    k.history.push(`${this.sim.tick}:${h}`);
    if (k.history.length > 40) k.history.shift();
  }

  writeLut(lut: Uint8Array): void {
    for (const k of this.kingdoms) {
      const idx = (k.id % 255) + 1;
      lutSet(lut, LUT_KINGDOM, idx, k.color);
      lutSet(lut, LUT_UNIT, idx, k.color);
    }
  }

  step(sim: Simulation): void {
    const tick = sim.tick;
    if (tick % 24 === 5) this.expeditionStep();
    if (tick % TICKS_PER_PULSE !== 90) return;
    for (const k of this.kingdoms) {
      if (!k.alive) continue;
      k.cities = k.cities.filter((c) => {
        const city = sim.cities.city(c);
        return city && city.kingdom === k.id;
      });
      if (k.cities.length === 0) {
        this.fall(k);
        continue;
      }
      if (!sim.cities.city(k.capital)) this.moveCapital(k);
      this.ensureRuler(k);
      this.economy(k);
      this.loyalty(k);
      if (sim.laws.cityGrowth) this.colonize(k);
    }
  }

  ensureRuler(k: Kingdom): void {
    const e = this.sim.creatures.e;
    if (e.index(k.ruler) >= 0) return;
    const capital = this.sim.cities.city(k.capital);
    if (!capital) return;
    const heir = this.sim.findHeir(k);
    let best = heir;
    if (best < 0) {
      let bs = -1;
      const leader = TRAIT_INDEX.get('leader');
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.city[i] !== capital.id) continue;
        if (e.age[i]! < SPECIES[e.species[i]!]!.maturity) continue;
        const s = e.level[i]! * 2 + e.age[i]! * 0.05 + (leader !== undefined && e.hasTrait(i, leader) ? 6 : 0) + e.kills[i]! * 0.3;
        if (s > bs) {
          bs = s;
          best = i;
        }
      }
    }
    if (best < 0) return;
    const hadRuler = k.rulers > 0;
    k.ruler = e.id(best);
    k.rulerName = this.sim.creatures.unitName(best);
    k.rulers++;
    e.flags[best] = e.flags[best]! | EFlag.Ruler;
    e.addHistory(best, `event:hist.crowned:${k.name}`);
    this.log(k, `ruler:${k.rulerName}`);
    this.sim.onNewRuler(k, best, hadRuler);
    this.sim.emit({ kind: 'ruler', text: hadRuler ? 'ev.newRuler' : 'ev.firstRuler', args: { kingdom: k.name, name: k.rulerName }, x: e.x[best], y: e.y[best], important: true });
  }

  private economy(k: Kingdom): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    let pop = 0;
    let army = 0;
    for (const cid of k.cities) {
      const c = sim.cities.city(cid)!;
      pop += c.pop;
      army += c.warriors;
      const rate = (c.techs.includes('banking') ? 0.06 : 0.04) * (1 + (sim.rulerMod(k, 'tax') ?? 0));
      const tax = c.pop * rate;
      k.treasury += tax;
      c.happiness = Math.max(0, c.happiness - rate * 0.2);
    }
    const upkeep = army * 0.02;
    k.treasury = Math.max(0, k.treasury - upkeep);
    k.pop = pop;
    k.army = army;
    if (k.treasury > 20) {
      const capital = sim.cities.city(k.capital);
      if (capital && capital.store.room() > 5) {
        const g = Math.floor(k.treasury / 10);
        k.treasury -= capital.store.add('gold', g, 'treasury') ;
      }
    }
    void e;
  }

  private loyalty(k: Kingdom): void {
    const sim = this.sim;
    const capital = sim.cities.city(k.capital);
    if (!capital) return;
    const w = sim.world;
    for (const cid of k.cities) {
      const c = sim.cities.city(cid)!;
      if (c.id === capital.id) {
        c.loyalty = 1;
        continue;
      }
      const dist = Math.hypot((c.center % w.w) - (capital.center % w.w), Math.floor(c.center / w.w) - Math.floor(capital.center / w.w));
      const sameCulture = c.culture < 0 || c.culture === capital.culture ? 0 : 0.03;
      const sameReligion = c.religion < 0 || c.religion === capital.religion ? 0 : 0.02;
      const drift = 0.008 + dist / 12000 + sameCulture + sameReligion + (1 - c.happiness) * 0.02 - (sim.rulerMod(k, 'loyalty') ?? 0) * 0.02 - (c.pop < capital.pop * 0.5 ? 0.01 : 0);
      const restore = 0.012 + (c.buildings.some((b) => b.done && b.type === 5) ? 0.005 : 0);
      c.loyalty = Math.max(0, Math.min(1, c.loyalty - drift + restore * (c.happiness > 0.5 ? 1 : 0.3)));
      if (c.loyalty < 0.15 && c.pop >= 8 && sim.laws.rebellions && this.rng.chance(0.4)) this.rebel(c, k);
    }
  }

  rebel(c: City, from: Kingdom): Kingdom {
    const sim = this.sim;
    const nk = this.create(c, from);
    this.log(from, `rebellion:${c.name}`);
    this.log(nk, `independence:${from.name}`);
    sim.emit({ kind: 'rebellion', text: 'ev.rebellion', args: { city: c.name, kingdom: from.name, newKingdom: nk.name }, x: c.center % sim.world.w, y: Math.floor(c.center / sim.world.w), important: true });
    sim.onRebellion(c, from, nk);
    return nk;
  }

  private colonize(k: Kingdom): void {
    const sim = this.sim;
    if (this.expeditions.some((x) => x.kingdom === k.id)) return;
    if (k.cities.length >= 12) return;
    for (const cid of k.cities) {
      const c = sim.cities.city(cid)!;
      if (c.pop < 22 || c.pop < c.housing * 0.85) continue;
      if (!this.rng.chance(0.35)) continue;
      const land = this.findColonySite(c, false);
      const hasPort = c.buildings.some((b) => b.done && b.type === 9) && c.techs.includes('sailing');
      const site = land >= 0 ? land : hasPort ? this.findColonySite(c, true) : -1;
      if (site < 0) continue;
      this.launch(c, k, site, land < 0);
      return;
    }
  }

  findColonySite(c: City, sea: boolean): number {
    const sim = this.sim;
    const w = sim.world;
    const cx = c.center % w.w;
    const cy = Math.floor(c.center / w.w);
    const want = new Set(SPECIES[c.race]!.biomes);
    const keys = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];
    let best = -1;
    let bs = -1;
    const minR = sea ? 30 : 22;
    const maxR = sea ? Math.min(160, w.w / 2) : 55;
    for (let t = 0; t < 60; t++) {
      const a = this.rng.float() * Math.PI * 2;
      const r = this.rng.range(minR, maxR);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!w.inside(x, y)) continue;
      const i = y * w.w + x;
      if (w.zone[i] !== 0 || w.mat[i] !== Mat.None || w.biome[i] === Biome.Mountain) continue;
      if (this.zoneNear(x, y, 12)) continue;
      if (!sea) {
        const p = sim.creatures.pf.coarse(c.center, i, Mover.Walk, sim.tick, 1500);
        if (!p) continue;
      } else if (!this.coastal(x, y)) continue;
      const s = (want.has(keys[w.biome[i]!]!) ? 2 : 0) + this.rng.float();
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    return best;
  }

  private coastal(x: number, y: number): boolean {
    const w = this.sim.world;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (!w.inside(x + dx, y + dy)) continue;
        const j = (y + dy) * w.w + x + dx;
        if (w.mat[j] === Mat.Water && w.depth[j]! >= 3) return true;
      }
    return false;
  }

  private zoneNear(x: number, y: number, r: number): boolean {
    const w = this.sim.world;
    for (let dy = -r; dy <= r; dy += 3)
      for (let dx = -r; dx <= r; dx += 3) if (w.inside(x + dx, y + dy) && w.zone[(y + dy) * w.w + x + dx] !== 0) return true;
    return false;
  }

  private launch(c: City, k: Kingdom, site: number, sea: boolean): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    const units: number[] = [];
    const want = 5;
    for (let i = 0; i < e.high && units.length < want; i++) {
      if (!e.alive[i] || e.city[i] !== c.id) continue;
      if (e.flags[i]! & EFlag.Ruler) continue;
      if (e.age[i]! < SPECIES[c.race]!.maturity) continue;
      units.push(i);
    }
    if (units.length < 3) return;
    for (const i of units) {
      e.city[i] = -1;
      e.job[i] = Job.None;
      e.home[i] = site;
      if (sea) e.flags[i] = e.flags[i]! | EFlag.Boat;
    }
    if (sea) {
      const port = c.buildings.find((b) => b.done && b.type === 9);
      const water = port ? sim.creatures.pf.nearestPassable(port.cell % sim.world.w, Math.floor(port.cell / sim.world.w), Mover.Boat, 3) : null;
      if (water !== null)
        for (const i of units) {
          e.x[i] = (water % sim.world.w) + 0.5;
          e.y[i] = Math.floor(water / sim.world.w) + 0.5;
        }
    }
    this.expeditions.push({ units: units.map((i) => e.id(i)), site, kingdom: k.id, race: c.race, from: c.id, started: sim.tick, sea });
    sim.emit({ kind: 'colony', text: sea ? 'ev.sailing' : 'ev.settlers', args: { city: c.name, kingdom: k.name }, x: c.center % sim.world.w, y: Math.floor(c.center / sim.world.w) });
  }

  private expeditionStep(): void {
    const sim = this.sim;
    const cr = sim.creatures;
    const e = cr.e;
    const w = sim.world;
    for (let k = this.expeditions.length - 1; k >= 0; k--) {
      const x = this.expeditions[k]!;
      const alive = x.units.map((id) => e.index(id)).filter((i) => i >= 0);
      if (alive.length === 0) {
        this.expeditions.splice(k, 1);
        continue;
      }
      const tx = x.site % w.w;
      const ty = Math.floor(x.site / w.w);
      const lead = alive[0]!;
      const dist = Math.hypot(e.x[lead]! - tx, e.y[lead]! - ty);
      let target = x.site;
      if (x.sea && dist > 3) {
        const shore = cr.pf.nearestPassable(tx, ty, Mover.Boat, 6);
        if (shore !== null) target = shore;
      }
      const arrived = dist < 4 || (x.sea && Math.hypot(e.x[lead]! - (target % w.w), e.y[lead]! - Math.floor(target / w.w)) < 2);
      const timeout = sim.tick - x.started > TICKS_PER_PULSE * 6;
      if (arrived || timeout) {
        for (const i of alive) {
          if (e.flags[i]! & EFlag.Boat) {
            e.flags[i] = e.flags[i]! & ~EFlag.Boat;
            const land = cr.pf.nearestPassable(e.x[i]!, e.y[i]!, Mover.Walk, 6);
            if (land !== null) {
              e.x[i] = (land % w.w) + 0.5;
              e.y[i] = Math.floor(land / w.w) + 0.5;
            }
          }
        }
        let site = arrived ? x.site : Math.floor(e.y[lead]!) * w.w + Math.floor(e.x[lead]!);
        if (w.zone[site] !== 0 || w.mat[site] !== Mat.None) site = sim.cities.findCitySite(e.x[lead]!, e.y[lead]!, x.race, 8);
        const kingdom = this.get(x.kingdom);
        if (site >= 0) {
          const c = sim.cities.newCity(x.race, site, alive, kingdom ?? undefined);
          if (c && kingdom) {
            this.log(kingdom, `colony:${c.name}`);
            sim.emit({ kind: 'colonyFounded', text: 'ev.colony', args: { city: c.name, kingdom: kingdom.name }, x: site % w.w, y: Math.floor(site / w.w), important: x.sea });
          }
        }
        this.expeditions.splice(k, 1);
        continue;
      }
      for (const i of alive) {
        if (e.task[i] === Task.Sleep && !(e.flags[i]! & EFlag.Boat)) continue;
        e.task[i] = Task.Migrate;
        e.taskTimer[i] = 60;
        e.taskTarget[i] = target;
        const p = cr.paths[i];
        if (!p || cr.pathPos[i]! >= p.length) {
          if (!passable(w, target, cr.mover(i))) continue;
          cr.goTo(i, target);
        }
      }
    }
  }

  info(id: number): unknown {
    const k = this.kingdoms[id];
    if (!k) return null;
    const sim = this.sim;
    return {
      ...k,
      raceKey: SPECIES[k.race]!.key,
      cityList: k.cities.map((c) => {
        const city = sim.cities.cities[c];
        return city ? { id: city.id, name: city.name, pop: city.pop, loyalty: Math.round(city.loyalty * 100), capital: city.id === k.capital } : null;
      }),
      extraInfo: sim.kingdomExtra(k),
    };
  }

  list(): unknown[] {
    return this.kingdoms
      .filter((k) => k.alive)
      .map((k) => ({ id: k.id, name: k.name, race: SPECIES[k.race]!.key, color: k.color, color2: k.color2, symbol: k.symbol, pattern: k.pattern, cities: k.cities.length, pop: k.pop, army: k.army, ruler: k.rulerName }));
  }

  save(w: SaveWriter): void {
    w.json('KING', { kingdoms: this.kingdoms, expeditions: this.expeditions, rng: Array.from(this.rng.getState()) });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ kingdoms: Kingdom[]; expeditions?: Expedition[]; rng: number[] } | null>('KING', null);
    if (!m) return;
    this.kingdoms = m.kingdoms.map((k) => Object.assign({ rulers: 0, army: 0, pop: 0, pattern: 0, history: [] as string[] }, k));
    this.expeditions = m.expeditions ?? [];
    this.rng.setState(m.rng);
    const w = this.sim.world;
    for (const c of this.sim.cities.cities) if (c.kingdom >= 0) w.kingdomOfZone[c.id + 1] = (c.kingdom % 255) + 1;
  }

  hash(): number {
    let h = 0;
    for (const k of this.kingdoms) h = (Math.imul(h, 31) + k.cities.length * 17 + Math.round(k.treasury) + (k.alive ? 1 : 0)) | 0;
    return (h ^ this.expeditions.length) >>> 0;
  }
}
