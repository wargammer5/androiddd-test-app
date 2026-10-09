import { Rng, hashString } from './rng.ts';
import { World, WORLD_SIZES, type WorldSizeKey, SEA_LEVEL, Biome } from './world.ts';
import { baseLut } from './palette.ts';
import type { Command, FrameStats, NewWorldParams, Query, SimEvent, ViewRect } from './protocol.ts';

export const TICK_HZ = 12;
export const MAX_ENTITIES = 6000;

export class Simulation {
  readonly seed: string;
  readonly size: WorldSizeKey;
  readonly world: World;
  readonly rng: Rng;
  tick = 0;
  lutDirty = false;
  view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private queue: Command[] = [];
  private events: SimEvent[] = [];

  constructor(params: NewWorldParams, skipGen = false) {
    this.seed = params.seed;
    this.size = params.size;
    const s = WORLD_SIZES[params.size];
    this.world = new World(s, s);
    this.rng = new Rng(hashString(params.seed));
    if (!skipGen) this.generate();
  }

  private generate(): void {
    this.world.height.fill(SEA_LEVEL + 10);
    this.world.biome.fill(Biome.Plains);
    this.world.heat.fill(15);
    this.world.markAllDirty();
  }

  enqueue(cmd: Command): void {
    this.queue.push(cmd);
  }

  setView(r: ViewRect): void {
    this.view = r;
  }

  emit(e: Omit<SimEvent, 'tick'>): void {
    this.events.push({ ...e, tick: this.tick });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
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
    this.tick++;
  }

  protected apply(_c: Command): void {}

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
    return baseLut();
  }

  followInfo(): { id: number; x: number; y: number } | undefined {
    return undefined;
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

  query(_q: Query): unknown {
    return null;
  }

  save(): Uint8Array {
    return new Uint8Array(0);
  }

  static load(_bytes: Uint8Array): Simulation {
    throw new Error('save format not implemented');
  }

  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (v: number) => {
      h = Math.imul(h ^ (v & 0xff), 16777619) >>> 0;
    };
    const w = this.world;
    for (let i = 0; i < w.n; i++) {
      mix(w.biome[i]!);
      mix(w.height[i]!);
      mix(w.mat[i]!);
      mix(w.depth[i]!);
      mix(w.obj[i]!);
    }
    mix(this.tick);
    return h;
  }
}
