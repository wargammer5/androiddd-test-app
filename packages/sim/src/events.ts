import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import { Rng } from './rng.ts';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from './time.ts';
import { Mat, Biome, SEA_LEVEL } from './world.ts';
import { Obj, isBuilding, isTree } from './objects.ts';
import { SPECIES_INDEX } from './creatures.ts';
import { EFlag, Task } from './entities.ts';
import { forBrush } from './brush.ts';

export const AGES = ['calm', 'prosperity', 'darkness', 'chaos', 'ice', 'fire', 'madness', 'magic'] as const;
export type AgeKey = (typeof AGES)[number];

export const EVENT_KINDS = ['drought', 'plague', 'famine', 'earthquake', 'volcano', 'comet', 'invasion', 'flood', 'wildfire', 'uprising'] as const;

export interface Region {
  kind: string;
  x: number;
  y: number;
  r: number;
  until: number;
}

export class WorldEvents implements System {
  readonly name = 'events';
  age: AgeKey = 'calm';
  ageUntil = TICKS_PER_YEAR * 3;
  regions: Region[] = [];
  plague = new Map<number, number>();
  famine = new Map<number, number>();
  vents: { cell: number; until: number }[] = [];
  magnet: number[] = [];
  history: { tick: number; kind: string; text: string; args: Record<string, string | number> }[] = [];
  private rng: Rng;

  constructor(private sim: Simulation) {
    this.rng = sim.rng.fork(4242);
  }

  mod(key: string): number {
    const a = this.age;
    switch (key) {
      case 'growth':
        return a === 'prosperity' ? 1.5 : a === 'ice' ? 0.5 : a === 'fire' ? 0.7 : a === 'magic' ? 1.2 : 1;
      case 'light':
        return a === 'darkness' ? 0.55 : 1;
      case 'temp':
        return a === 'ice' ? -14 : a === 'fire' ? 12 : 0;
      case 'war':
        return a === 'chaos' ? 2 : a === 'madness' ? 1.5 : a === 'prosperity' ? 0.6 : 1;
      case 'events':
        return a === 'chaos' ? 1.8 : a === 'fire' ? 1.3 : a === 'calm' ? 0.8 : 1;
      case 'monsters':
        return a === 'darkness' ? 2.5 : a === 'magic' ? 1.5 : 1;
      case 'birth':
        return a === 'prosperity' ? 1.4 : a === 'darkness' ? 0.8 : 1;
      case 'madness':
        return a === 'madness' ? 1 : 0;
      default:
        return 1;
    }
  }

  inRegion(kind: string, x: number, y: number): boolean {
    for (const r of this.regions) if (r.kind === kind && (x - r.x) ** 2 + (y - r.y) ** 2 < r.r * r.r) return true;
    return false;
  }

  log(kind: string, text: string, args: Record<string, string | number>, x?: number, y?: number): void {
    this.history.push({ tick: this.sim.tick, kind, text, args });
    if (this.history.length > 300) this.history.shift();
    this.sim.emit({ kind, text, args, x, y, important: true });
  }

  step(sim: Simulation): void {
    const tick = sim.tick;
    this.regions = this.regions.filter((r) => r.until > tick);
    this.vents = this.vents.filter((v) => {
      if (v.until > tick) return true;
      const w = sim.world;
      if (w.obj[v.cell] === Obj.Vent) {
        w.obj[v.cell] = 0;
        w.touchVisual(v.cell);
      }
      return false;
    });
    if (tick % 30 === 7) this.regionEffects();
    if (tick % 60 === 13) this.monsterSpawns();
    if (tick % TICKS_PER_DAY !== 40) return;
    if (sim.laws.worldAges && tick >= this.ageUntil) this.nextAge();
    this.plagueDaily();
    if (!sim.laws.disasters) return;
    const freq = sim.laws.eventFrequency * this.mod('events');
    if (freq <= 0) return;
    if (this.rng.chance(Math.min(0.9, 0.14 * freq))) {
      const k = this.rng.weighted([1.2, 0.8, 0.8, 0.8, 0.6, 0.4, 0.7, 0.7, 1, 0.7]);
      this.trigger(EVENT_KINDS[k]!);
    }
  }

  nextAge(): void {
    const sim = this.sim;
    const options = AGES.filter((a) => a !== this.age);
    const weights = options.map((a) => (a === 'calm' ? 3 : a === 'prosperity' ? 2 : a === 'chaos' || a === 'madness' ? 0.8 * Math.max(0.3, sim.laws.eventFrequency) : 1));
    this.setAge(options[this.rng.weighted(weights)]!);
  }

  setAge(a: AgeKey): void {
    this.age = a;
    this.ageUntil = this.sim.tick + TICKS_PER_YEAR * (2 + this.rng.int(3));
    this.sim.lutDirty = true;
    this.log('age', 'ev.age', { age: 'age.' + a });
  }

  trigger(kind: string, x?: number, y?: number): boolean {
    const sim = this.sim;
    const w = sim.world;
    const cities = sim.cities.cities.filter((c) => c.alive);
    const pickCity = () => (cities.length ? cities[this.rng.int(cities.length)]! : null);
    const landCell = (pred: (i: number) => boolean) => {
      for (let t = 0; t < 400; t++) {
        const i = this.rng.int(w.n);
        if (pred(i)) return i;
      }
      return -1;
    };
    const at = (i: number): [number, number] => [i % w.w, Math.floor(i / w.w)];
    switch (kind) {
      case 'drought': {
        const i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : landCell((j) => w.mat[j] === Mat.None && w.biome[j] !== Biome.Snow);
        if (i < 0) return false;
        const [cx, cy] = at(i);
        this.regions.push({ kind: 'drought', x: cx, y: cy, r: 25 + this.rng.int(30), until: sim.tick + TICKS_PER_DAY * (4 + this.rng.int(5)) });
        this.log('drought', 'ev.drought', {}, cx, cy);
        return true;
      }
      case 'flood': {
        let i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : landCell((j) => w.mat[j] === Mat.Water && w.biome[j] !== Biome.Sea);
        if (i < 0) i = landCell((j) => w.mat[j] === Mat.None);
        if (i < 0) return false;
        const [cx, cy] = at(i);
        this.regions.push({ kind: 'flood', x: cx, y: cy, r: 12 + this.rng.int(12), until: sim.tick + TICKS_PER_DAY * 2 });
        this.log('flood', 'ev.flood', {}, cx, cy);
        return true;
      }
      case 'plague': {
        const c = x !== undefined ? sim.cities.city((w.zone[Math.floor(y!) * w.w + Math.floor(x)] ?? 0) - 1) : pickCity();
        if (!c) return false;
        this.plague.set(c.id, Math.max(this.plague.get(c.id) ?? 0, 0.5));
        this.log('plague', 'ev.plague', { city: c.name }, c.center % w.w, Math.floor(c.center / w.w));
        return true;
      }
      case 'famine': {
        const c = x !== undefined ? sim.cities.city((w.zone[Math.floor(y!) * w.w + Math.floor(x)] ?? 0) - 1) : pickCity();
        if (!c) return false;
        c.store.spoil('food', 0.7, 'famine');
        this.famine.set(c.id, sim.tick + TICKS_PER_DAY * 3);
        this.log('famine', 'ev.famine', { city: c.name }, c.center % w.w, Math.floor(c.center / w.w));
        return true;
      }
      case 'earthquake': {
        const c = pickCity();
        const i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : c ? c.center : landCell((j) => w.mat[j] === Mat.None);
        if (i < 0) return false;
        const [cx, cy] = at(i);
        this.earthquake(cx, cy, 10 + this.rng.int(10));
        this.log('earthquake', 'ev.earthquake', {}, cx, cy);
        return true;
      }
      case 'volcano': {
        let i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : landCell((j) => w.mat[j] === Mat.None && w.height[j]! > SEA_LEVEL + 50);
        if (i < 0) i = landCell((j) => w.mat[j] === Mat.None && w.zone[j] === 0);
        if (i < 0) return false;
        const [cx, cy] = at(i);
        this.volcano(cx, cy);
        this.log('volcano', 'ev.volcano', {}, cx, cy);
        return true;
      }
      case 'comet': {
        const c = this.rng.chance(0.5) ? pickCity() : null;
        const i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : c ? c.center + this.rng.irange(-8, 8) : landCell((j) => w.mat[j] === Mat.None);
        if (i < 0 || i >= w.n) return false;
        const [cx, cy] = at(i);
        this.impact(cx, cy, 6 + this.rng.int(5), true);
        this.log('comet', 'ev.comet', {}, cx, cy);
        return true;
      }
      case 'invasion': {
        const c = pickCity();
        if (!c) return false;
        const [cx, cy] = at(c.center);
        const kinds = this.age === 'darkness' ? ['undead'] : ['demon', 'undead', 'alien', 'mutant'];
        const k = kinds[this.rng.int(kinds.length)]!;
        const a = this.rng.float() * Math.PI * 2;
        const sx = Math.max(2, Math.min(w.w - 3, cx + Math.cos(a) * (c.radius + 12)));
        const sy = Math.max(2, Math.min(w.h - 3, cy + Math.sin(a) * (c.radius + 12)));
        const ids = sim.creatures.spawnGroup(SPECIES_INDEX.get(k)!, sx, sy, k === 'demon' ? 3 : 6);
        for (const id of ids) sim.creatures.e.age[id] = 1;
        this.log('invasion', 'ev.invasion', { city: c.name, kind: 'species.' + k }, Math.round(sx), Math.round(sy));
        return true;
      }
      case 'wildfire': {
        const i = x !== undefined ? Math.floor(y!) * w.w + Math.floor(x) : landCell((j) => isTree(w.obj[j]!));
        if (i < 0) return false;
        w.fire[i] = 8;
        w.wake(i, 60);
        const [cx, cy] = at(i);
        this.log('wildfire', 'ev.wildfire', {}, cx, cy);
        return true;
      }
      case 'uprising': {
        const c = pickCity();
        if (!c) return false;
        c.loyalty = Math.max(0, c.loyalty - 0.6);
        c.happiness = Math.max(0, c.happiness - 0.4);
        this.log('uprising', 'ev.uprising', { city: c.name }, c.center % w.w, Math.floor(c.center / w.w));
        return true;
      }
    }
    return false;
  }

  earthquake(cx: number, cy: number, r: number): void {
    const sim = this.sim;
    const w = sim.world;
    forBrush(w, cx, cy, r, 'circle', (i, _x, _y, f) => {
      const d = this.rng.irange(-3, 3) * f;
      w.height[i] = Math.max(1, Math.min(255, Math.round(w.height[i]! + d)));
      const o = w.obj[i]!;
      if (isBuilding(o) && this.rng.chance(0.35 * f)) {
        sim.cities.destroyBuildingAt(i);
        w.obj[i] = Obj.Ruins;
      } else if (w.biome[i] === Biome.Mountain && o === 0 && this.rng.chance(0.03)) w.obj[i] = Obj.IronOre;
      if (w.still[i]) w.still[i] = 0;
      w.wake(i, 30);
    });
    const cr = sim.creatures;
    cr.grid.query(cx, cy, r, (j) => cr.damage(j, 8 + this.rng.int(10), -1));
  }

  volcano(cx: number, cy: number): void {
    const w = this.sim.world;
    forBrush(w, cx, cy, 6, 'circle', (i, _x, _y, f) => {
      w.height[i] = Math.min(255, w.height[i]! + Math.round(f * 25));
      w.biome[i] = Biome.Volcanic;
      w.still[i] = 0;
      w.wake(i, 60);
    });
    const c = cy * w.w + cx;
    w.obj[c] = Obj.Vent;
    w.mat[c] = Mat.Lava;
    w.depth[c] = 4;
    w.heat[c] = 200;
    w.wake(c, 60);
    this.vents.push({ cell: c, until: this.sim.tick + TICKS_PER_DAY * 3 });
  }

  impact(cx: number, cy: number, r: number, meteor: boolean): void {
    const sim = this.sim;
    const w = sim.world;
    forBrush(w, cx, cy, r, 'circle', (i, _x, _y, f) => {
      const o = w.obj[i]!;
      if (isBuilding(o)) sim.cities.destroyBuildingAt(i);
      w.height[i] = Math.max(1, w.height[i]! - Math.round(f * f * 18));
      w.obj[i] = f > 0.75 ? Obj.Crater : this.rng.chance(0.2) ? Obj.Ash : 0;
      if (w.mat[i] === Mat.Snow || w.mat[i] === Mat.Ice) {
        w.mat[i] = Mat.Water;
        w.depth[i] = 1;
      }
      w.heat[i] = Math.max(w.heat[i]!, 60 + f * 120);
      w.still[i] = 0;
      w.wake(i, 40);
    });
    forBrush(w, cx, cy, r + 3, 'circle', (i, _x, _y, f) => {
      if (f < 0.3 && this.rng.chance(0.5)) {
        w.fire[i] = 6;
        w.wake(i, 40);
      }
    });
    if (meteor) w.obj[cy * w.w + cx] = Obj.Meteor;
    const cr = sim.creatures;
    cr.grid.rebuild(cr.e);
    cr.grid.query(cx, cy, r + 1, (j) => cr.damage(j, 400, -1));
  }

  private regionEffects(): void {
    const sim = this.sim;
    const w = sim.world;
    for (const r of this.regions) {
      const n = Math.ceil((r.r * r.r) / 40);
      for (let k = 0; k < n; k++) {
        const a = this.rng.float() * Math.PI * 2;
        const d = Math.sqrt(this.rng.float()) * r.r;
        const x = Math.floor(r.x + Math.cos(a) * d);
        const y = Math.floor(r.y + Math.sin(a) * d);
        if (!w.inside(x, y)) continue;
        const i = y * w.w + x;
        if (r.kind === 'drought') {
          if (w.mat[i] === Mat.Water && w.depth[i]! <= 2 && w.biome[i] !== Biome.Sea) {
            w.depth[i] = w.depth[i]! - 1;
            if (w.depth[i] === 0) w.mat[i] = Mat.None;
            w.still[i] = 0;
            w.wake(i, 20);
          } else if (isTree(w.obj[i]!) && this.rng.chance(0.05)) {
            w.obj[i] = Obj.Burnt;
            w.touchVisual(i);
          }
          w.heat[i] = Math.max(w.heat[i]!, w.baseTemp[i]! + 8);
        } else if (r.kind === 'flood') {
          if (w.mat[i] === Mat.None && w.height[i]! < SEA_LEVEL + 45) {
            w.mat[i] = Mat.Water;
            w.depth[i] = 2;
            w.wake(i, 40);
          }
        }
      }
      if (r.kind === 'drought') for (const c of sim.nature.clouds) if ((c.x - r.x) ** 2 + (c.y - r.y) ** 2 < r.r * r.r && c.type !== 2) c.life = Math.min(c.life, 20);
    }
  }

  private plagueDaily(): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    const w = sim.world;
    for (const [cid, level] of [...this.plague]) {
      const c = sim.cities.city(cid);
      if (!c || level <= 0.02) {
        this.plague.delete(cid);
        continue;
      }
      let victims = 0;
      for (let i = 0; i < e.high; i++) {
        if (!e.alive[i] || e.city[i] !== cid) continue;
        if (this.rng.chance(level * 0.15)) {
          sim.creatures.damage(i, e.maxHp[i]! * 0.75, -1);
          if (!e.alive[i]) victims++;
        }
      }
      c.happiness = Math.max(0, c.happiness - level * 0.1);
      const healers = c.jobs[8] ?? 0;
      const cure = 0.08 + healers * 0.04 + (c.techs.includes('medicine') ? 0.1 : 0);
      this.plague.set(cid, Math.max(0, level - cure));
      for (const o of sim.cities.cities) {
        if (!o.alive || o.id === cid || this.plague.has(o.id)) continue;
        const d = Math.hypot((o.center % w.w) - (c.center % w.w), Math.floor(o.center / w.w) - Math.floor(c.center / w.w));
        if (d < 45 && this.rng.chance(level * 0.15)) {
          this.plague.set(o.id, level * 0.7);
          this.log('plague', 'ev.plagueSpread', { city: o.name }, o.center % w.w, Math.floor(o.center / w.w));
        }
      }
      void victims;
    }
  }

  private monsterSpawns(): void {
    const sim = this.sim;
    if (!sim.laws.disasters) return;
    const m = this.mod('monsters');
    const night = (sim.tick % TICKS_PER_DAY) / TICKS_PER_DAY > 0.8;
    if (this.age === 'darkness' && night && this.rng.chance(0.08 * m)) {
      const w = sim.world;
      for (let t = 0; t < 40; t++) {
        const i = this.rng.int(w.n);
        if (w.obj[i] === Obj.Tomb || w.obj[i] === Obj.Bones || w.obj[i] === Obj.Ruins || (w.mat[i] === Mat.None && this.rng.chance(0.05))) {
          sim.creatures.spawnGroup(SPECIES_INDEX.get('undead')!, (i % w.w) + 0.5, Math.floor(i / w.w) + 0.5, 1 + this.rng.int(3));
          break;
        }
      }
    }
    if (this.age === 'magic' && this.rng.chance(0.02)) {
      const w = sim.world;
      const i = this.rng.int(w.n);
      if (w.mat[i] === Mat.None && w.biome[i] !== Biome.Sea) {
        forBrush(w, i % w.w, Math.floor(i / w.w), 4, 'circle', (j) => {
          if (w.mat[j] === Mat.None) w.biome[j] = Biome.Magic;
          w.touchVisual(j);
        });
      }
    }
  }

  onUnitKilled(victim: number, killer: number): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    if (killer < 0 || !e.alive[killer]) return;
    const kd = sim.creatures.def(killer);
    const vd = sim.creatures.def(victim);
    if (kd.key === 'undead' && vd.kind === 'civ' && this.rng.chance(0.5)) {
      const x = e.x[victim]!;
      const y = e.y[victim]!;
      this.pendingUndead.push([x, y]);
    }
  }

  pendingUndead: [number, number][] = [];

  flushUndead(): void {
    for (const [x, y] of this.pendingUndead) this.sim.creatures.spawnGroup(SPECIES_INDEX.get('undead')!, x, y, 1);
    this.pendingUndead.length = 0;
  }

  magnetPick(x: number, y: number, r: number): void {
    const cr = this.sim.creatures;
    const e = cr.e;
    cr.grid.rebuild(e);
    cr.grid.query(x, y, r, (j) => {
      if (this.magnet.length >= 60 || this.magnet.includes(e.id(j))) return;
      if (Math.hypot(e.x[j]! - x, e.y[j]! - y) > r) return;
      this.magnet.push(e.id(j));
      e.flags[j] = e.flags[j]! | EFlag.Possessed;
    });
  }

  magnetMove(x: number, y: number): void {
    const e = this.sim.creatures.e;
    this.magnet.forEach((id, k) => {
      const i = e.index(id);
      if (i < 0) return;
      const a = k * 2.399;
      const rr = Math.sqrt(k) * 0.6;
      e.x[i] = Math.max(0.5, Math.min(this.sim.world.w - 0.5, x + Math.cos(a) * rr));
      e.y[i] = Math.max(0.5, Math.min(this.sim.world.h - 0.5, y + Math.sin(a) * rr));
      e.task[i] = Task.Controlled;
      this.sim.creatures.paths[i] = null;
    });
  }

  magnetDrop(): void {
    const cr = this.sim.creatures;
    const e = cr.e;
    for (const id of this.magnet) {
      const i = e.index(id);
      if (i < 0) continue;
      e.flags[i] = e.flags[i]! & ~EFlag.Possessed;
      e.task[i] = Task.Wander;
      e.taskTimer[i] = 0;
    }
    this.magnet = [];
  }

  info(): unknown {
    return {
      age: this.age,
      ageUntil: this.ageUntil,
      regions: this.regions.map((r) => ({ ...r })),
      plague: [...this.plague].map(([c, l]) => [this.sim.cities.cities[c]?.name ?? '?', Math.round(l * 100)]),
      history: this.history.slice(-80),
    };
  }

  save(w: SaveWriter): void {
    w.json('EVNT', { age: this.age, ageUntil: this.ageUntil, regions: this.regions, plague: [...this.plague], famine: [...this.famine], vents: this.vents, history: this.history, rng: Array.from(this.rng.getState()) });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ age: AgeKey; ageUntil: number; regions: Region[]; plague: [number, number][]; famine: [number, number][]; vents: { cell: number; until: number }[]; history: WorldEvents['history']; rng: number[] } | null>('EVNT', null);
    if (!m) return;
    this.age = m.age;
    this.ageUntil = m.ageUntil;
    this.regions = m.regions;
    this.plague = new Map(m.plague);
    this.famine = new Map(m.famine);
    this.vents = m.vents;
    this.history = m.history;
    this.rng.setState(m.rng);
  }

  hash(): number {
    return (AGES.indexOf(this.age) * 1000 + this.regions.length * 10 + this.plague.size + this.history.length * 7) >>> 0;
  }
}
