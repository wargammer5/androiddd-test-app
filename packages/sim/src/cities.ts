import { buildings as BUILDINGS, techs as TECHS, economy as ECON, species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { CivHooks } from './creatures.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import { Store, type Cost } from './economy.ts';
import { Task, Anim } from './entities.ts';
import { Mat, Biome, World } from './world.ts';
import { Rng } from './rng.ts';
import { isPlant, isTree, plantStage, plantType, plantObj, Stage, PlantType, Obj, buildingObj, isBuilding, buildingType, Bld, isOre } from './objects.ts';
import { calendar, isNight, Season, TICKS_PER_DAY } from './time.ts';
import { Mover, passable } from './pathfind.ts';
import { placeName } from './names.ts';

export const enum Job {
  None = 0,
  Gatherer = 1,
  Woodcutter = 2,
  Miner = 3,
  Farmer = 4,
  Hunter = 5,
  Builder = 6,
  Smith = 7,
  Healer = 8,
  Priest = 9,
  Scholar = 10,
  Warrior = 11,
  Trader = 12,
  Captain = 13,
}
export const JOB_COUNT = 14;

export interface Building {
  type: number;
  cell: number;
  done: boolean;
  progress: number;
  resId: number;
  era: number;
  hp: number;
}

export interface City {
  id: number;
  name: string;
  race: number;
  kingdom: number;
  center: number;
  founded: number;
  alive: boolean;
  buildings: Building[];
  store: Store;
  era: number;
  techs: string[];
  research: string | null;
  radius: number;
  cells: number;
  pop: number;
  housing: number;
  jobs: number[];
  wantJobs: number[];
  fields: number[];
  stall: string | null;
  emptySince: number;
  happiness: number;
  loyalty: number;
  culture: number;
  religion: number;
  wants: Record<string, number>;
  lastNeed: string;
  warriors: number;
  extra: Record<string, number>;
}

const BLD = BUILDINGS;
const ERA_COUNT = ECON.eras.length;

export function costOf(type: number, race: number): Cost {
  const c = { ...BLD[type]!.cost };
  if (race === 1 && c.stone) c.stone = Math.ceil(c.stone * 0.8);
  if (race === 2 && c.wood) c.wood = Math.ceil(c.wood * 0.85);
  return c;
}

export class CitySystem implements System, CivHooks {
  readonly name = 'cities';
  cities: City[] = [];
  drops = new Map<number, [string, number]>();
  private rng: Rng;
  debugLedger = false;

  constructor(private sim: Simulation) {
    this.rng = sim.rng.fork(123);
  }

  get world(): World {
    return this.sim.world;
  }

  city(id: number): City | null {
    const c = this.cities[id];
    return c && c.alive ? c : null;
  }

  step(sim: Simulation): void {
    const tick = sim.tick;
    for (const c of this.cities) {
      if (!c.alive) continue;
      c.store.tick = tick;
      c.store.debug = this.debugLedger;
      const phase = (tick + c.id * 7) % 48;
      if (phase === 0) this.plan(c);
      if (phase === 24) this.assignJobs(c);
    }
    if (tick % TICKS_PER_DAY === 0) for (const c of this.cities) if (c.alive) this.daily(c);
    if (tick % 30 === 0) this.growFields();
    if (tick % 120 === 60) this.foundCities();
  }

  newCity(race: number, center: number, members: number[]): City | null {
    const w = this.world;
    if (w.zone[center] !== 0) return null;
    const id = this.cities.length;
    const c: City = {
      id,
      name: placeName(this.rng.nextU32(), race),
      race,
      kingdom: -1,
      center,
      founded: this.sim.tick,
      alive: true,
      buildings: [],
      store: new Store(),
      era: 0,
      techs: [],
      research: null,
      radius: 0,
      cells: 0,
      pop: 0,
      housing: 0,
      jobs: new Array(JOB_COUNT).fill(0),
      wantJobs: new Array(JOB_COUNT).fill(0),
      fields: [],
      stall: null,
      emptySince: -1,
      happiness: 0.7,
      loyalty: 1,
      culture: -1,
      religion: -1,
      wants: {},
      lastNeed: '',
      warriors: 0,
      extra: {},
    };
    this.cities.push(c);
    this.claim(c, 6);
    this.clearCell(center);
    c.buildings.push({ type: Bld.Hall, cell: center, done: true, progress: 0, resId: 0, era: 0, hp: 100 });
    w.obj[center] = buildingObj(Bld.Hall, race);
    w.objData[center] = 0;
    w.touch(center);
    c.store.capacity = BLD[Bld.Hall]!.storage;
    c.store.add('food', 30, 'founding');
    c.store.add('wood', 20, 'founding');
    const e = this.sim.creatures.e;
    for (const i of members) {
      e.city[i] = id;
      e.home[i] = center;
    }
    this.recount(c);
    this.sim.onCityFounded(c);
    this.sim.emit({ kind: 'city', text: 'ev.cityFounded', args: { city: c.name, race: SPECIES[race]!.key }, x: center % w.w, y: Math.floor(center / w.w), important: true });
    return c;
  }

  claim(c: City, radius: number): void {
    const w = this.world;
    const cx = c.center % w.w;
    const cy = Math.floor(c.center / w.w);
    const zid = c.id + 1;
    for (let y = cy - radius; y <= cy + radius; y++)
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!w.inside(x, y)) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius + radius) continue;
        const i = y * w.w + x;
        if (w.zone[i] !== 0) continue;
        if (w.biome[i] === Biome.Sea && w.depth[i]! > 3) continue;
        w.zone[i] = zid;
        c.cells++;
        w.touchVisual(i);
      }
    c.radius = Math.max(c.radius, radius);
  }

  release(c: City): void {
    const w = this.world;
    const zid = c.id + 1;
    for (let i = 0; i < w.n; i++)
      if (w.zone[i] === zid) {
        w.zone[i] = 0;
        w.touchVisual(i);
      }
    c.cells = 0;
  }

  recount(c: City): void {
    let housing = 0;
    let cap = 0;
    for (const b of c.buildings) {
      if (!b.done) continue;
      housing += BLD[b.type]!.housing;
      cap += BLD[b.type]!.storage;
    }
    if (c.techs.includes('architecture')) housing = Math.floor(housing * 1.25);
    c.housing = housing;
    c.store.capacity = Math.max(100, cap);
  }

  private clearCell(i: number): void {
    const w = this.world;
    const o = w.obj[i]!;
    if (isPlant(o) || o === Obj.Stump || o === Obj.Ash || o === Obj.Burnt || o === Obj.Sack) w.obj[i] = 0;
    if (w.mat[i] === Mat.Snow) {
      w.mat[i] = Mat.None;
      w.depth[i] = 0;
    }
  }

  private daily(c: City): void {
    const e = this.sim.creatures.e;
    let pop = 0;
    const jobs = new Array(JOB_COUNT).fill(0);
    let warriors = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== c.id) continue;
      pop++;
      jobs[e.job[i]!]++;
      if (e.job[i] === Job.Warrior) warriors++;
    }
    c.pop = pop;
    c.jobs = jobs;
    c.warriors = warriors;
    const tick = this.sim.tick;
    if (pop === 0) {
      if (c.emptySince < 0) c.emptySince = tick;
      else if (tick - c.emptySince > TICKS_PER_DAY * 2) this.ruin(c);
      return;
    }
    c.emptySince = -1;
    const storages = c.buildings.filter((b) => b.done && b.type === Bld.Storage).length;
    const spoil = ECON.spoilagePerDay * (storages > 0 ? ECON.storageSpoilageFactor : 1);
    c.store.spoil('food', spoil, 'spoilage');
    const season = calendar(tick).season;
    if (season === Season.Winter) {
      const houses = c.buildings.filter((b) => b.done && b.type === Bld.House).length;
      const need = houses * ECON.winterFuelPerHousePerDay;
      const got = c.store.takeUpTo('wood', need, 'winter fuel');
      c.happiness = Math.max(0, Math.min(1, c.happiness + (got >= need ? 0.02 : -0.08)));
    } else c.happiness = Math.min(1, c.happiness + 0.01);
    const scholars = jobs[Job.Scholar]!;
    const school = c.buildings.some((b) => b.done && b.type === Bld.School);
    const mult = c.techs.includes('writing') ? 1.3 : 1;
    c.store.add('knowledge', (0.5 + pop * 0.03 + scholars * (school ? 3 : 1.5)) * mult, 'study');
    this.research(c);
    const want = Math.min(4 + Math.floor(Math.sqrt(pop) * 3.2) + c.era * 2, 40);
    if (want > c.radius) this.claim(c, Math.min(want, c.radius + 2));
    this.recount(c);
  }

  private research(c: City): void {
    if (!c.research) {
      const open = TECHS.filter((t) => t.era <= c.era && !c.techs.includes(t.key));
      const next = open.find((t) => Object.keys(t.cost).every((k) => k === 'knowledge' || c.store.free(k) >= t.cost[k]!)) ?? open[0];
      if (next) c.research = next.key;
      else if (c.era < ERA_COUNT - 1 && TECHS.filter((t) => t.era === c.era).every((t) => c.techs.includes(t.key))) {
        c.era++;
        this.sim.emit({ kind: 'era', text: 'ev.cityEra', args: { city: c.name, era: 'era.' + ECON.eras[c.era]!.key }, x: c.center % this.world.w, y: Math.floor(c.center / this.world.w), important: true });
        for (const b of c.buildings) {
          if (!b.done) continue;
          b.era = Math.min(3, c.era);
          this.world.objData[b.cell] = b.era;
          this.world.touchVisual(b.cell);
        }
        return;
      }
    }
    if (!c.research) return;
    const t = TECHS.find((x) => x.key === c.research)!;
    if (c.store.spend(t.cost, 'research ' + t.key)) {
      c.techs.push(t.key);
      c.research = null;
      this.sim.emit({ kind: 'tech', text: 'ev.tech', args: { city: c.name, tech: 'tech.' + t.key } });
    } else {
      for (const k in t.cost) if (k !== 'knowledge' && c.store.free(k) < t.cost[k]!) c.wants[k] = (c.wants[k] ?? 0) + 1;
    }
  }

  private ruin(c: City): void {
    const w = this.world;
    c.alive = false;
    for (const b of c.buildings) {
      if (b.resId) c.store.release(b.resId, 'ruin');
      w.obj[b.cell] = Obj.Ruins;
      w.objData[b.cell] = 0;
      w.touch(b.cell);
    }
    for (const f of c.fields) if (w.obj[f]! >= Obj.FieldEmpty && w.obj[f]! <= Obj.FieldRipe) w.obj[f] = 0;
    this.release(c);
    this.sim.onCityRuined(c);
    this.sim.emit({ kind: 'cityRuined', text: 'ev.cityRuined', args: { city: c.name }, x: c.center % w.w, y: Math.floor(c.center / w.w), important: true });
  }

  destroyBuildingAt(cell: number): void {
    const w = this.world;
    const z = w.zone[cell]!;
    if (!z) return;
    const c = this.cities[z - 1];
    if (!c) return;
    const k = c.buildings.findIndex((b) => b.cell === cell);
    if (k < 0) return;
    const b = c.buildings[k]!;
    if (b.resId) c.store.release(b.resId, 'destroyed');
    c.buildings.splice(k, 1);
    this.recount(c);
    if (b.type === Bld.Hall && c.alive) {
      const other = c.buildings.find((x) => x.done);
      if (other) {
        other.type = Bld.Hall;
        w.obj[other.cell] = buildingObj(Bld.Hall, c.race);
        c.center = other.cell;
        w.touch(other.cell);
      }
    }
  }

  private countType(c: City, t: number): number {
    let n = 0;
    for (const b of c.buildings) if (b.type === t) n++;
    return n;
  }

  private plan(c: City): void {
    const pending = c.buildings.filter((b) => !b.done);
    for (const b of pending) {
      if (!b.resId) {
        const cost = costOf(b.type, c.race);
        b.resId = c.store.reserve(cost, 'build ' + BLD[b.type]!.key);
        if (!b.resId) {
          c.stall = BLD[b.type]!.key;
          for (const k in cost) if (c.store.free(k) < cost[k]!) c.wants[k] = (c.wants[k] ?? 0) + 2;
        } else c.stall = null;
      }
    }
    const maxPending = c.pop > 24 ? 3 : c.pop > 10 ? 2 : 1;
    if (pending.length >= maxPending || !this.sim.laws.cityGrowth) return;
    const choice = this.chooseBuilding(c);
    if (choice < 0) return;
    const cell = this.findSite(c, choice);
    if (cell < 0) return;
    this.clearCell(cell);
    const w = this.world;
    const cost = costOf(choice, c.race);
    const b: Building = { type: choice, cell, done: false, progress: 0, resId: c.store.reserve(cost, 'build ' + BLD[choice]!.key), era: Math.min(3, c.era), hp: 100 };
    if (!b.resId) {
      c.stall = BLD[choice]!.key;
      for (const k in cost) if (c.store.free(k) < cost[k]!) c.wants[k] = (c.wants[k] ?? 0) + 2;
    }
    c.buildings.push(b);
    w.obj[cell] = Obj.Scaffold;
    w.objData[cell] = 0;
    w.touch(cell);
  }

  private chooseBuilding(c: City): number {
    const canBuild = (t: number) => BLD[t]!.era <= c.era && this.countType(c, t) < BLD[t]!.max;
    const food = c.store.get('food');
    if (c.pop + 2 >= c.housing && canBuild(Bld.House)) return Bld.House;
    if (food < c.pop * 4 && this.countType(c, Bld.Farm) < Math.ceil(c.pop / 5) && canBuild(Bld.Farm)) return Bld.Farm;
    if (c.store.total() > c.store.capacity * 0.75 && canBuild(Bld.Storage)) return Bld.Storage;
    if (c.pop >= 10 && this.countType(c, Bld.Temple) === 0 && canBuild(Bld.Temple)) return Bld.Temple;
    if (c.pop >= 8 && this.countType(c, Bld.School) === 0 && canBuild(Bld.School)) return Bld.School;
    if (c.pop >= 12 && this.countType(c, Bld.Smithy) === 0 && canBuild(Bld.Smithy)) return Bld.Smithy;
    if (c.pop >= 16 && this.countType(c, Bld.Barracks) === 0 && canBuild(Bld.Barracks)) return Bld.Barracks;
    if (c.techs.includes('sailing') && this.countType(c, Bld.Port) === 0 && canBuild(Bld.Port) && this.coastal(c)) return Bld.Port;
    if (c.pop >= 20 && this.countType(c, Bld.Market) === 0 && canBuild(Bld.Market)) return Bld.Market;
    if (c.pop >= 18 && this.countType(c, Bld.Tower) < Math.floor(c.pop / 12) && canBuild(Bld.Tower)) return Bld.Tower;
    if (c.pop + 6 >= c.housing && canBuild(Bld.House)) return Bld.House;
    return -1;
  }

  private coastal(c: City): boolean {
    return this.findSite(c, Bld.Port) >= 0;
  }

  findSite(c: City, type: number): number {
    const w = this.world;
    const cx = c.center % w.w;
    const cy = Math.floor(c.center / w.w);
    const zid = c.id + 1;
    const minR = type === Bld.Farm ? 3 : type === Bld.Tower ? Math.max(2, c.radius - 3) : 2;
    const off = this.rng.int(8);
    for (let r = minR; r <= c.radius; r++) {
      const n = r * 8;
      for (let k = 0; k < n; k++) {
        const a = ((k + off) / n) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        if (!w.inside(x, y)) continue;
        const i = y * w.w + x;
        if (w.zone[i] !== zid || !this.buildable(i)) continue;
        if (type === Bld.Port) {
          if (!this.nearDeepWater(i)) continue;
        } else if (!this.spaced(i, type === Bld.Farm ? 2 : 1)) continue;
        return i;
      }
    }
    return -1;
  }

  private buildable(i: number): boolean {
    const w = this.world;
    const o = w.obj[i]!;
    if (w.mat[i] !== Mat.None && w.mat[i] !== Mat.Snow) return false;
    if (w.road[i]) return false;
    if (w.biome[i] === Biome.Mountain && w.height[i]! > 190) return false;
    return o === 0 || isPlant(o) || o === Obj.Stump || o === Obj.Ash || o === Obj.Burnt;
  }

  private spaced(i: number, d: number): boolean {
    const w = this.world;
    const x0 = i % w.w;
    const y0 = Math.floor(i / w.w);
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (!w.inside(x0 + dx, y0 + dy)) continue;
        const o = w.obj[(y0 + dy) * w.w + x0 + dx]!;
        if (isBuilding(o) || o === Obj.Scaffold || (o >= Obj.FieldEmpty && o <= Obj.FieldRipe)) return false;
      }
    return true;
  }

  private nearDeepWater(i: number): boolean {
    const w = this.world;
    const x0 = i % w.w;
    const y0 = Math.floor(i / w.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!w.inside(x0 + dx, y0 + dy)) continue;
        const j = (y0 + dy) * w.w + x0 + dx;
        if (w.mat[j] === Mat.Water && w.depth[j]! >= 3) return true;
      }
    return false;
  }

  private assignJobs(c: City): void {
    const e = this.sim.creatures.e;
    const members: number[] = [];
    const d = SPECIES[c.race]!;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === c.id && e.age[i]! >= d.maturity * 0.6) members.push(i);
    c.pop = 0;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === c.id) c.pop++;
    const n = members.length;
    const want = new Array(JOB_COUNT).fill(0);
    const has = (t: number) => c.buildings.some((bb) => bb.done && bb.type === t);
    const building = c.buildings.some((bb) => !bb.done && bb.resId);
    const farms = c.buildings.filter((bb) => bb.done && bb.type === Bld.Farm).length;
    const food = c.store.get('food');
    const needs = { ...c.wants };
    c.wants = {};
    const foodLow = food < c.pop * 4;
    const woodLow = (needs.wood ?? 0) > 0 || c.store.get('wood') < 15 || c.stall !== null;
    let left = n;
    const give = (j: number, k: number) => {
      const g = Math.max(0, Math.min(left, Math.floor(k)));
      want[j] += g;
      left -= g;
    };
    give(Job.Gatherer, Math.max(1, n * (foodLow ? 0.25 : 0.12)));
    give(Job.Woodcutter, Math.max(1, n * (woodLow ? 0.2 : 0.1)));
    give(Job.Farmer, Math.min(farms * 2, n * 0.3));
    give(Job.Builder, building ? Math.max(1, n / 8) : 0);
    if (n >= 6) give(Job.Miner, 1 + ((needs.stone ?? 0) + (needs.iron ?? 0) + (needs.gold ?? 0) > 0 || c.era >= 1 ? n / 10 : 0));
    if (n >= 6) give(Job.Scholar, has(Bld.School) ? 2 : 1);
    if (has(Bld.Smithy)) give(Job.Smith, 1);
    if (n >= 10 && has(Bld.Temple)) give(Job.Priest, 1);
    if (n >= 12) give(Job.Healer, 1);
    if (n >= 8 && d.diet !== 'herb') give(Job.Hunter, 1);
    give(Job.Warrior, n / (has(Bld.Barracks) ? 6 : 12) + (c.extra.war ? n / 4 : 0));
    if (has(Bld.Market)) give(Job.Trader, 1);
    if (has(Bld.Port) && c.extra.colonize) give(Job.Captain, 1);
    while (left > 0) {
      if (foodLow || want[Job.Gatherer]! + want[Job.Farmer]! <= want[Job.Woodcutter]! + 1) want[Job.Gatherer]!++;
      else want[Job.Woodcutter]!++;
      left--;
    }
    c.wantJobs = want;
    const cur = new Array(JOB_COUNT).fill(0);
    for (const i of members) cur[e.job[i]!]++;
    const free: number[] = [];
    for (const i of members) {
      const j = e.job[i]!;
      if (j === Job.None || cur[j]! > want[j]!) {
        if (j !== Job.None) cur[j]!--;
        if (e.job[i] !== Job.None) e.phase[i] = 0;
        e.job[i] = Job.None;
        free.push(i);
      }
    }
    for (let j = 1; j < JOB_COUNT; j++) {
      while (cur[j]! < want[j]! && free.length) {
        const i = free.pop()!;
        e.job[i] = j;
        e.phase[i] = 0;
        cur[j]!++;
      }
    }
    for (const i of free) e.job[i] = Job.Gatherer;
  }

  private growFields(): void {
    const w = this.world;
    const season = calendar(this.sim.tick).season;
    if (season === Season.Winter) return;
    for (const c of this.cities) {
      if (!c.alive) continue;
      const mult = c.techs.includes('agriculture') ? 1.4 : 1;
      for (const f of c.fields) {
        const o = w.obj[f]!;
        if ((o === Obj.FieldSprout || o === Obj.FieldGrowing) && this.rng.chance(0.06 * mult * (this.sim.weatherRain(f) ? 1.5 : 1))) {
          w.obj[f] = o + 1;
          w.touchVisual(f);
        }
      }
    }
  }

  private foundCities(): void {
    const cr = this.sim.creatures;
    const e = cr.e;
    const w = this.world;
    const seen = new Set<number>();
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== -1 || seen.has(i)) continue;
      const d = SPECIES[e.species[i]!]!;
      if (d.kind !== 'civ' || e.age[i]! < d.maturity) continue;
      const group: number[] = [];
      cr.grid.query(e.x[i]!, e.y[i]!, 10, (j) => {
        if (e.alive[j] && e.city[j] === -1 && e.species[j] === e.species[i]) group.push(j);
      });
      for (const j of group) seen.add(j);
      if (group.length < 4 || !this.sim.laws.cityGrowth) continue;
      const site = this.findCitySite(e.x[i]!, e.y[i]!, d.id, 14);
      if (site < 0) continue;
      this.newCity(d.id, site, group);
    }
    void w;
  }

  findCitySite(x: number, y: number, race: number, r: number): number {
    const w = this.world;
    const want = new Set(SPECIES[race]!.biomes);
    const keys = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];
    let best = -1;
    let bestS = -1;
    for (let k = 0; k < 40; k++) {
      const cx = Math.floor(x + this.rng.range(-r, r));
      const cy = Math.floor(y + this.rng.range(-r, r));
      if (!w.inside(cx, cy)) continue;
      const i = cy * w.w + cx;
      if (!this.buildable(i) || w.zone[i] !== 0) continue;
      if (this.nearZone(cx, cy, 14)) continue;
      let s = want.has(keys[w.biome[i]!]!) ? 2 : 0;
      let land = 0;
      let water = 0;
      for (let dy = -4; dy <= 4; dy += 2)
        for (let dx = -4; dx <= 4; dx += 2) {
          if (!w.inside(cx + dx, cy + dy)) continue;
          const j = (cy + dy) * w.w + cx + dx;
          if (w.mat[j] === Mat.Water) water++;
          else if (w.mat[j] === Mat.None) land++;
        }
      s += land * 0.1 + Math.min(water, 3) * 0.3;
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    return best;
  }

  private nearZone(cx: number, cy: number, r: number): boolean {
    const w = this.world;
    for (let dy = -r; dy <= r; dy += 2)
      for (let dx = -r; dx <= r; dx += 2) {
        if (!w.inside(cx + dx, cy + dy)) continue;
        if (w.zone[(cy + dy) * w.w + cx + dx] !== 0) return true;
      }
    return false;
  }

  workScore(sim: Simulation, i: number): number {
    const e = sim.creatures.e;
    if (e.city[i]! < 0 || e.job[i] === Job.None) return 0;
    if (isNight(sim.tick) && e.job[i] !== Job.Warrior) return 0.05;
    return 0.42 + (e.task[i] === Task.Work ? 0.12 : 0);
  }

  startWork(_sim: Simulation, i: number): boolean {
    const e = this.sim.creatures.e;
    if (e.city[i]! < 0) return false;
    if (e.task[i] !== Task.Work) e.phase[i] = 0;
    return true;
  }

  private storageCell(c: City, x: number, y: number): number {
    const w = this.world;
    let best = c.center;
    let bd = 1e9;
    for (const b of c.buildings) {
      if (!b.done || (b.type !== Bld.Hall && b.type !== Bld.Storage && b.type !== Bld.Port && b.type !== Bld.Market)) continue;
      const d = Math.abs((b.cell % w.w) - x) + Math.abs(Math.floor(b.cell / w.w) - y);
      if (d < bd) {
        bd = d;
        best = b.cell;
      }
    }
    return best;
  }

  private nearestObj(x: number, y: number, r: number, pred: (o: number, i: number) => boolean, salt: number): number {
    const w = this.world;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    for (let d = 1; d <= r; d++) {
      const n = d * 8;
      const start = salt % n;
      for (let k = 0; k < n; k++) {
        const kk = (k + start) % n;
        let dx: number;
        let dy: number;
        const side = Math.floor(kk / (2 * d));
        const t = kk % (2 * d);
        if (side === 0) {
          dx = -d + t;
          dy = -d;
        } else if (side === 1) {
          dx = d;
          dy = -d + t;
        } else if (side === 2) {
          dx = d - t;
          dy = d;
        } else {
          dx = -d;
          dy = d - t;
        }
        const xx = x0 + dx;
        const yy = y0 + dy;
        if (!w.inside(xx, yy)) continue;
        const i = yy * w.w + xx;
        if (pred(w.obj[i]!, i)) return i;
      }
    }
    return -1;
  }

  private reserveTarget = new Map<number, number>();

  private claimTarget(cell: number, unit: number): boolean {
    const cur = this.reserveTarget.get(cell);
    const e = this.sim.creatures.e;
    if (cur !== undefined && cur !== unit && e.alive[cur] && e.taskTarget[cur] === cell) return false;
    this.reserveTarget.set(cell, unit);
    if (this.reserveTarget.size > 20000) this.reserveTarget.clear();
    return true;
  }

  private findTarget(c: City, i: number): number {
    const e = this.sim.creatures.e;
    const w = this.world;
    const x = e.x[i]!;
    const y = e.y[i]!;
    const salt = i * 31 + this.sim.tick;
    const R = c.radius + 10;
    const free = (cell: number) => this.claimTarget(cell, i);
    switch (e.job[i]) {
      case Job.Gatherer: {
        if (this.drops.size) {
          for (const [cell] of this.drops) {
            if (Math.abs((cell % w.w) - x) + Math.abs(Math.floor(cell / w.w) - y) < R) return cell;
          }
        }
        return this.nearestObj(x, y, R, (o, cell) => isPlant(o) && ((plantStage(o) === Stage.Fruiting) || (plantType(o) === PlantType.Berry && plantStage(o) >= Stage.Adult) || (plantType(o) === PlantType.Mushroom && plantStage(o) >= Stage.Young)) && free(cell), salt);
      }
      case Job.Woodcutter:
        return this.nearestObj(x, y, R + 6, (o, cell) => isTree(o) && plantStage(o) >= Stage.Adult && free(cell), salt);
      case Job.Miner: {
        const ore = this.nearestObj(x, y, Math.min(30, R + 8), (o, cell) => (isOre(o) || o === Obj.Cave || o === Obj.Mine) && free(cell), salt);
        if (ore >= 0) return ore;
        const rock = this.nearestObj(x, y, Math.min(30, R + 8), (o, cell) => o === 0 && (w.biome[cell] === Biome.Mountain || w.biome[cell] === Biome.Volcanic) && w.mat[cell] === Mat.None, salt);
        if (rock >= 0) return rock;
        return this.nearestObj(c.center % w.w, Math.floor(c.center / w.w), c.radius + 2, (o, cell) => o === 0 && w.zone[cell] === c.id + 1 && w.mat[cell] === Mat.None && !w.road[cell] && this.spaced(cell, 1), salt);
      }
      case Job.Farmer: {
        for (const f of c.fields) {
          const o = w.obj[f]!;
          if ((o === Obj.FieldEmpty || o === Obj.FieldRipe) && free(f)) return f;
        }
        const farm = c.buildings.find((b) => b.done && b.type === Bld.Farm && c.fields.filter((f) => this.farmOf(f, b.cell)).length < 6);
        if (farm) {
          const f = this.nearestObj(farm.cell % w.w, Math.floor(farm.cell / w.w), 2, (o, cell) => o === 0 && w.mat[cell] === Mat.None && !w.road[cell] && w.zone[cell] === c.id + 1, salt);
          if (f >= 0) {
            w.obj[f] = Obj.FieldEmpty;
            w.touchVisual(f);
            c.fields.push(f);
            return f;
          }
        }
        return -1;
      }
      case Job.Builder: {
        const b = c.buildings.find((bb) => !bb.done && bb.resId);
        return b ? b.cell : -1;
      }
      case Job.Hunter: {
        const cr = this.sim.creatures;
        let best = -1;
        let bd = 1e9;
        cr.grid.query(x, y, 22, (j) => {
          const d = SPECIES[e.species[j]!]!;
          if (d.kind !== 'animal' || d.diet === 'carn' || d.hp > 60) return;
          const dd = (e.x[j]! - x) ** 2 + (e.y[j]! - y) ** 2;
          if (dd < bd) {
            bd = dd;
            best = j;
          }
        });
        return best >= 0 ? -10 - e.id(best) : -1;
      }
      case Job.Smith: {
        const s = c.buildings.find((b) => b.done && b.type === Bld.Smithy);
        return s ? s.cell : -1;
      }
      case Job.Scholar: {
        const s = c.buildings.find((b) => b.done && b.type === Bld.School) ?? c.buildings.find((b) => b.type === Bld.Hall);
        return s ? s.cell : -1;
      }
      case Job.Priest: {
        const s = c.buildings.find((b) => b.done && b.type === Bld.Temple);
        return s ? s.cell : -1;
      }
      case Job.Healer: {
        let best = -1;
        for (let j = 0; j < e.high; j++) {
          if (!e.alive[j] || e.city[j] !== c.id || j === i) continue;
          if (e.hp[j]! < e.maxHp[j]! * 0.7) {
            best = j;
            break;
          }
        }
        if (best >= 0) return -10 - e.id(best);
        return this.nearestObj(x, y, R, (o) => isPlant(o) && plantType(o) === PlantType.Flower && plantStage(o) >= Stage.Young, salt);
      }
      case Job.Warrior: {
        const a = this.rng.float() * Math.PI * 2;
        const r = c.radius * (0.6 + this.rng.float() * 0.4);
        const px = Math.round((c.center % w.w) + Math.cos(a) * r);
        const py = Math.round(Math.floor(c.center / w.w) + Math.sin(a) * r);
        return w.inside(px, py) ? py * w.w + px : -1;
      }
      default:
        return this.sim.civWorkTarget(c, i);
    }
  }

  private farmOf(f: number, farm: number): boolean {
    const w = this.world;
    return Math.abs((f % w.w) - (farm % w.w)) <= 2 && Math.abs(Math.floor(f / w.w) - Math.floor(farm / w.w)) <= 2;
  }

  actWork(sim: Simulation, i: number): boolean {
    const cr = sim.creatures;
    const e = cr.e;
    const c = this.city(e.city[i]!);
    if (!c) {
      e.city[i] = -1;
      e.job[i] = Job.None;
      return false;
    }
    const w = this.world;
    switch (e.phase[i]) {
      case 0: {
        if (e.carryAmt[i]! > 0) {
          e.phase[i] = 3;
          return true;
        }
        const t = this.findTarget(c, i);
        if (t === -1) {
          cr.wander(i, 6);
          e.task[i] = Task.Work;
          e.taskTimer[i] = 40;
          e.phase[i] = 5;
          return true;
        }
        e.taskTarget[i] = t;
        e.phase[i] = 1;
        e.workTimer[i] = 0;
        if (t >= 0) this.approach(i, t);
        return true;
      }
      case 1: {
        const t = e.taskTarget[i]!;
        if (t <= -10) {
          const tid = -10 - t;
          const j = e.index(tid);
          if (j < 0) {
            e.phase[i] = 0;
            return true;
          }
          const dist = Math.hypot(e.x[j]! - e.x[i]!, e.y[j]! - e.y[i]!);
          if (dist <= 1.2) {
            if (e.job[i] === Job.Healer) {
              const heal = (c.techs.includes('medicine') ? 1.5 : 1) * (c.store.takeUpTo('herbs', 1, 'heal') > 0 ? 25 : 10);
              e.hp[j] = Math.min(e.maxHp[j]!, e.hp[j]! + heal);
              e.anim[i] = Anim.Work;
              cr.gainXp(i, 0.5);
              e.phase[i] = 0;
              return true;
            }
            if (e.cooldown[i] === 0) {
              e.cooldown[i] = 12;
              e.anim[i] = Anim.Attack;
              cr.damage(j, e.dmg[i]! * 1.5, i);
              if (!e.alive[j]) {
                e.carry[i] = 0;
                e.carryAmt[i] = ECON.gather.hunt!;
                e.phase[i] = 3;
              }
            }
            return true;
          }
          if (e.workTimer[i]!++ > 240) {
            e.phase[i] = 0;
            return true;
          }
          if ((sim.tick + i) % 6 === 0 || !cr.paths[i]) {
            const tc = Math.floor(e.y[j]!) * w.w + Math.floor(e.x[j]!);
            if (!cr.straight(i, tc)) cr.goTo(i, tc);
          }
          cr.moveAlong(i);
          return true;
        }
        const tx = t % w.w;
        const ty = Math.floor(t / w.w);
        const dist = Math.hypot(tx + 0.5 - e.x[i]!, ty + 0.5 - e.y[i]!);
        if (dist <= 1.5 || (e.job[i] === Job.Warrior && dist < 3)) {
          e.phase[i] = 2;
          e.workTimer[i] = 0;
          return true;
        }
        if (!cr.moveAlong(i)) {
          if (e.workTimer[i]!++ > 3) {
            e.phase[i] = 0;
            return false;
          }
          this.approach(i, t);
        }
        return true;
      }
      case 2:
        return this.doWork(c, i);
      case 3: {
        const s = this.storageCell(c, e.x[i]!, e.y[i]!);
        e.taskTarget[i] = s;
        this.approach(i, s);
        e.phase[i] = 4;
        e.workTimer[i] = 0;
        return true;
      }
      case 4: {
        const s = e.taskTarget[i]!;
        const dist = Math.hypot((s % w.w) + 0.5 - e.x[i]!, Math.floor(s / w.w) + 0.5 - e.y[i]!);
        if (dist <= 1.6) {
          const res = ECON.resources[e.carry[i]!]!;
          const got = c.store.add(res, e.carryAmt[i]!, 'deposit ' + res);
          if (got >= e.carryAmt[i]! || e.workTimer[i]! > 60) {
            if (got < e.carryAmt[i]!) this.drop(Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!), res, e.carryAmt[i]! - got);
            e.carryAmt[i] = 0;
            e.phase[i] = 0;
            if (!e.tool[i] && c.store.takeUpTo('tools', 1, 'equip tool') > 0) {
              e.tool[i] = 1;
              e.toolWear[i] = 0;
            }
            if (e.job[i] === Job.Warrior && !e.tool[i] && c.store.takeUpTo('weapons', 1, 'equip weapon') > 0) {
              e.tool[i] = 2;
              e.toolWear[i] = 0;
              e.dmg[i] = e.dmg[i]! * 1.3;
            }
            return false;
          }
          e.carryAmt[i] = e.carryAmt[i]! - got;
          e.workTimer[i]!++;
          return true;
        }
        if (!cr.moveAlong(i)) {
          if (e.workTimer[i]!++ > 4) {
            this.drop(Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!), ECON.resources[e.carry[i]!]!, e.carryAmt[i]!);
            e.carryAmt[i] = 0;
            e.phase[i] = 0;
            return false;
          }
          this.approach(i, s);
        }
        return true;
      }
      default:
        if (!cr.moveAlong(i)) e.phase[i] = 0;
        return true;
    }
  }

  approach(i: number, t: number): boolean {
    const cr = this.sim.creatures;
    const w = this.world;
    const mode = cr.mover(i);
    let goal = t;
    if (!passable(w, t, mode)) {
      const e = cr.e;
      const tx = t % w.w;
      const ty = Math.floor(t / w.w);
      let bd = 1e9;
      goal = -1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!w.inside(tx + dx, ty + dy)) continue;
          const j = (ty + dy) * w.w + tx + dx;
          if (!passable(w, j, mode)) continue;
          const d = (tx + dx - e.x[i]!) ** 2 + (ty + dy - e.y[i]!) ** 2;
          if (d < bd) {
            bd = d;
            goal = j;
          }
        }
      if (goal < 0) return false;
    }
    return cr.straight(i, goal) || cr.goTo(i, goal);
  }

  private wear(i: number): number {
    const e = this.sim.creatures.e;
    if (e.tool[i] !== 1) return 1;
    e.toolWear[i]!++;
    if (e.toolWear[i]! >= ECON.toolWearMax) {
      e.tool[i] = 0;
      e.toolWear[i] = 0;
    }
    return ECON.toolBonus;
  }

  private doWork(c: City, i: number): boolean {
    const sim = this.sim;
    const cr = sim.creatures;
    const e = cr.e;
    const w = this.world;
    const t = e.taskTarget[i]!;
    e.anim[i] = Anim.Work;
    e.dir[i] = (t % w.w) + 0.5 < e.x[i]! ? 1 : 0;
    e.fatigue[i] = Math.min(1, e.fatigue[i]! + e.fatigueRate[i]! / 900);
    const timer = ++e.workTimer[i]!;
    const gatherMul = (c.techs.includes('toolmaking') ? 1.2 : 1) * (e.tool[i] === 1 ? ECON.toolBonus : 1);
    const need = Math.round(24 / gatherMul);
    const o = w.obj[t]!;
    const carry = (res: string, amt: number) => {
      e.carry[i] = ECON.resources.indexOf(res);
      e.carryAmt[i] = Math.max(1, Math.round(amt));
      e.phase[i] = 3;
      this.wear(i);
      cr.gainXp(i, 0.3);
    };
    switch (e.job[i]) {
      case Job.Gatherer: {
        if (timer < need) return true;
        const drop = this.drops.get(t);
        if (drop) {
          this.drops.delete(t);
          if (w.obj[t] === Obj.Sack) {
            w.obj[t] = 0;
            w.touchVisual(t);
          }
          carry(drop[0], drop[1]);
          return true;
        }
        if (!isPlant(o)) {
          e.phase[i] = 0;
          return false;
        }
        sim.onPlantEaten(t, o);
        const pt = plantType(o);
        carry(pt === PlantType.Mushroom ? 'food' : 'food', ECON.gather[plantStage(o) === Stage.Fruiting ? 'fruit' : 'berry']!);
        return true;
      }
      case Job.Woodcutter: {
        if (timer < need * 1.5) return true;
        if (!isTree(o)) {
          e.phase[i] = 0;
          return false;
        }
        w.obj[t] = Obj.Stump;
        w.objData[t] = 0;
        w.touchVisual(t);
        carry('wood', ECON.gather.wood!);
        return true;
      }
      case Job.Miner: {
        if (timer < need * 2) return true;
        let res = 'stone';
        if (o === Obj.IronOre) res = 'iron';
        else if (o === Obj.GoldOre) res = 'gold';
        else if (o === Obj.Gems) res = 'gems';
        else if (o === 0) {
          const rocky = w.biome[t] === Biome.Mountain || w.biome[t] === Biome.Volcanic;
          if (!rocky && timer < need * 4) return true;
          carry('stone', rocky ? 2 : 1);
          if (!rocky && this.rng.chance(0.05)) {
            w.obj[t] = Obj.Mine;
            w.touchVisual(t);
          }
          return true;
        } else if (o !== Obj.Stone && o !== Obj.Cave && o !== Obj.Mine) {
          e.phase[i] = 0;
          return false;
        }
        if (isOre(o)) {
          if (w.objData[t] === 0) w.objData[t] = Math.min(255, ECON.oreAmount[res] ?? 20);
          const amt = Math.min(w.objData[t]!, ECON.gather[res] ?? 2);
          w.objData[t] = w.objData[t]! - amt;
          if (w.objData[t] === 0) {
            w.obj[t] = 0;
            w.touch(t);
          }
          carry(res, amt);
        } else {
          if (o === Obj.Cave) {
            w.obj[t] = Obj.Mine;
            w.touchVisual(t);
          }
          const r = this.rng.float();
          carry(r < 0.6 ? 'stone' : r < 0.9 ? 'iron' : 'gold', r < 0.6 ? 2 : 1);
        }
        return true;
      }
      case Job.Farmer: {
        if (timer < need) return true;
        if (o === Obj.FieldEmpty) {
          w.obj[t] = Obj.FieldSprout;
          w.touchVisual(t);
          cr.gainXp(i, 0.2);
          e.phase[i] = 0;
          return false;
        }
        if (o === Obj.FieldRipe) {
          w.obj[t] = Obj.FieldEmpty;
          w.touchVisual(t);
          carry('food', ECON.gather.harvest! * (c.techs.includes('agriculture') ? 1.3 : 1));
          return true;
        }
        e.phase[i] = 0;
        return false;
      }
      case Job.Builder: {
        const b = c.buildings.find((bb) => bb.cell === t && !bb.done);
        if (!b || !b.resId) {
          e.phase[i] = 0;
          return false;
        }
        const def = BLD[b.type]!;
        const speed = (c.techs.includes('masonry') ? 1.2 : 1) * (c.techs.includes('architecture') ? 1.3 : 1) * (c.techs.includes('engineering') ? 1.4 : 1) * (e.tool[i] === 1 ? 1.3 : 1);
        const dp = speed / 6;
        const before = b.progress;
        b.progress = Math.min(def.work, b.progress + dp);
        const frac = (b.progress - before) / Math.max(1e-6, def.work - before);
        c.store.consumeReserved(b.resId, frac, 'build ' + def.key);
        if ((timer & 7) === 0) this.wear(i);
        if (b.progress >= def.work) this.complete(c, b);
        if (timer > 120) {
          e.phase[i] = 0;
          return false;
        }
        return true;
      }
      case Job.Smith: {
        if (timer < need * 2) return true;
        const want = c.store.get('tools') < Math.max(3, c.pop / 3) ? 'tools' : c.store.get('weapons') < c.warriors + 2 ? 'weapons' : null;
        if (want && c.store.spend(ECON.smith[want]!, 'smith ' + want)) c.store.add(want, 1, 'smith ' + want);
        else if (want) for (const k in ECON.smith[want]!) c.wants[k] = (c.wants[k] ?? 0) + 1;
        cr.gainXp(i, 0.3);
        e.phase[i] = 0;
        return false;
      }
      case Job.Scholar: {
        if (timer < need * 3) return true;
        c.store.add('knowledge', c.buildings.some((b) => b.done && b.type === Bld.School) ? 1 : 0.4, 'study');
        cr.gainXp(i, 0.4);
        e.phase[i] = 0;
        return false;
      }
      case Job.Priest: {
        if (timer < need * 3) return true;
        sim.onPrayer(c, i);
        e.phase[i] = 0;
        return false;
      }
      case Job.Healer: {
        if (timer < need) return true;
        if (isPlant(o) && plantType(o) === PlantType.Flower) {
          sim.onPlantEaten(t, o);
          carry('herbs', ECON.gather.herbs!);
          return true;
        }
        e.phase[i] = 0;
        return false;
      }
      case Job.Warrior: {
        if (timer < 60) return true;
        e.phase[i] = 0;
        return false;
      }
      default:
        return sim.civDoWork(c, i, timer);
    }
  }

  complete(c: City, b: Building): void {
    const w = this.world;
    b.done = true;
    b.era = Math.min(3, c.era);
    if (b.resId) c.store.finish(b.resId, 'build done');
    b.resId = 0;
    w.obj[b.cell] = buildingObj(b.type, c.race);
    w.objData[b.cell] = b.era;
    w.touch(b.cell);
    this.recount(c);
    if (b.type !== Bld.Wall && b.type !== Bld.Farm) this.road(c, b.cell);
    if (b.type === Bld.Farm) {
      const f = this.nearestObj(b.cell % w.w, Math.floor(b.cell / w.w), 2, (o, cell) => o === 0 && w.mat[cell] === Mat.None && !w.road[cell], 1);
      if (f >= 0) {
        w.obj[f] = Obj.FieldEmpty;
        c.fields.push(f);
        w.touchVisual(f);
      }
    }
    if (b.type === Bld.Hall || b.type === Bld.Temple || b.type === Bld.School || b.type === Bld.Port || b.type === Bld.Market) this.sim.emit({ kind: 'built', text: 'ev.built', args: { city: c.name, bld: 'bld.' + BLD[b.type]!.key }, x: b.cell % w.w, y: Math.floor(b.cell / w.w) });
  }

  private road(c: City, from: number): void {
    const w = this.world;
    const p = this.sim.creatures.pf.find(from, c.center, Mover.Walk, 600);
    if (!p) return;
    for (const cell of p) {
      if (cell === c.center) break;
      const o = w.obj[cell]!;
      if (isBuilding(o) || o === Obj.Scaffold || (o >= Obj.FieldEmpty && o <= Obj.FieldRipe)) continue;
      if (w.mat[cell] !== Mat.None && w.mat[cell] !== Mat.Snow) continue;
      if (isPlant(o) || o === Obj.Stump) w.obj[cell] = 0;
      if (!w.road[cell]) {
        w.road[cell] = 1;
        w.touch(cell);
      }
    }
  }

  drop(cell: number, res: string, amt: number): void {
    if (amt <= 0 || cell < 0) return;
    const w = this.world;
    const cur = this.drops.get(cell);
    if (cur && cur[0] === res) cur[1] += amt;
    else this.drops.set(cell, [res, amt]);
    if (w.obj[cell] === 0) {
      w.obj[cell] = Obj.Sack;
      w.touchVisual(cell);
    }
    if (this.drops.size > 4000) {
      const k = this.drops.keys().next().value!;
      this.drops.delete(k);
      if (w.obj[k] === Obj.Sack) w.obj[k] = 0;
    }
  }

  eatFromStore(sim: Simulation, i: number): boolean {
    const e = sim.creatures.e;
    const c = this.city(e.city[i]!);
    if (!c) return false;
    const w = this.world;
    const z = w.zone[Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!)]!;
    const cx = c.center % w.w;
    const cy = Math.floor(c.center / w.w);
    if (z !== c.id + 1 && Math.hypot(e.x[i]! - cx, e.y[i]! - cy) > c.radius + 8) return false;
    return c.store.spend({ food: ECON.foodPerMeal }, 'meal');
  }

  hostile(sim: Simulation, a: number, b: number): boolean {
    return sim.civHostile(a, b);
  }

  onDeath(sim: Simulation, i: number, _killer: number): void {
    const e = sim.creatures.e;
    if (e.carryAmt[i]! > 0) {
      const w = this.world;
      this.drop(Math.floor(e.y[i]!) * w.w + Math.floor(e.x[i]!), ECON.resources[e.carry[i]!]!, e.carryAmt[i]!);
    }
  }

  onBirth(sim: Simulation, child: number, mother: number): void {
    const e = sim.creatures.e;
    e.city[child] = e.city[mother]!;
    e.home[child] = e.home[mother]!;
    const c = this.city(e.city[child]!);
    if (c) c.pop++;
  }

  popCap(sim: Simulation, i: number): number {
    const e = sim.creatures.e;
    const sp = e.species[i]!;
    const c = this.city(e.city[i]!);
    if (!c) return sim.creatures.speciesCount[sp]! + (this.nomadsOf(sp) < 24 ? 1 : 0);
    if (c.store.get('food') < c.pop * 0.5) return 0;
    return sim.creatures.speciesCount[sp]! + Math.max(0, c.housing - c.pop);
  }

  private nomadCache = new Map<number, [number, number]>();

  private nomadsOf(sp: number): number {
    const tick = this.sim.tick;
    const c = this.nomadCache.get(sp);
    if (c && tick - c[0] < 60) return c[1];
    const e = this.sim.creatures.e;
    let n = 0;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.species[i] === sp && e.city[i] === -1) n++;
    this.nomadCache.set(sp, [tick, n]);
    return n;
  }

  homeTarget(sim: Simulation, i: number): number {
    const e = sim.creatures.e;
    const c = this.city(e.city[i]!);
    if (c) return c.center;
    return e.home[i]!;
  }

  cityInfo(id: number): unknown {
    const c = this.city(id);
    if (!c) return null;
    const bcount: Record<string, number> = {};
    for (const b of c.buildings) if (b.done) bcount[BLD[b.type]!.key] = (bcount[BLD[b.type]!.key] ?? 0) + 1;
    return {
      id: c.id,
      name: c.name,
      race: SPECIES[c.race]!.key,
      kingdom: c.kingdom,
      pop: c.pop,
      housing: c.housing,
      era: ECON.eras[c.era]!.key,
      techs: c.techs,
      research: c.research,
      store: c.store.snapshot(),
      capacity: c.store.capacity,
      buildings: bcount,
      queue: c.buildings.filter((b) => !b.done).map((b) => ({ key: BLD[b.type]!.key, progress: b.progress / Math.max(1, BLD[b.type]!.work), funded: b.resId !== 0 })),
      stall: c.stall,
      jobs: c.jobs,
      wantJobs: c.wantJobs,
      founded: c.founded,
      happiness: c.happiness,
      loyalty: c.loyalty,
      x: c.center % this.world.w,
      y: Math.floor(c.center / this.world.w),
      culture: c.culture,
      religion: c.religion,
      ledgerErrors: c.store.check(),
      ledger: c.store.debug ? c.store.ledger.slice(-30) : [],
    };
  }

  save(w: SaveWriter): void {
    w.json('CITY', {
      cities: this.cities.map((c) => ({ ...c, store: c.store.toJSON() })),
      drops: [...this.drops],
      rng: Array.from(this.rng.getState()),
      reserve: [...this.reserveTarget],
    });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ cities: (Omit<City, 'store'> & { store: Parameters<typeof Store.fromJSON>[0] })[]; drops: [number, [string, number]][]; rng: number[]; reserve?: [number, number][] } | null>('CITY', null);
    if (!m) return;
    this.cities = m.cities.map((c) => ({ ...c, store: Store.fromJSON(c.store) }));
    this.drops = new Map(m.drops);
    this.rng.setState(m.rng);
    this.reserveTarget = new Map(m.reserve ?? []);
  }

  hash(): number {
    let h = 0;
    for (const c of this.cities) {
      h = (Math.imul(h, 31) + c.pop * 7 + c.buildings.length * 13 + Math.round(c.store.total())) | 0;
    }
    return h >>> 0;
  }
}

export { plantObj };
