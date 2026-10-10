import { species as SPECIES, traits as TRAITS, type SpeciesDef } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import { Entities, SpatialHash, ENT_CAP, MAX_TRAITS, Task, Anim, EFlag } from './entities.ts';
import { Pathfinder, Mover, passable } from './pathfind.ts';
import { Biome, Mat } from './world.ts';
import { TICKS_PER_YEAR, isNight } from './time.ts';
import { personName } from './names.ts';
import { isPlant, plantStage, plantType, PlantType, Stage, plantObj } from './objects.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import { Rng } from './rng.ts';

export const TRAIT_INDEX = new Map(TRAITS.map((t, i) => [t.key, i]));
export const BOAT_SPRITE = 30;
const BIOME_KEYS = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];
const SPECIES_BIOMES = SPECIES.map((s) => new Set(s.biomes.map((b) => BIOME_KEYS.indexOf(b))));
export const SPECIES_INDEX = new Map(SPECIES.map((s) => [s.key, s.id]));

const FERTILE = new Set([Biome.Plains, Biome.Forest, Biome.Jungle, Biome.Savanna, Biome.Swamp, Biome.Magic]);

export interface CivHooks {
  workScore(sim: Simulation, i: number): number;
  startWork(sim: Simulation, i: number): boolean;
  actWork(sim: Simulation, i: number): boolean;
  eatFromStore(sim: Simulation, i: number): boolean;
  hostile(sim: Simulation, a: number, b: number): boolean;
  onDeath(sim: Simulation, i: number, killer: number): void;
  onBirth(sim: Simulation, child: number, mother: number): void;
  popCap(sim: Simulation, i: number): number;
  homeTarget(sim: Simulation, i: number): number;
}

export interface UnitCardData {
  id: number;
  name: string;
  species: string;
  kind: string;
  age: number;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  dmg: number;
  armor: number;
  speed: number;
  vision: number;
  crit: number;
  hunger: number;
  energy: number;
  fatigue: number;
  social: number;
  mood: number;
  task: number;
  kills: number;
  children: number;
  traits: string[];
  sex: number;
  mother: string | null;
  father: string | null;
  city: number;
  kingdom: number;
  culture: number;
  religion: number;
  clan: number;
  job: number;
  carry: number;
  carryAmt: number;
  history: string[];
  x: number;
  y: number;
  favorite: boolean;
  flags: number;
  extra?: Record<string, string | number>;
}

export class Creatures implements System {
  readonly name = 'creatures';
  readonly e = new Entities();
  readonly grid: SpatialHash;
  readonly pf: Pathfinder;
  readonly paths: (Int32Array | null)[] = new Array(ENT_CAP).fill(null);
  readonly pathPos = new Uint16Array(ENT_CAP);
  readonly waypoints: (number[] | null)[] = new Array(ENT_CAP).fill(null);
  readonly wpPos = new Uint16Array(ENT_CAP);
  readonly speciesCount = new Int32Array(64);
  civ: CivHooks | null = null;
  followId = -1;
  thinkEvery = 6;
  deathsThisTick: number[] = [];
  private rng: Rng;
  pathBudget = 20000;

  constructor(private sim: Simulation) {
    this.grid = new SpatialHash(sim.world.w, sim.world.h);
    this.pf = new Pathfinder(sim.world);
    this.rng = sim.rng.fork(77);
  }

  def(i: number): SpeciesDef {
    return SPECIES[this.e.species[i]!]!;
  }

  mover(i: number): Mover {
    const d = this.def(i);
    if (d.flies) return Mover.Fly;
    if (this.e.flags[i]! & EFlag.Boat) return Mover.Boat;
    return d.swim ? Mover.Swim : Mover.Walk;
  }

  spawn(sp: number, x: number, y: number, opts: { mother?: number; father?: number; age?: number } = {}): number {
    const e = this.e;
    const d = SPECIES[sp];
    if (!d) return -1;
    const w = this.sim.world;
    if (!w.inside(Math.floor(x), Math.floor(y))) return -1;
    const i = e.spawn();
    if (i < 0) return -1;
    const r = this.rng;
    e.species[i] = sp;
    e.x[i] = e.px[i] = x;
    e.y[i] = e.py[i] = y;
    e.tx[i] = -1;
    e.ty[i] = -1;
    e.sex[i] = r.int(2);
    e.age[i] = opts.age ?? (opts.mother !== undefined ? 0 : d.maturity + r.float() * Math.max(1, d.lifespan * 0.3));
    e.born[i] = this.sim.tick - Math.floor(e.age[i]! * TICKS_PER_YEAR);
    e.hunger[i] = r.float() * 0.3;
    e.energy[i] = 0.7 + r.float() * 0.3;
    e.fatigue[i] = r.float() * 0.2;
    e.social[i] = r.float() * 0.3;
    e.mood[i] = 0.6;
    e.nameSeed[i] = r.nextU32();
    const traits: number[] = [];
    const mi = opts.mother !== undefined ? e.index(opts.mother) : -1;
    const fi = opts.father !== undefined ? e.index(opts.father) : -1;
    const parentTraits = [...(mi >= 0 ? e.traitList(mi) : []), ...(fi >= 0 ? e.traitList(fi) : [])];
    for (const t of parentTraits) {
      if (traits.length >= MAX_TRAITS || traits.includes(t)) continue;
      if (r.chance(TRAITS[t]!.inherit)) traits.push(t);
    }
    const want = 2 + r.int(3);
    let guard = 0;
    while (traits.length < want && guard++ < 20) {
      let t: number;
      if (d.traitPool.length && r.chance(0.6)) t = TRAIT_INDEX.get(r.pick(d.traitPool))!;
      else t = r.int(TRAITS.length);
      const td = TRAITS[t]!;
      if (td.rare && !r.chance(mi >= 0 ? 0.04 : 0.1)) continue;
      const opp = TRAIT_INDEX.get(td.opposite);
      if (traits.includes(t) || (opp !== undefined && traits.includes(opp))) continue;
      traits.push(t);
    }
    if (mi >= 0 && r.chance(0.05)) {
      const t = r.int(TRAITS.length);
      const opp = TRAIT_INDEX.get(TRAITS[t]!.opposite);
      if (!traits.includes(t) && !(opp !== undefined && traits.includes(opp)) && traits.length < MAX_TRAITS) traits.push(t);
    }
    traits.forEach((t, k) => (e.traits[i * MAX_TRAITS + k] = t));
    this.applyStats(i);
    e.hp[i] = e.maxHp[i]!;
    if (mi >= 0) {
      e.mother[i] = e.id(mi);
      e.children[mi] = e.children[mi]! + 1;
      e.city[i] = e.city[mi]!;
      e.kingdom[i] = e.kingdom[mi]!;
      e.culture[i] = e.culture[mi]!;
      e.religion[i] = e.religion[mi]!;
      e.clan[i] = e.clan[mi]!;
      e.home[i] = e.home[mi]!;
    }
    if (fi >= 0) {
      e.father[i] = e.id(fi);
      e.children[fi] = e.children[fi]! + 1;
    }
    this.speciesCount[sp]!++;
    this.paths[i] = null;
    this.waypoints[i] = null;
    return i;
  }

  applyStats(i: number): void {
    const e = this.e;
    const d = this.def(i);
    const m: Record<string, number> = { hp: 1, dmg: 1, armor: 1, speed: 1, vision: 1, crit: 1, xp: 1, hunger: 1, fatigue: 1, fertility: 1, lifespan: 1 };
    for (const t of e.traitList(i)) {
      const mods = TRAITS[t]!.mods;
      if (mods) for (const k in mods) m[k] = (m[k] ?? 1) * mods[k]!;
    }
    const lv = 1 + (e.level[i]! - 1) * 0.08;
    const ratio = e.maxHp[i]! > 0 ? e.hp[i]! / e.maxHp[i]! : 1;
    e.maxHp[i] = d.hp * m.hp! * lv;
    e.hp[i] = Math.max(1, e.maxHp[i]! * ratio);
    e.dmg[i] = d.dmg * m.dmg! * lv;
    e.armor[i] = d.armor * m.armor!;
    e.speed[i] = d.speed * m.speed!;
    e.vision[i] = d.vision * m.vision!;
    e.crit[i] = 0.05 * m.crit!;
    e.xpRate[i] = m.xp!;
    e.hungerRate[i] = m.hunger!;
    e.fatigueRate[i] = m.fatigue!;
    e.fertility[i] = d.fertility * m.fertility!;
    e.lifespan[i] = d.lifespan * m.lifespan!;
  }

  unitName(i: number): string {
    const e = this.e;
    const cached = e.names.get(i);
    if (cached) return cached;
    const d = this.def(i);
    return d.kind === 'civ' ? personName(e.nameSeed[i]!, d.race) : '';
  }

  aiMod(i: number, key: string): number {
    let v = 0;
    for (const t of this.e.traitList(i)) {
      const a = TRAITS[t]!.ai;
      if (a && a[key] !== undefined) v += a[key]!;
    }
    return v;
  }

  hostile(a: number, b: number): boolean {
    const e = this.e;
    if (a === b) return false;
    const da = this.def(a);
    const db = this.def(b);
    if (e.flags[a]! & EFlag.Controlled) return true;
    if (da.kind === 'monster' && db.kind !== 'monster') return true;
    if (db.kind === 'monster' && da.kind !== 'monster') return da.kind === 'civ';
    if (da.kind === 'monster' && db.kind === 'monster') return da.id !== db.id;
    if (this.civ && da.kind === 'civ' && db.kind === 'civ') return this.civ.hostile(this.sim, a, b);
    return false;
  }

  isPrey(a: number, b: number): boolean {
    const da = this.def(a);
    const db = this.def(b);
    if (da.diet === 'herb' || da.diet === 'none') return false;
    if (db.kind === 'monster') return false;
    if (da.kind === 'civ') return db.kind === 'animal' && db.diet !== 'carn' && db.hp < 60;
    if (db.kind === 'civ') return da.dmg >= 9 && this.e.hunger[a]! > 0.75;
    return db.id !== da.id && db.hp <= da.hp * 1.2 && (db.diet !== 'carn' || db.hp < da.hp * 0.6);
  }

  step(sim: Simulation): void {
    const e = this.e;
    const w = sim.world;
    this.grid.rebuild(e);
    this.pf.nodesThisTick = 0;
    this.deathsThisTick.length = 0;
    const tick = sim.tick;
    const night = isNight(tick);
    const laws = sim.laws;
    const aiOn = laws.ai;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      e.px[i] = e.x[i]!;
      e.py[i] = e.y[i]!;
      if (e.cooldown[i]! > 0) e.cooldown[i]!--;
      const d = SPECIES[e.species[i]!]!;
      if (d.kind !== 'monster' || d.diet !== 'none') {
        if (laws.hunger && d.diet !== 'none') e.hunger[i] = Math.min(1, e.hunger[i]! + (e.hungerRate[i]! / 900) * (d.kind === 'animal' ? 1.2 : 1));
        if (e.task[i] !== Task.Sleep) e.energy[i] = Math.max(0, e.energy[i]! - 1 / 240);
        e.social[i] = Math.min(1, e.social[i]! + 1 / 700);
      }
      if ((tick + i) % 12 === 0) this.slow(i, d);
      if (!e.alive[i]) continue;
      const ci = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
      if (w.fire[ci]! > 0 && !(d.key === 'demon' || d.key === 'dragon')) {
        if ((tick + i) % 6 === 0) this.damage(i, 1.5 + w.fire[ci]! * 0.6, -1);
        if (e.task[i] !== Task.Flee) this.fleeFire(i);
      }
      if (w.mat[ci] === Mat.Lava && w.depth[ci]! > 0 && !d.flies && d.key !== 'demon') this.damage(i, 25, -1);
      if (w.mat[ci] === Mat.Acid && w.depth[ci]! > 0 && !d.flies) this.damage(i, 3, -1);
      if (!e.alive[i]) continue;
      if (!(e.flags[i]! & EFlag.Controlled)) {
        const fast = sim.inView(e.x[i]!, e.y[i]!, 8) ? 3 : this.thinkEvery;
        const timer = --e.taskTimer[i]!;
        if (aiOn && ((tick + i) % fast === 0 || timer <= 0)) this.think(i, night);
      }
      this.act(i, night);
    }
  }

  fleeFire(i: number): void {
    const e = this.e;
    const w = this.sim.world;
    const x0 = Math.floor(e.x[i]!);
    const y0 = Math.floor(e.y[i]!);
    let fx = 0;
    let fy = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        if (!w.inside(x0 + dx, y0 + dy)) continue;
        if (w.fire[(y0 + dy) * w.w + x0 + dx]! > 0) {
          fx += dx;
          fy += dy;
        }
      }
    const len = Math.hypot(fx, fy) || 1;
    const tx = Math.max(0, Math.min(w.w - 1, Math.round(x0 - (fx / len) * 8 + this.rng.range(-2, 2))));
    const ty = Math.max(0, Math.min(w.h - 1, Math.round(y0 - (fy / len) * 8 + this.rng.range(-2, 2))));
    const c = this.pf.nearestPassable(tx, ty, this.mover(i), 4);
    if (c === null) return;
    this.setTask(i, Task.Flee, 36, -1);
    if (!this.straight(i, c)) this.goTo(i, c);
  }

  private slow(i: number, d: SpeciesDef): void {
    const e = this.e;
    const sim = this.sim;
    if (sim.laws.aging && d.lifespan < 5000) {
      e.age[i] = e.age[i]! + 12 / TICKS_PER_YEAR;
      if (e.age[i]! > e.lifespan[i]! && this.rng.chance(0.02 + (e.age[i]! - e.lifespan[i]!) * 0.4)) {
        this.die(i, -1, 'age');
        return;
      }
    }
    if (e.hunger[i]! >= 1 && sim.laws.hunger) {
      this.damage(i, e.maxHp[i]! * 0.02, -1);
      if (!e.alive[i]) return;
    }
    if (e.hunger[i]! < 0.6 && e.hp[i]! < e.maxHp[i]!) e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + e.maxHp[i]! * 0.01);
    const w = sim.world;
    const ci = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    if (!passable(w, ci, this.mover(i))) {
      const p = this.pf.nearestPassable(e.x[i]!, e.y[i]!, this.mover(i), 6);
      if (p !== null) {
        e.x[i] = (p % w.w) + 0.5;
        e.y[i] = Math.floor(p / w.w) + 0.5;
        this.paths[i] = null;
      } else if (w.mat[ci] === Mat.Water && !d.swim && !d.flies) this.damage(i, e.maxHp[i]! * 0.08, -1);
    }
    const cold = w.heat[ci]! < -15 && d.key !== 'undead' && !SPECIES_BIOMES[d.id]!.has(Biome.Snow);
    const hot = w.heat[ci]! > 60 && d.key !== 'demon' && d.key !== 'dragon';
    if (cold || hot) this.damage(i, e.maxHp[i]! * 0.01, -1);
    let mood = 0.6 - e.hunger[i]! * 0.3 - (1 - e.energy[i]!) * 0.15 - e.social[i]! * 0.15 + (e.hp[i]! / e.maxHp[i]! - 1) * 0.3;
    if (e.city[i]! >= 0) mood += 0.1;
    e.mood[i] = Math.max(0, Math.min(1, mood));
  }

  damage(i: number, amount: number, by: number): void {
    const e = this.e;
    if (!e.alive[i]) return;
    const a = Math.max(amount * 0.15, amount - e.armor[i]!);
    e.hp[i] = e.hp[i]! - a;
    if (by >= 0) e.attacker[i] = e.id(by);
    if (e.hp[i]! <= 0) this.die(i, by, by >= 0 ? 'killed' : 'hazard');
  }

  readonly deathStats: Record<string, number> = {};

  die(i: number, killer: number, cause: string): void {
    const e = this.e;
    if (!e.alive[i]) return;
    if (this.def(i).kind === 'civ') {
      const key = cause === 'hazard' ? this.hazardCause(i) : cause === 'killed' && killer >= 0 ? 'killed:' + this.def(killer).key : cause;
      this.deathStats[key] = (this.deathStats[key] ?? 0) + 1;
    }
    const sim = this.sim;
    const d = this.def(i);
    if (killer >= 0) sim.onUnitKilled(i, killer);
    if (killer >= 0 && e.alive[killer]) {
      e.kills[killer]!++;
      this.gainXp(killer, 3 + e.level[i]! * 2 + (d.kind === 'monster' ? 20 : 0));
      if (d.kind === 'civ' || d.kind === 'monster') e.addHistory(killer, `kill:${this.unitName(i) || d.key}:${sim.tick}`);
      if (e.hunger[killer]! > 0.3 && this.isPrey(killer, i)) e.hunger[killer] = Math.max(0, e.hunger[killer]! - 0.7);
    }
    const important = (e.flags[i]! & (EFlag.Favorite | EFlag.Ruler | EFlag.Hero)) !== 0 || d.kind === 'monster';
    if (important || i === e.index(this.followId)) sim.emit({ kind: 'death', text: 'ev.death', args: { name: this.unitName(i) || d.key, species: d.key, cause }, x: e.x[i], y: e.y[i], important });
    const w = sim.world;
    const ci = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    this.civ?.onDeath(sim, i, killer);
    sim.onUnitDeath(i, ci);
    this.speciesCount[e.species[i]!]!--;
    this.deathsThisTick.push(i);
    this.paths[i] = null;
    this.waypoints[i] = null;
    e.kill(i);
  }

  private hazardCause(i: number): string {
    const e = this.e;
    const w = this.sim.world;
    const c = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    if (e.hunger[i]! >= 1) return 'starve';
    if (w.fire[c]! > 0) return 'fire';
    if (w.mat[c] === Mat.Lava) return 'lava';
    if (w.mat[c] === Mat.Water) return 'drown';
    if (w.heat[c]! < -15) return 'cold';
    if (w.heat[c]! > 60) return 'heat';
    return 'other';
  }

  gainXp(i: number, amount: number): void {
    const e = this.e;
    e.xp[i] = e.xp[i]! + amount * e.xpRate[i]!;
    const need = 10 * e.level[i]! * e.level[i]!;
    if (e.xp[i]! >= need && e.level[i]! < 30) {
      e.xp[i] = e.xp[i]! - need;
      e.level[i]!++;
      this.applyStats(i);
      if (e.level[i]! >= 10 && !(e.flags[i]! & EFlag.Hero)) {
        e.flags[i] = e.flags[i]! | EFlag.Hero;
        this.sim.emit({ kind: 'hero', text: 'ev.hero', args: { name: this.unitName(i) }, x: e.x[i], y: e.y[i], important: true });
      }
    }
  }

  private setTask(i: number, task: Task, timer: number, target = -1): void {
    const e = this.e;
    if (e.task[i] !== task || e.taskTarget[i] !== target) {
      e.stuck[i] = 0;
      e.repaths[i] = 0;
      e.bestDist[i] = 1e9;
    }
    e.task[i] = task;
    e.taskTimer[i] = timer;
    e.taskTarget[i] = target;
  }

  private nearestEnemy(i: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    const x = e.x[i]!;
    const y = e.y[i]!;
    this.grid.query(x, y, r, (j) => {
      if (j === i || !e.alive[j]) return;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd && this.hostile(i, j)) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  private threatNear(i: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    const x = e.x[i]!;
    const y = e.y[i]!;
    this.grid.query(x, y, r, (j) => {
      if (j === i || !e.alive[j]) return;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bd) return;
      if (this.hostile(j, i) || (this.isPrey(j, i) && e.hunger[j]! > 0.4) || e.attacker[i] === e.id(j)) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  private findPrey(i: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    const x = e.x[i]!;
    const y = e.y[i]!;
    this.grid.query(x, y, r, (j) => {
      if (j === i || !e.alive[j]) return;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd && this.isPrey(i, j)) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  private findMate(i: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    const sp = e.species[i]!;
    const x = e.x[i]!;
    const y = e.y[i]!;
    this.grid.query(x, y, r, (j) => {
      if (j === i || !e.alive[j] || e.species[j] !== sp || e.sex[j] === e.sex[i]) return;
      if (e.age[j]! < SPECIES[sp]!.maturity || e.task[j] === Task.Sleep) return;
      if (e.kingdom[i]! >= 0 && e.kingdom[j]! >= 0 && e.kingdom[i] !== e.kingdom[j]) return;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  private findFriend(i: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    const x = e.x[i]!;
    const y = e.y[i]!;
    this.grid.query(x, y, r, (j) => {
      if (j === i || !e.alive[j] || e.species[j] !== e.species[i]) return;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd && d2 > 1) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  findFood(i: number, r: number): number {
    const w = this.sim.world;
    const e = this.e;
    const d = this.def(i);
    const x0 = Math.floor(e.x[i]!);
    const y0 = Math.floor(e.y[i]!);
    const rr = Math.ceil(r);
    let best = -1;
    let bd = 1e9;
    const off = (i * 7) % 5;
    for (let dy = -rr; dy <= rr; dy += 1)
      for (let dx = -rr + ((dy + off) & 1); dx <= rr; dx += 2) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!w.inside(x, y)) continue;
        const c = y * w.w + x;
        const o = w.obj[c]!;
        if (!isPlant(o)) continue;
        const st = plantStage(o);
        const pt = plantType(o);
        let ok = st === Stage.Fruiting;
        if (d.kind === 'animal' && (pt === PlantType.Flower || pt === PlantType.Berry) && st >= Stage.Young) ok = true;
        if (!ok) continue;
        const dd = dx * dx + dy * dy;
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
    return best;
  }

  private think(i: number, night: boolean): void {
    const e = this.e;
    const sim = this.sim;
    const d = this.def(i);
    const task = e.task[i]!;
    if (task === Task.Sleep && e.energy[i]! < 0.95 && (night || e.energy[i]! < 0.4)) {
      e.taskTimer[i] = 12;
      return;
    }
    if (task === Task.Rest && e.taskTimer[i]! > 0 && e.fatigue[i]! > 0.05) return;
    if (task === Task.Mate && e.taskTimer[i]! > 0) return;
    const hpR = e.hp[i]! / e.maxHp[i]!;
    const vision = e.vision[i]!;
    if (task === Task.Migrate && e.taskTimer[i]! > 0 && e.taskTarget[i]! >= 0 && e.hunger[i]! < 0.8 && e.energy[i]! > 0.2 && (this.paths[i] || this.waypoints[i]) && this.threatNear(i, 6) < 0) return;
    const mature = e.age[i]! >= d.maturity;
    let bestTask = Task.Wander as Task;
    let bestScore = 0.12 + this.aiMod(i, 'explore') * 0.2 + this.rng.float() * 0.05;
    let target = -1;
    const consider = (t: Task, s: number, tg = -1) => {
      if (s > bestScore) {
        bestScore = s;
        bestTask = t;
        target = tg;
      }
    };
    const threat = this.threatNear(i, Math.min(vision, 10));
    if (threat >= 0) {
      const strength = e.hp[i]! * e.dmg[i]!;
      const their = e.hp[threat]! * e.dmg[threat]!;
      const brave = this.aiMod(i, 'fight') - this.aiMod(i, 'flee');
      const fightS = (strength / (their + 1)) * 0.5 + brave + (d.kind === 'monster' ? 0.6 : 0) + (hpR - 0.5) * 0.4 + (e.attacker[i] === e.id(threat) ? 0.3 : 0);
      if (fightS > 0.55 || d.kind === 'monster') consider(Task.Fight, 0.75 + fightS * 0.2, e.id(threat));
      else consider(Task.Flee, 0.8 + (1 - hpR) * 0.4, e.id(threat));
    }
    if (d.kind === 'monster' || (d.kind === 'civ' && sim.laws.wars && (e.job[i] === 11 || e.kingdom[i]! >= 0))) {
      const enemy = this.nearestEnemy(i, vision);
      if (enemy >= 0) consider(Task.Fight, 0.55 + this.aiMod(i, 'fight') + (d.kind === 'monster' ? 0.3 : 0), e.id(enemy));
    }
    const hunger = e.hunger[i]!;
    if (hunger > 0.35 && d.diet !== 'none') {
      const urgency = Math.pow(hunger, 1.4) + this.aiMod(i, 'eat');
      if (this.civ && e.city[i]! >= 0 && this.civ.eatFromStore(sim, i)) {
        e.hunger[i] = 0;
        e.taskTimer[i] = 6;
      } else {
        if (d.diet !== 'carn') {
          const food = this.findFood(i, Math.min(vision, 9));
          if (food >= 0) consider(Task.Eat, urgency * 1.1, food);
          else if (d.kind === 'animal' && FERTILE.has(sim.world.biome[Math.floor(e.y[i]!) * sim.world.w + Math.floor(e.x[i]!)]!)) consider(Task.Eat, urgency * 0.8, -2);
        }
        if (d.diet !== 'herb') {
          const prey = this.findPrey(i, vision);
          if (prey >= 0) consider(Task.Hunt, urgency * 1.05, e.id(prey));
        }
        if (bestTask === Task.Wander && hunger > 0.6) consider(Task.Explore, 0.3 + hunger * 0.3);
      }
    }
    if (e.energy[i]! < 0.35 || (night && e.energy[i]! < 0.75)) consider(Task.Sleep, (1 - e.energy[i]!) * (night ? 1.1 : 0.8));
    if (e.fatigue[i]! > 0.7) consider(Task.Rest, e.fatigue[i]! * 0.75 + this.aiMod(i, 'rest'));
    if (e.social[i]! > 0.6 && d.kind !== 'monster') {
      const f = this.findFriend(i, vision);
      if (f >= 0) consider(Task.Social, e.social[i]! * 0.45 + this.aiMod(i, 'social'), e.id(f));
    }
    if (mature && sim.laws.reproduction && e.fertility[i]! > 0 && hunger < 0.6 && e.taskTimer[i]! > -1000000) {
      const cap = this.civ && d.kind === 'civ' ? this.civ.popCap(sim, i) : this.animalCap(d);
      if (this.speciesCount[d.id]! < cap && e.children[i]! < 12) {
        const m = this.findMate(i, vision);
        if (m >= 0) consider(Task.Mate, 0.32 + e.fertility[i]! * 0.25, e.id(m));
      }
    }
    if (this.civ && d.kind === 'civ') {
      const ws = this.civ.workScore(sim, i) + this.aiMod(i, 'work');
      consider(Task.Work, ws);
    }
    if (d.kind === 'animal' && !SPECIES_BIOMES[d.id]!.has(sim.world.biome[Math.floor(e.y[i]!) * sim.world.w + Math.floor(e.x[i]!)]!)) consider(Task.Migrate, 0.3);
    if (bestTask === task && target === e.taskTarget[i] && e.taskTimer[i]! > 0) return;
    if ((bestTask === Task.Wander || bestTask === Task.Explore || bestTask === Task.Migrate) && (task === Task.Wander || task === Task.Explore || task === Task.Migrate) && e.taskTimer[i]! > 0 && (this.paths[i] || this.waypoints[i])) return;
    if (bestTask === task && (task === Task.Hunt || task === Task.Fight || task === Task.Flee) && e.taskTimer[i]! > 0 && e.index(e.taskTarget[i]!) >= 0) return;
    if (bestTask === Task.Eat && task === Task.Eat && e.taskTimer[i]! > 0 && e.taskTarget[i]! >= 0 && isPlant(sim.world.obj[e.taskTarget[i]!]!)) return;
    switch (bestTask) {
      case Task.Sleep:
        this.setTask(i, Task.Sleep, 24);
        this.paths[i] = null;
        break;
      case Task.Rest:
        this.setTask(i, Task.Rest, 120 + this.rng.int(120));
        this.paths[i] = null;
        break;
      case Task.Work:
        if (this.civ && this.civ.startWork(sim, i)) this.setTask(i, Task.Work, 60, e.taskTarget[i]!);
        else this.wander(i, 8);
        break;
      case Task.Wander:
      case Task.Explore:
        this.wander(i, bestTask === Task.Explore ? 24 : 8);
        break;
      case Task.Migrate:
        this.migrate(i);
        break;
      default:
        this.setTask(i, bestTask, 48, target);
    }
  }

  animalCap(d: SpeciesDef): number {
    const n = this.sim.world.n;
    if (d.kind === 'monster') return 40;
    const base = (n / 65536) * (d.diet === 'carn' ? 10 : 24);
    return Math.max(6, Math.round(base * (d.hp > 80 ? 0.4 : 1)));
  }

  wander(i: number, r: number): void {
    const e = this.e;
    const w = this.sim.world;
    const home = this.civ ? this.civ.homeTarget(this.sim, i) : -1;
    let cx = e.x[i]!;
    let cy = e.y[i]!;
    if (home >= 0 && this.rng.chance(0.6)) {
      cx = (home % w.w) + 0.5;
      cy = Math.floor(home / w.w) + 0.5;
    }
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(cx + this.rng.range(-r, r));
      const y = Math.floor(cy + this.rng.range(-r, r));
      if (!w.inside(x, y)) continue;
      const c = y * w.w + x;
      if (!passable(w, c, this.mover(i))) continue;
      this.setTask(i, Task.Wander, 60 + this.rng.int(60), c);
      if (!this.straight(i, c)) this.goTo(i, c);
      return;
    }
    this.setTask(i, Task.Wander, 20, -1);
  }

  straight(i: number, cell: number): boolean {
    const e = this.e;
    const w = this.sim.world;
    let x0 = Math.floor(e.x[i]!);
    let y0 = Math.floor(e.y[i]!);
    const x1 = cell % w.w;
    const y1 = Math.floor(cell / w.w);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    if (dx > 40 || -dy > 40) return false;
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const out: number[] = [];
    const mode = this.mover(i);
    for (let n = 0; n < 100; n++) {
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
      const c = y0 * w.w + x0;
      if (!passable(w, c, mode)) return false;
      out.push(c);
    }
    e.tx[i] = x1;
    e.ty[i] = y1;
    this.paths[i] = Int32Array.from(out);
    this.pathPos[i] = 0;
    this.waypoints[i] = null;
    return true;
  }

  private migrate(i: number): void {
    const e = this.e;
    const w = this.sim.world;
    const d = this.def(i);
    const want = SPECIES_BIOMES[d.id]!;
    for (let k = 0; k < 12; k++) {
      const x = Math.floor(e.x[i]! + this.rng.range(-30, 30));
      const y = Math.floor(e.y[i]! + this.rng.range(-30, 30));
      if (!w.inside(x, y)) continue;
      const c = y * w.w + x;
      if (want.has(w.biome[c]!) && passable(w, c, this.mover(i))) {
        this.setTask(i, Task.Migrate, 240, c);
        this.goTo(i, c);
        return;
      }
    }
    this.wander(i, 16);
  }

  readonly pathStats = new Int32Array(32);

  goTo(i: number, cell: number): boolean {
    const e = this.e;
    this.pathStats[e.task[i]!]!++;
    const w = this.sim.world;
    const from = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    e.tx[i] = cell % w.w;
    e.ty[i] = Math.floor(cell / w.w);
    const dist = Math.abs(e.tx[i]! - Math.floor(e.x[i]!)) + Math.abs(e.ty[i]! - Math.floor(e.y[i]!));
    if (this.pf.nodesThisTick > this.pathBudget) {
      this.paths[i] = null;
      this.waypoints[i] = null;
      return false;
    }
    const mode = this.mover(i);
    if (mode === Mover.Fly) {
      this.paths[i] = new Int32Array([cell]);
      this.pathPos[i] = 0;
      this.waypoints[i] = null;
      return true;
    }
    if (dist > 40) {
      const wp = this.pf.coarse(from, cell, mode, this.sim.tick);
      if (!wp) {
        this.paths[i] = null;
        this.waypoints[i] = null;
        return false;
      }
      this.waypoints[i] = wp;
      this.wpPos[i] = 0;
      return this.nextSegment(i);
    }
    this.waypoints[i] = null;
    const p = this.pf.find(from, cell, mode, 1500);
    this.paths[i] = p;
    this.pathPos[i] = 0;
    return p !== null;
  }

  private nextSegment(i: number): boolean {
    const wp = this.waypoints[i];
    if (!wp) return false;
    const e = this.e;
    const w = this.sim.world;
    const from = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    while (this.wpPos[i]! < wp.length) {
      const look = Math.min(wp.length - 1, this.wpPos[i]! + 2);
      const target = wp[look]!;
      const p = this.pf.find(from, target, this.mover(i), 1200);
      if (p && p.length > 0) {
        this.paths[i] = p;
        this.pathPos[i] = 0;
        this.wpPos[i] = look + 1;
        return true;
      }
      this.wpPos[i]!++;
    }
    this.waypoints[i] = null;
    this.paths[i] = null;
    return false;
  }

  moveAlong(i: number, speedMul = 1): boolean {
    const e = this.e;
    const w = this.sim.world;
    let p = this.paths[i];
    if (!p || this.pathPos[i]! >= p.length) {
      if (this.waypoints[i] && this.nextSegment(i)) p = this.paths[i]!;
      else return false;
    }
    const c = p[this.pathPos[i]!]!;
    const cx = (c % w.w) + 0.5;
    const cy = Math.floor(c / w.w) + 0.5;
    if (!passable(w, c, this.mover(i))) {
      this.paths[i] = null;
      return false;
    }
    const here = Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!);
    const cost = this.mover(i) === Mover.Fly ? 1 : Math.max(0.5, Math.min(4, w.road[here] ? 0.6 : 1 + (w.mat[here] === Mat.Water ? 1 : 0)));
    const step = ((e.speed[i]! * speedMul) / 12) / cost;
    const dx = cx - e.x[i]!;
    const dy = cy - e.y[i]!;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      e.x[i] = cx;
      e.y[i] = cy;
      this.pathPos[i]!++;
    } else {
      e.x[i] = e.x[i]! + (dx / dist) * step;
      e.y[i] = e.y[i]! + (dy / dist) * step;
    }
    if (Math.abs(dx) > 0.05) e.dir[i] = dx < 0 ? 1 : 0;
    e.fatigue[i] = Math.min(1, e.fatigue[i]! + (e.fatigueRate[i]! / 1400) * speedMul);
    e.anim[i] = w.mat[here] === Mat.Water && w.depth[here]! > 1 && this.mover(i) !== Mover.Fly ? Anim.Swim : Anim.Walk;
    return true;
  }

  private chase(i: number, tid: number, range: number, speedMul = 1): number {
    const e = this.e;
    const j = e.index(tid);
    if (j < 0) return -1;
    const dx = e.x[j]! - e.x[i]!;
    const dy = e.y[j]! - e.y[i]!;
    const dist = Math.hypot(dx, dy);
    if (dist <= range) return dist;
    const w = this.sim.world;
    const tc = Math.floor(e.y[j]!) * w.w + Math.floor(e.x[j]!);
    const p = this.paths[i];
    const end = p && p.length ? p[p.length - 1]! : -1;
    const endDist = end >= 0 ? Math.abs((end % w.w) - Math.floor(e.x[j]!)) + Math.abs(Math.floor(end / w.w) - Math.floor(e.y[j]!)) : 99;
    const needPath = !p || this.pathPos[i]! >= p.length || (endDist > 2 && (this.sim.tick + i) % 8 === 0);
    if (needPath || dist < 2.5) {
      if (dist < 2.5 || this.mover(i) === Mover.Fly) {
        const st = (e.speed[i]! * speedMul) / 12;
        e.x[i] = e.x[i]! + (dx / dist) * Math.min(st, dist - range * 0.8);
        e.y[i] = e.y[i]! + (dy / dist) * Math.min(st, dist - range * 0.8);
        e.dir[i] = dx < 0 ? 1 : 0;
        e.anim[i] = Anim.Walk;
        return dist;
      }
      if (needPath && !this.straight(i, tc)) this.goTo(i, tc);
    }
    if (!this.moveAlong(i, speedMul) && !needPath && !this.straight(i, tc)) this.goTo(i, tc);
    return dist;
  }

  private attack(i: number, j: number): void {
    const e = this.e;
    if (e.cooldown[i]! > 0) return;
    const crit = this.rng.chance(e.crit[i]!);
    const dmg = e.dmg[i]! * (crit ? 2 : 1) * (0.8 + this.rng.float() * 0.4);
    e.cooldown[i] = Math.round(12 / Math.max(0.5, e.speed[i]! / 1.6));
    e.anim[i] = Anim.Attack;
    e.dir[i] = e.x[j]! < e.x[i]! ? 1 : 0;
    this.damage(j, dmg, i);
    this.gainXp(i, 0.2);
    if (e.alive[j]) this.sim.onUnitHit(j, i);
  }

  private checkStuck(i: number): void {
    const e = this.e;
    if (e.tx[i]! < 0) return;
    const d = Math.abs(e.tx[i]! + 0.5 - e.x[i]!) + Math.abs(e.ty[i]! + 0.5 - e.y[i]!);
    if (d < e.bestDist[i]! - 0.3) {
      e.bestDist[i] = d;
      e.stuck[i] = 0;
      return;
    }
    e.stuck[i]!++;
    if (e.stuck[i]! > 48) {
      e.stuck[i] = 0;
      e.repaths[i]!++;
      if (e.repaths[i]! > 2) {
        e.repaths[i] = 0;
        this.paths[i] = null;
        this.waypoints[i] = null;
        e.taskTimer[i] = 0;
        this.wander(i, 6);
      } else {
        this.goTo(i, e.ty[i]! * this.sim.world.w + e.tx[i]!);
      }
    }
  }

  private act(i: number, night: boolean): void {
    const e = this.e;
    const sim = this.sim;
    const w = sim.world;
    const task = e.task[i]!;
    e.anim[i] = Anim.Idle;
    switch (task) {
      case Task.Sleep:
        e.energy[i] = Math.min(1, e.energy[i]! + 1 / 70);
        e.fatigue[i] = Math.max(0, e.fatigue[i]! - 1 / 100);
        e.anim[i] = Anim.Sleep;
        if (e.energy[i]! >= 1 && !night) e.taskTimer[i] = 0;
        return;
      case Task.Rest:
        e.fatigue[i] = Math.max(0, e.fatigue[i]! - 1 / 90);
        e.anim[i] = Anim.Idle;
        if (e.fatigue[i]! <= 0.05) e.taskTimer[i] = 0;
        return;
      case Task.Eat: {
        const tgt = e.taskTarget[i]!;
        if (tgt === -2) {
          e.anim[i] = Anim.Work;
          e.hunger[i] = Math.max(0, e.hunger[i]! - 0.02);
          if (e.hunger[i]! < 0.05) e.taskTimer[i] = 0;
          return;
        }
        const tx = tgt % w.w;
        const ty = Math.floor(tgt / w.w);
        const dist = Math.hypot(tx + 0.5 - e.x[i]!, ty + 0.5 - e.y[i]!);
        if (dist < 1.3) {
          const o = w.obj[tgt]!;
          if (isPlant(o)) {
            e.anim[i] = Anim.Work;
            e.hunger[i] = Math.max(0, e.hunger[i]! - 0.6);
            sim.onPlantEaten(tgt, o);
          }
          e.taskTimer[i] = 0;
          return;
        }
        if (!this.paths[i] || e.tx[i] !== tx || e.ty[i] !== ty) {
          if (!this.straight(i, tgt)) this.goTo(i, tgt);
        }
        if (!this.moveAlong(i)) e.taskTimer[i] = 0;
        this.checkStuck(i);
        return;
      }
      case Task.Hunt:
      case Task.Fight: {
        const j = e.index(e.taskTarget[i]!);
        if (j < 0) {
          e.taskTimer[i] = 0;
          return;
        }
        const d = this.chase(i, e.taskTarget[i]!, 1.1, task === Task.Hunt ? 1.15 : 1);
        if (d >= 0 && d <= 1.2) this.attack(i, j);
        if (d > e.vision[i]! * 1.6) e.taskTimer[i] = 0;
        return;
      }
      case Task.Flee: {
        if (e.taskTarget[i] === -1) {
          if (!this.moveAlong(i, 1.3)) e.taskTimer[i] = 0;
          return;
        }
        const j = e.index(e.taskTarget[i]!);
        if (j < 0) {
          e.taskTimer[i] = 0;
          return;
        }
        if (!this.paths[i] || this.pathPos[i]! >= this.paths[i]!.length) {
          const dx = e.x[i]! - e.x[j]!;
          const dy = e.y[i]! - e.y[j]!;
          const len = Math.hypot(dx, dy) || 1;
          const fx = Math.floor(e.x[i]! + (dx / len) * 10);
          const fy = Math.floor(e.y[i]! + (dy / len) * 10);
          const c = this.pf.nearestPassable(Math.max(0, Math.min(w.w - 1, fx)), Math.max(0, Math.min(w.h - 1, fy)), this.mover(i), 4);
          if (c !== null) this.goTo(i, c);
        }
        this.moveAlong(i, 1.2);
        if (Math.hypot(e.x[j]! - e.x[i]!, e.y[j]! - e.y[i]!) > e.vision[i]! * 1.3) e.taskTimer[i] = 0;
        return;
      }
      case Task.Social: {
        const d = this.chase(i, e.taskTarget[i]!, 1.5);
        if (d < 0) e.taskTimer[i] = 0;
        else if (d <= 1.6) {
          e.social[i] = Math.max(0, e.social[i]! - 0.05);
          e.anim[i] = Anim.Idle;
          if (e.social[i]! < 0.05) e.taskTimer[i] = 0;
        }
        return;
      }
      case Task.Mate: {
        const j = e.index(e.taskTarget[i]!);
        if (j < 0) {
          e.taskTimer[i] = 0;
          return;
        }
        const d = this.chase(i, e.taskTarget[i]!, 1.2);
        if (d >= 0 && d <= 1.3) {
          e.anim[i] = Anim.Idle;
          if (e.taskTimer[i]! <= 2) {
            const mother = e.sex[i] === 1 ? i : j;
            const father = mother === i ? j : i;
            this.breed(mother, father);
            e.social[i] = 0;
            e.taskTimer[i] = 0;
            e.task[j] = Task.Wander;
            e.taskTimer[j] = 0;
          }
        }
        return;
      }
      case Task.Work:
        if (!this.civ || !this.civ.actWork(sim, i)) e.taskTimer[i] = 0;
        return;
      default: {
        if (!this.moveAlong(i)) {
          if (e.taskTimer[i]! > 12) e.taskTimer[i] = 12;
          e.anim[i] = Anim.Idle;
        }
        this.checkStuck(i);
      }
    }
  }

  breed(mother: number, father: number): void {
    const e = this.e;
    const d = this.def(mother);
    if (!this.rng.chance(Math.min(0.95, e.fertility[mother]! + 0.25))) return;
    const n = Math.max(1, this.rng.irange(1, d.litter));
    for (let k = 0; k < n; k++) {
      const c = this.spawn(d.id, e.x[mother]! + this.rng.range(-0.4, 0.4), e.y[mother]! + this.rng.range(-0.4, 0.4), { mother: e.id(mother), father: e.id(father) });
      if (c < 0) break;
      this.civ?.onBirth(this.sim, c, mother);
    }
    e.hunger[mother] = Math.min(1, e.hunger[mother]! + 0.2);
  }

  spawnInitial(): void {
    const w = this.sim.world;
    const r = this.rng;
    for (const d of SPECIES) {
      if (d.kind !== 'animal') continue;
      const want = SPECIES_BIOMES[d.id]!;
      const groups = Math.max(2, Math.round(this.animalCap(d) / 4));
      for (let g = 0; g < groups; g++) {
        for (let t = 0; t < 60; t++) {
          const c = r.int(w.n);
          if (!want.has(w.biome[c]!) || !passable(w, c, d.swim ? Mover.Swim : Mover.Walk) || w.mat[c] === Mat.Water) continue;
          const n = 1 + r.int(3);
          for (let k = 0; k < n; k++) this.spawn(d.id, (c % w.w) + 0.5 + r.range(-1, 1), Math.floor(c / w.w) + 0.5 + r.range(-1, 1));
          break;
        }
      }
    }
  }

  spawnGroup(sp: number, x: number, y: number, n: number): number[] {
    const out: number[] = [];
    const w = this.sim.world;
    const d = SPECIES[sp]!;
    for (let k = 0; k < n; k++) {
      const px = x + this.rng.range(-2, 2);
      const py = y + this.rng.range(-2, 2);
      const c = this.pf.nearestPassable(px, py, d.swim ? Mover.Swim : d.flies ? Mover.Fly : Mover.Walk, 5);
      if (c === null) continue;
      const i = this.spawn(sp, (c % w.w) + 0.5, Math.floor(c / w.w) + 0.5);
      if (i >= 0) {
        this.e.home[i] = Math.floor(y) * w.w + Math.floor(x);
        out.push(i);
      }
    }
    return out;
  }

  unitAt(x: number, y: number, r: number): number {
    const e = this.e;
    let best = -1;
    let bd = r * r;
    this.grid.rebuild(e);
    this.grid.query(x, y, r + 1, (j) => {
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - 0.5 - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) {
        bd = d2;
        best = j;
      }
    });
    return best;
  }

  card(i: number): UnitCardData {
    const e = this.e;
    const d = this.def(i);
    const nm = (id: number) => {
      const j = e.index(id);
      return j >= 0 ? this.unitName(j) || d.key : null;
    };
    return {
      id: e.id(i),
      name: this.unitName(i),
      species: d.key,
      kind: d.kind,
      age: Math.floor(e.age[i]!),
      level: e.level[i]!,
      xp: Math.floor(e.xp[i]!),
      hp: Math.ceil(e.hp[i]!),
      maxHp: Math.ceil(e.maxHp[i]!),
      dmg: Math.round(e.dmg[i]! * 10) / 10,
      armor: Math.round(e.armor[i]! * 10) / 10,
      speed: Math.round(e.speed[i]! * 100) / 100,
      vision: Math.round(e.vision[i]!),
      crit: Math.round(e.crit[i]! * 100),
      hunger: e.hunger[i]!,
      energy: e.energy[i]!,
      fatigue: e.fatigue[i]!,
      social: e.social[i]!,
      mood: e.mood[i]!,
      task: e.task[i]!,
      kills: e.kills[i]!,
      children: e.children[i]!,
      traits: e.traitList(i).map((t) => TRAITS[t]!.key),
      sex: e.sex[i]!,
      mother: e.mother[i]! >= 0 ? nm(e.mother[i]!) : null,
      father: e.father[i]! >= 0 ? nm(e.father[i]!) : null,
      city: e.city[i]!,
      kingdom: e.kingdom[i]!,
      culture: e.culture[i]!,
      religion: e.religion[i]!,
      clan: e.clan[i]!,
      job: e.job[i]!,
      carry: e.carry[i]!,
      carryAmt: e.carryAmt[i]!,
      history: e.history.get(i) ?? [],
      x: e.x[i]!,
      y: e.y[i]!,
      favorite: (e.flags[i]! & EFlag.Favorite) !== 0,
      flags: e.flags[i]!,
    };
  }

  write(pos: Float32Array, meta: Uint32Array, colorOf: (i: number) => number): number {
    const e = this.e;
    let n = 0;
    const max = Math.min(pos.length >> 2, meta.length >> 1);
    const tick = this.sim.tick;
    const follow = e.index(this.followId);
    for (let i = 0; i < e.high && n < max; i++) {
      if (!e.alive[i]) continue;
      const o = n * 4;
      pos[o] = e.x[i]!;
      pos[o + 1] = e.y[i]!;
      pos[o + 2] = e.px[i]!;
      pos[o + 3] = e.py[i]!;
      const d = SPECIES[e.species[i]!]!;
      let anim = e.anim[i]!;
      if (anim === Anim.Walk) anim = ((tick >> 2) + i) & 1;
      const young = e.age[i]! < d.maturity * 0.5 && d.maturity > 0;
      const size = young ? 0 : d.size;
      let flags = 0;
      if (e.flags[i]! & (EFlag.Favorite | EFlag.Hero) || i === follow) flags |= 1;
      if (e.hp[i]! < e.maxHp[i]! * 0.35) flags |= 2;
      if (e.flags[i]! & EFlag.Ruler) flags |= 4;
      const boat = (e.flags[i]! & EFlag.Boat) !== 0;
      meta[n * 2] = (boat ? BOAT_SPRITE : e.species[i]!) | ((boat ? 0 : anim) << 10) | (e.dir[i]! << 13) | ((boat ? 1 : size) << 14) | (flags << 16) | (young && !boat ? 1 << 24 : 0);
      meta[n * 2 + 1] = colorOf(i);
      n++;
    }
    return n;
  }

  save(w: SaveWriter): void {
    this.e.save(w);
    const paths: [number, number[] | null, number, number[] | null, number][] = [];
    for (let i = 0; i < this.e.high; i++) {
      if (!this.e.alive[i]) continue;
      const p = this.paths[i];
      const wp = this.waypoints[i];
      if (!p && !wp) continue;
      paths.push([i, p ? Array.from(p) : null, this.pathPos[i]!, wp, this.wpPos[i]!]);
    }
    w.json('C.meta', { follow: this.followId, rng: Array.from(this.rng.getState()), paths });
  }

  load(r: SaveReader): void {
    this.e.load(r);
    const m = r.jsonOr<{ follow: number; rng: number[]; paths?: [number, number[] | null, number, number[] | null, number][] } | null>('C.meta', null);
    if (m) {
      this.followId = m.follow;
      this.rng.setState(m.rng);
      for (const [i, p, pp, wp, wpp] of m.paths ?? []) {
        this.paths[i] = p ? Int32Array.from(p) : null;
        this.pathPos[i] = pp;
        this.waypoints[i] = wp;
        this.wpPos[i] = wpp;
      }
    }
    this.speciesCount.fill(0);
    for (let i = 0; i < this.e.high; i++) if (this.e.alive[i]) this.speciesCount[this.e.species[i]!]!++;
  }

  hash(): number {
    const e = this.e;
    let h = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      h = (Math.imul(h, 31) + Math.round(e.x[i]! * 100) + Math.round(e.y[i]! * 100) * 7 + e.task[i]! + Math.round(e.hp[i]!)) | 0;
    }
    return h >>> 0;
  }
}

export { plantObj };
