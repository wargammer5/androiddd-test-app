export const CHUNK = 32;
export const CHUNK_SHIFT = 5;
export const SEA_LEVEL = 100;

export const enum Biome {
  Sea = 0,
  Plains = 1,
  Forest = 2,
  Jungle = 3,
  Savanna = 4,
  Desert = 5,
  Mountain = 6,
  Snow = 7,
  Swamp = 8,
  Volcanic = 9,
  Acid = 10,
  Magic = 11,
  Beach = 12,
}
export const BIOME_COUNT = 13;

export const enum Mat {
  None = 0,
  Water = 1,
  Lava = 2,
  Acid = 3,
  Snow = 4,
  Ice = 5,
}

export const WORLD_SIZES = {
  small: 256,
  medium: 512,
  large: 768,
  huge: 1024,
} as const;
export type WorldSizeKey = keyof typeof WORLD_SIZES;

export class World {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly cw: number;
  readonly ch: number;
  readonly biome: Uint8Array;
  readonly height: Uint8Array;
  readonly moist: Uint8Array;
  readonly baseTemp: Int8Array;
  readonly heat: Float32Array;
  readonly mat: Uint8Array;
  readonly depth: Uint8Array;
  readonly obj: Uint8Array;
  readonly objData: Uint8Array;
  readonly zone: Uint16Array;
  readonly fire: Uint8Array;
  readonly road: Uint8Array;
  readonly dirty: Uint8Array;
  readonly active: Uint8Array;
  readonly kingdomOfZone: Uint8Array;
  readonly ver: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    this.cw = Math.ceil(w / CHUNK);
    this.ch = Math.ceil(h / CHUNK);
    const n = this.n;
    this.biome = new Uint8Array(n);
    this.height = new Uint8Array(n);
    this.moist = new Uint8Array(n);
    this.baseTemp = new Int8Array(n);
    this.heat = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.depth = new Uint8Array(n);
    this.obj = new Uint8Array(n);
    this.objData = new Uint8Array(n);
    this.zone = new Uint16Array(n);
    this.fire = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.dirty = new Uint8Array(this.cw * this.ch);
    this.active = new Uint8Array(this.cw * this.ch);
    this.kingdomOfZone = new Uint8Array(65536);
    this.ver = new Uint32Array(this.cw * this.ch);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  chunkOf(i: number): number {
    const x = i % this.w;
    const y = (i - x) / this.w;
    return (y >> CHUNK_SHIFT) * this.cw + (x >> CHUNK_SHIFT);
  }

  touch(i: number): void {
    const c = this.chunkOf(i);
    this.dirty[c] = 1;
    this.ver[c]!++;
  }

  wake(i: number, ticks = 60): void {
    const c = this.chunkOf(i);
    this.dirty[c] = 1;
    this.ver[c]!++;
    if (this.active[c]! < ticks) this.active[c] = ticks;
    const x = i % this.w;
    const y = (i - x) / this.w;
    const lx = x & (CHUNK - 1);
    const ly = y & (CHUNK - 1);
    if (lx === 0 && x > 0) this.wakeChunk(c - 1, ticks);
    if (lx === CHUNK - 1 && x < this.w - 1) this.wakeChunk(c + 1, ticks);
    if (ly === 0 && y > 0) this.wakeChunk(c - this.cw, ticks);
    if (ly === CHUNK - 1 && y < this.h - 1) this.wakeChunk(c + this.cw, ticks);
  }

  wakeChunk(c: number, ticks = 60): void {
    if (this.active[c]! < ticks) this.active[c] = ticks;
    this.dirty[c] = 1;
    this.ver[c]!++;
  }

  markAllDirty(): void {
    this.dirty.fill(1);
  }

  isWater(i: number): boolean {
    return this.mat[i] === Mat.Water && this.depth[i]! > 0;
  }

  isLand(i: number): boolean {
    const m = this.mat[i]!;
    return !((m === Mat.Water || m === Mat.Lava || m === Mat.Acid) && this.depth[i]! > 2);
  }

  surface(i: number): number {
    return this.height[i]! + (this.mat[i] === Mat.Water || this.mat[i] === Mat.Lava || this.mat[i] === Mat.Acid ? this.depth[i]! : 0);
  }

  zoneKingdom(i: number): number {
    const z = this.zone[i]!;
    return z === 0 ? 0 : this.kingdomOfZone[z]!;
  }

  packChunk(c: number, out0: Uint8Array, out1: Uint8Array): void {
    const cx = c % this.cw;
    const cy = (c - cx) / this.cw;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    let o = 0;
    for (let ly = 0; ly < CHUNK; ly++) {
      const y = y0 + ly;
      for (let lx = 0; lx < CHUNK; lx++, o += 4) {
        const x = x0 + lx;
        if (x >= this.w || y >= this.h) {
          out0[o] = out0[o + 1] = out0[o + 2] = out0[o + 3] = 0;
          out1[o] = out1[o + 1] = out1[o + 2] = out1[o + 3] = 0;
          continue;
        }
        const i = y * this.w + x;
        this.packCell(i, out0, out1, o);
      }
    }
  }

  packCell(i: number, out0: Uint8Array, out1: Uint8Array, o: number): void {
    out0[o] = this.biome[i]! | (this.road[i]! ? 128 : 0);
    out0[o + 1] = this.height[i]!;
    out0[o + 2] = this.mat[i]!;
    out0[o + 3] = this.depth[i]!;
    out1[o] = this.obj[i]!;
    out1[o + 1] = (this.objData[i]! & 15) | (Math.min(15, this.fire[i]!) << 4);
    out1[o + 2] = this.zoneKingdom(i);
    const t = this.heat[i]!;
    out1[o + 3] = t < -50 ? 0 : t > 205 ? 255 : (t + 50) | 0;
  }

  packAll(): { t0: Uint8Array; t1: Uint8Array } {
    const t0 = new Uint8Array(this.n * 4);
    const t1 = new Uint8Array(this.n * 4);
    for (let i = 0; i < this.n; i++) this.packCell(i, t0, t1, i * 4);
    return { t0, t1 };
  }
}
