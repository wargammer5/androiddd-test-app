import { Rng, hashString } from './rng.ts';
import { World, WORLD_SIZES, type WorldSizeKey, Mat } from './world.ts';
import { baseLut, LUT_BIOME } from './palette.ts';
import type { Command, FrameStats, NewWorldParams, Query, SimEvent, ViewRect } from './protocol.ts';
import { generateWorld, DEFAULT_GEN } from './worldgen.ts';
import { UndoStack } from './undo.ts';
import { applyPower } from './powers.ts';
import { DEFAULT_LAWS, LAW_PROFILES, sanitizeLaws, type Laws } from './laws.ts';
import { SaveReader, SaveWriter, migrate, SAVE_VERSION } from './save.ts';
import { Substances } from './substances.ts';
import { Creatures } from './creatures.ts';
import { Nature, placePlants } from './nature.ts';
import { CitySystem, type City } from './cities.ts';
import { KingdomSystem } from './kingdoms.ts';
import { buildings as BUILDINGS, economy as ECONOMY } from '@sotv/content';
const ECON_RES = ECONOMY.resources;
import { isBuilding, buildingType } from './objects.ts';
import { calendar } from './time.ts';
import { isPlant, plantType, plantStage, plantObj, PlantType, Stage } from './objects.ts';
import { EFlag } from './entities.ts';
import { species as SPECIES } from '@sotv/content';

export const TICK_HZ = 12;
export const MAX_ENTITIES = 6000;

export interface System {
  readonly name: string;
  step(sim: Simulation): void;
  save?(w: SaveWriter): void;
  load?(r: SaveReader): void;
}

export class Simulation {
  readonly seed: string;
  readonly size: WorldSizeKey;
  readonly world: World;
  readonly rng: Rng;
  tick = 0;
  lutDirty = false;
  view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  laws: Laws = { ...DEFAULT_LAWS };
  readonly undo = new UndoStack();
  readonly systems: System[] = [];
  private queue: Command[] = [];
  private events: SimEvent[] = [];
  private minimapTick = -1000;
  lut: Uint8Array = baseLut();
  substances!: Substances;
  creatures!: Creatures;
  nature!: Nature;
  cities!: CitySystem;
  kingdomSys!: KingdomSystem;
  startPeoples = true;

  constructor(params: NewWorldParams, skipGen = false) {
    this.seed = params.seed;
    this.size = params.size;
    const s = WORLD_SIZES[params.size];
    this.world = new World(s, s);
    this.rng = new Rng(hashString(params.seed));
    if (params.laws) this.laws = sanitizeLaws(params.laws as Partial<Laws>);
    this.startPeoples = params.laws?.['startPeoples'] !== false;
    this.installSystems();
    if (!skipGen) {
      generateWorld(this.world, this.rng.fork(1), DEFAULT_GEN);
      this.populate();
    }
  }

  protected populate(): void {
    placePlants(this.world, this.rng.fork(3));
    this.creatures.spawnInitial();
    if (this.startPeoples) this.spawnPeoples();
  }

  spawnPeoples(): void {
    const w = this.world;
    const r = this.rng.fork(5);
    const BIOME_KEYS = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];
    for (const d of SPECIES) {
      if (d.kind !== 'civ') continue;
      const want = new Set(d.biomes.map((b) => BIOME_KEYS.indexOf(b)));
      for (let t = 0; t < 400; t++) {
        const c = r.int(w.n);
        if (!want.has(w.biome[c]!) || w.mat[c] !== Mat.None || w.obj[c] !== 0) continue;
        const ids = this.creatures.spawnGroup(d.id, (c % w.w) + 0.5, Math.floor(c / w.w) + 0.5, 8);
        for (const i of ids) {
          this.creatures.e.age[i] = d.maturity + r.float() * d.maturity;
          this.creatures.e.sex[i] = ids.indexOf(i) % 2;
        }
        break;
      }
    }
  }

  protected installSystems(): void {
    this.substances = new Substances();
    this.creatures = new Creatures(this);
    this.nature = new Nature(this);
    this.cities = new CitySystem(this);
    this.kingdomSys = this.makeKingdoms();
    this.creatures.civ = this.cities;
    this.systems.push(this.substances, this.nature, this.cities, this.kingdomSys, this.creatures);
  }

  protected makeKingdoms(): KingdomSystem {
    return new KingdomSystem(this);
  }

  onCityFounded(c: City): void {
    this.kingdomSys.create(c);
  }

  onCityRuined(c: City): void {
    const k = this.kingdomSys.get(c.kingdom);
    if (!k) return;
    k.cities = k.cities.filter((x) => x !== c.id);
    if (k.capital === c.id) k.capital = k.cities[0] ?? -1;
    if (k.cities.length === 0) this.kingdomSys.fall(k);
  }

  onPrayer(_c: City, _i: number): void {}

  civWorkTarget(_c: City, _i: number): number {
    return -1;
  }

  civDoWork(_c: City, _i: number, _timer: number): boolean {
    return false;
  }

  civHostile(_a: number, _b: number): boolean {
    return false;
  }

  onUnitDeath(_i: number, _cell: number): void {}

  onSpawnedByPlayer(_ids: number[], _key: string): void {}

  onUnitHit(_victim: number, _attacker: number): void {}

  onPlantEaten(cell: number, o: number): void {
    const w = this.world;
    if (!isPlant(o)) return;
    const t = plantType(o);
    const st = plantStage(o);
    if (st === Stage.Fruiting) w.obj[cell] = plantObj(t, Stage.Adult);
    else if (t === PlantType.Flower || t === PlantType.Berry) w.obj[cell] = st > Stage.Sprout ? plantObj(t, Stage.Sprout) : 0;
    w.objData[cell] = 0;
    w.touchVisual(cell);
  }

  unitColor(i: number): number {
    const k = this.creatures.e.kingdom[i]!;
    return k >= 0 ? k + 1 : 0;
  }

  weatherRain(i: number): boolean {
    return this.nature.rainAt(this.world, i);
  }

  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  setView(r: ViewRect): void {
    this.view = r;
  }

  inView(x: number, y: number, margin = 0): boolean {
    const v = this.view;
    return x >= v.x0 - margin && x <= v.x1 + margin && y >= v.y0 - margin && y <= v.y1 + margin;
  }

  emit(e: Omit<SimEvent, 'tick'>): void {
    this.events.push({ ...e, tick: this.tick });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(): void {
    const q = this.queue;
    this.queue = [];
    for (const c of q) this.apply(c);
    for (const s of this.systems) s.step(this);
    this.tick++;
  }

  protected apply(c: Command): void {
    switch (c.t) {
      case 'power':
        applyPower(this, c);
        break;
      case 'undo': {
        const r = this.undo.pop(this.world);
        if (r) this.onUndo(r.spawned);
        break;
      }
      case 'law':
        this.laws = sanitizeLaws({ ...this.laws, [c.key]: c.value });
        break;
      case 'profile': {
        const p = LAW_PROFILES[c.key];
        if (p) this.laws = sanitizeLaws({ ...this.laws, ...p });
        break;
      }
      default:
        this.applyExtra(c);
    }
  }

  protected onUndo(spawned: number[]): void {
    const e = this.creatures.e;
    for (const id of spawned) {
      const i = e.index(id);
      if (i >= 0) this.creatures.die(i, -1, 'undo');
    }
  }

  protected applyExtra(c: Command): void {
    const e = this.creatures.e;
    if (c.t === 'favorite') {
      const i = e.index(c.id);
      if (i >= 0) e.flags[i] = c.on ? e.flags[i]! | EFlag.Favorite : e.flags[i]! & ~EFlag.Favorite;
    } else if (c.t === 'debug' && c.key === 'follow') {
      this.creatures.followId = c.value ?? -1;
    } else if (c.t === 'spawn') {
      const d = SPECIES.find((s) => s.key === c.kind);
      if (d) this.creatures.spawnGroup(d.id, c.x, c.y, 1);
    } else this.applyMore(c);
  }

  protected applyMore(_c: Command): void {}

  hasPendingVisual(): boolean {
    return this.world.dirty.indexOf(1) >= 0;
  }

  entCapacityBytes(): number {
    return MAX_ENTITIES * 4 * 4;
  }

  metaCapacityBytes(): number {
    return MAX_ENTITIES * 2 * 4;
  }

  writeEntities(pos: Float32Array, meta: Uint32Array): number {
    return this.creatures.write(pos, meta, (i) => this.unitColor(i));
  }

  hasUnits(): boolean {
    return this.creatures.e.count > 0;
  }

  paletteLut(): Uint8Array {
    this.kingdomSys.writeLut(this.lut);
    return this.lut;
  }

  followInfo(): { id: number; x: number; y: number } | undefined {
    const c = this.creatures;
    const i = c.e.index(c.followId);
    if (i < 0) return undefined;
    return { id: c.followId, x: c.e.x[i]!, y: c.e.y[i]! };
  }

  minimap(force = false): { w: number; h: number; data: Uint8Array } | undefined {
    if (!force && this.tick - this.minimapTick < 24) return undefined;
    this.minimapTick = this.tick;
    const w = this.world;
    const mw = Math.min(192, w.w);
    const mh = Math.min(192, w.h);
    const data = new Uint8Array(mw * mh * 4);
    const lut = this.lut;
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        const i = Math.floor((y * w.h) / mh) * w.w + Math.floor((x * w.w) / mw);
        const o = (y * mw + x) * 4;
        const b = w.biome[i]!;
        let r = lut[(LUT_BIOME * 256 + b) * 4]!;
        let g = lut[(LUT_BIOME * 256 + b) * 4 + 1]!;
        let bl = lut[(LUT_BIOME * 256 + b) * 4 + 2]!;
        const m = w.mat[i]!;
        if (m === Mat.Water && w.depth[i]! > 0) {
          const d = Math.min(1, w.depth[i]! / 40);
          r = 60 - d * 40;
          g = 130 - d * 80;
          bl = 190 - d * 80;
        } else if (m === Mat.Lava) {
          r = 240;
          g = 110;
          bl = 20;
        } else if (m === Mat.Acid) {
          r = 150;
          g = 230;
          bl = 40;
        } else if (m === Mat.Snow || m === Mat.Ice) {
          r = 230;
          g = 240;
          bl = 250;
        }
        const k = w.zoneKingdom(i);
        if (k > 0) {
          const ko = k * 4;
          r = (r + lut[ko]! * 2) / 3;
          g = (g + lut[ko + 1]! * 2) / 3;
          bl = (bl + lut[ko + 2]! * 2) / 3;
        }
        if (w.fire[i]! > 0) {
          r = 255;
          g = 120;
          bl = 0;
        }
        const shade = 0.75 + (w.height[i]! / 255) * 0.4;
        data[o] = Math.min(255, r * shade);
        data[o + 1] = Math.min(255, g * shade);
        data[o + 2] = Math.min(255, bl * shade);
        data[o + 3] = 255;
      }
    return { w: mw, h: mh, data };
  }

  stats(tickMs: number): FrameStats {
    const cal = calendar(this.tick);
    let pop = 0;
    for (const d of SPECIES) if (d.kind === 'civ') pop += this.creatures.speciesCount[d.id]!;
    const cities = this.cities.cities.filter((c) => c.alive).length;
    const kingdoms = this.kingdomSys.kingdoms.filter((k) => k.alive).length;
    return {
      tick: this.tick,
      day: cal.day,
      year: cal.year,
      season: cal.season,
      dayPhase: cal.dayPhase,
      population: pop,
      creatures: this.creatures.e.count,
      cities,
      kingdoms,
      tickMs,
      worldAge: 'calm',
      weather: this.weatherNear(),
      clouds: this.nature.clouds.flatMap((c) => [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.r), c.type]),
      flash: this.nature.flash,
      wind: this.nature.wind,
    };
  }

  weatherNear(): number {
    const v = this.view;
    const cx = (v.x0 + v.x1) / 2;
    const cy = (v.y0 + v.y1) / 2;
    for (const c of this.nature.clouds) if ((c.x - cx) ** 2 + (c.y - cy) ** 2 < (c.r + 10) ** 2) return c.type;
    return 0;
  }

  query(q: Query): unknown {
    switch (q.kind) {
      case 'cell':
        return this.cellInfo(q.x, q.y);
      case 'laws':
        return this.laws;
      case 'unitAt': {
        const i = this.creatures.unitAt(q.x, q.y, q.r);
        return i >= 0 ? { id: this.creatures.e.id(i) } : null;
      }
      case 'unit': {
        const i = this.creatures.e.index(q.id);
        return i >= 0 ? this.unitCard(i) : null;
      }
      case 'city':
        return this.cities.cityInfo(q.id);
      case 'kingdom':
        return this.kingdomSys.info(q.id);
      case 'species': {
        return SPECIES.map((d) => ({ key: d.key, kind: d.kind, count: this.creatures.speciesCount[d.id]! }));
      }
      default:
        return this.queryExtra(q);
    }
  }

  protected queryExtra(_q: Query): unknown {
    return null;
  }

  unitCard(i: number): unknown {
    const card = this.creatures.card(i);
    const e = this.creatures.e;
    const extra: Record<string, string | number> = {};
    const c = this.cities.city(e.city[i]!);
    if (c) extra['unit.city'] = c.name;
    if (e.job[i]) extra['unit.job'] = 'job.' + e.job[i];
    if (e.carryAmt[i]) extra['unit.carry'] = `${e.carryAmt[i]} × ${ECON_RES[e.carry[i]!]}`;
    this.cardExtra(i, extra);
    card.extra = extra;
    return card;
  }

  protected cardExtra(_i: number, _extra: Record<string, string | number>): void {}

  cellInfo(x: number, y: number): unknown {
    const w = this.world;
    if (!w.inside(x, y)) return null;
    const i = w.idx(x, y);
    const o = w.obj[i]!;
    const z = w.zone[i]!;
    const city = z ? this.cities.city(z - 1) : null;
    const kingdom = city ? this.kingdomSys.get(city.kingdom) : null;
    let objName: string | undefined;
    if (isPlant(o)) objName = 'plant.' + ['oak', 'pine', 'palm', 'jungletree', 'cactus', 'berry', 'flower', 'mushroom', 'crystal'][plantType(o)];
    else if (isBuilding(o)) objName = 'bld.' + BUILDINGS[buildingType(o)]!.key;
    else if (o) objName = 'obj.' + o;
    return {
      objName,
      city: city ? { id: city.id, name: city.name } : undefined,
      kingdom: kingdom ? { id: kingdom.id, name: kingdom.name } : undefined,
      x,
      y,
      biome: w.biome[i],
      height: w.height[i],
      moist: w.moist[i],
      temp: Math.round(w.heat[i]!),
      mat: w.mat[i],
      depth: w.depth[i],
      obj: w.obj[i],
      fire: w.fire[i],
      zone: w.zone[i],
    };
  }

  save(): Uint8Array {
    const sw = new SaveWriter();
    const w = this.world;
    sw.json('META', { v: SAVE_VERSION, seed: this.seed, size: this.size, tick: this.tick, rng: Array.from(this.rng.getState()), laws: this.laws });
    sw.array('L.biome', w.biome);
    sw.array('L.height', w.height);
    sw.array('L.moist', w.moist);
    sw.array('L.baseTemp', w.baseTemp);
    sw.array('L.heat', w.heat);
    sw.array('L.mat', w.mat);
    sw.array('L.depth', w.depth);
    sw.array('L.obj', w.obj);
    sw.array('L.objData', w.objData);
    sw.array('L.zone', w.zone);
    sw.array('L.fire', w.fire);
    sw.array('L.road', w.road);
    sw.array('L.still', w.still);
    sw.array('L.active', w.active);
    for (const s of this.systems) s.save?.(sw);
    this.saveExtra(sw);
    return sw.finish();
  }

  protected saveExtra(_w: SaveWriter): void {}

  protected loadExtra(_r: SaveReader): void {}

  static load(bytes: Uint8Array): Simulation {
    const r = new SaveReader(bytes);
    migrate(r);
    const meta = r.json<{ seed: string; size: WorldSizeKey; tick: number; rng: number[]; laws: Partial<Laws> }>('META');
    const sim = new Simulation({ seed: meta.seed, size: meta.size, laws: meta.laws as Record<string, boolean> }, true);
    sim.restore(r, meta);
    return sim;
  }

  restore(r: SaveReader, meta: { tick: number; rng: number[] }): void {
    const w = this.world;
    r.into('L.biome', w.biome);
    r.into('L.height', w.height);
    r.into('L.moist', w.moist);
    r.into('L.baseTemp', w.baseTemp);
    r.into('L.heat', w.heat);
    r.into('L.mat', w.mat);
    r.into('L.depth', w.depth);
    r.into('L.obj', w.obj);
    r.into('L.objData', w.objData);
    r.into('L.zone', w.zone);
    r.into('L.fire', w.fire);
    r.into('L.road', w.road);
    r.into('L.still', w.still);
    r.into('L.active', w.active);
    this.tick = meta.tick;
    this.rng.setState(meta.rng);
    for (const s of this.systems) s.load?.(r);
    this.loadExtra(r);
    w.markAllDirty();
    this.lutDirty = true;
  }

  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (v: number) => {
      h = Math.imul(h ^ (v & 0xff), 16777619) >>> 0;
      h = Math.imul(h ^ ((v >>> 8) & 0xff), 16777619) >>> 0;
    };
    const w = this.world;
    for (let i = 0; i < w.n; i++) {
      mix(w.biome[i]!);
      mix(w.height[i]!);
      mix(w.mat[i]!);
      mix(w.depth[i]!);
      mix(w.obj[i]!);
      mix(w.objData[i]!);
      mix(w.fire[i]!);
      mix(w.zone[i]!);
      mix(Math.round(w.heat[i]! * 4));
    }
    mix(this.tick);
    mix(this.extraHash());
    return h >>> 0;
  }

  protected extraHash(): number {
    return (this.creatures.hash() ^ this.cities.hash()) >>> 0;
  }
}
