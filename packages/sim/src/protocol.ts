import type { WorldSizeKey } from './world.ts';

export interface NewWorldParams {
  seed: string;
  size: WorldSizeKey;
  laws?: Record<string, boolean | number | string>;
}

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Command =
  | { t: 'power'; power: string; x: number; y: number; radius: number; shape: 'circle' | 'square'; stroke: number; arg?: string | number }
  | { t: 'undo' }
  | { t: 'law'; key: string; value: boolean | number | string }
  | { t: 'profile'; key: string }
  | { t: 'favorite'; id: number; on: boolean }
  | { t: 'edit'; kind: string; id: number; data: Record<string, unknown> }
  | { t: 'spawn'; kind: string; x: number; y: number }
  | { t: 'debug'; key: string; value?: number };

export type ToWorker =
  | { t: 'new'; params: NewWorldParams }
  | { t: 'load'; bytes: ArrayBuffer }
  | { t: 'save'; reqId: number }
  | { t: 'speed'; speed: number }
  | { t: 'cmd'; cmd: Command }
  | { t: 'view'; rect: ViewRect }
  | { t: 'query'; reqId: number; q: Query }
  | { t: 'ret'; buf: ArrayBuffer; meta: ArrayBuffer }
  | { t: 'full' };

export type Query =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'unit'; id: number }
  | { kind: 'unitAt'; x: number; y: number; r: number }
  | { kind: 'city'; id: number }
  | { kind: 'kingdom'; id: number }
  | { kind: 'culture'; id: number }
  | { kind: 'religion'; id: number }
  | { kind: 'clan'; id: number }
  | { kind: 'lists' }
  | { kind: 'history' }
  | { kind: 'stats' }
  | { kind: 'species' }
  | { kind: 'laws' }
  | { kind: 'measure'; x0: number; y0: number; x1: number; y1: number };

export interface ChunkPatch {
  c: number;
  t0: Uint8Array;
  t1: Uint8Array;
}

export interface SimEvent {
  tick: number;
  kind: string;
  text: string;
  args?: Record<string, string | number>;
  x?: number;
  y?: number;
  important?: boolean;
}

export interface FrameStats {
  tick: number;
  day: number;
  year: number;
  season: number;
  dayPhase: number;
  population: number;
  creatures: number;
  cities: number;
  kingdoms: number;
  tickMs: number;
  worldAge: string;
  weather: number;
  clouds: number[];
  flash: number;
  wind: [number, number];
}

export const ENT_STRIDE = 4;
export const META_STRIDE = 2;

export type FromWorker =
  | { t: 'ready'; w: number; h: number; seed: string; size: WorldSizeKey; t0: Uint8Array; t1: Uint8Array; lut: Uint8Array }
  | { t: 'frame'; tick: number; count: number; buf: ArrayBuffer; meta: ArrayBuffer; patches: ChunkPatch[]; events: SimEvent[]; stats: FrameStats; lut?: Uint8Array; follow?: { id: number; x: number; y: number }; minimap?: { w: number; h: number; data: Uint8Array } }
  | { t: 'saved'; reqId: number; bytes: ArrayBuffer }
  | { t: 'answer'; reqId: number; data: unknown }
  | { t: 'error'; message: string };
