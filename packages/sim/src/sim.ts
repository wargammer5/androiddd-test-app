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

  constructor(params: NewWorldParams, skipGen = false) {
    this.seed = params.seed;
    this.size = params.size;
    const s = WORLD_SIZES[params.size];
    this.world = new World(s, s);
    this.rng = new Rng(hashString(params.seed));
    if (params.laws) this.laws = sanitizeLaws(params.laws as Partial<Laws>);
    this.installSystems();
    if (!skipGen) generateWorld(this.world, this.rng.fork(1), DEFAULT_GEN);
  }

  protected installSystems(): void {
    this.substances = new Substances();
    this.systems.push(this.substances);
  }

  weatherRain(_i: number): boolean {
    return false;
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

  protected onUndo(_spawned: number[]): void {}

  protected applyExtra(_c: Command): void {}

  hasPendingVisual(): boolean {
    return this.world.dirty.indexOf(1) >= 0;
  }

  entCapacityBytes(): number {
    return MAX_ENTITIES * 4 * 4;
  }

  metaCapacityBytes(): number {
    return MAX_ENTITIES * 2 * 4;
  }

  writeEntities(_pos: Float32Array, _meta: Uint32Array): number {
    return 0;
  }

  paletteLut(): Uint8Array {
    return this.lut;
  }

  followInfo(): { id: number; x: number; y: number } | undefined {
    return undefined;
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
    return {
      tick: this.tick,
      day: 0,
      year: 0,
      season: 0,
      dayPhase: 0.5,
      population: 0,
      creatures: 0,
      cities: 0,
      kingdoms: 0,
      tickMs,
      worldAge: 'calm',
      weather: 0,
    };
  }

  query(q: Query): unknown {
    if (q.kind === 'cell') return this.cellInfo(q.x, q.y);
    if (q.kind === 'laws') return this.laws;
    return null;
  }

  cellInfo(x: number, y: number): unknown {
    const w = this.world;
    if (!w.inside(x, y)) return null;
    const i = w.idx(x, y);
    return {
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
    return 0;
  }
}
