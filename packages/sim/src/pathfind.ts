import { World, Mat, Biome } from './world.ts';
import { blocksMove } from './objects.ts';
import { biomes } from '@sotv/content';

const BIOME_COST = biomes.map((b) => b.moveCost);
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
const DC8 = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

export const enum Mover {
  Walk = 0,
  Swim = 1,
  Fly = 2,
  Boat = 3,
}

export function passable(w: World, i: number, mode: Mover): boolean {
  if (mode === Mover.Fly) return true;
  const m = w.mat[i]!;
  const d = w.depth[i]!;
  if (mode === Mover.Boat) return m === Mat.Water && d >= 2;
  if (m === Mat.Lava && d > 0) return false;
  if (m === Mat.Acid && d > 1) return false;
  if (m === Mat.Water && d > 3 && mode !== Mover.Swim && !w.road[i]) return false;
  if (blocksMove(w.obj[i]!)) return false;
  return true;
}

export function moveCost(w: World, i: number, mode: Mover): number {
  if (mode === Mover.Fly) return 1;
  if (w.road[i]) return 0.6;
  const m = w.mat[i]!;
  let c = BIOME_COST[w.biome[i]!] ?? 1;
  if (w.biome[i] === Biome.Sea) c = 1;
  if (m === Mat.Water && w.depth[i]! > 0) c += mode === Mover.Swim ? 0.5 : w.depth[i]! * 0.8;
  if (m === Mat.Snow) c += 0.5;
  if (w.fire[i]! > 0) c += 8;
  return c;
}

class Heap {
  ids = new Int32Array(1 << 16);
  keys = new Float32Array(1 << 16);
  size = 0;

  push(id: number, k: number): void {
    if (this.size >= this.ids.length) {
      const ni = new Int32Array(this.ids.length * 2);
      ni.set(this.ids);
      const nk = new Float32Array(this.keys.length * 2);
      nk.set(this.keys);
      this.ids = ni;
      this.keys = nk;
    }
    let p = this.size++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.keys[q]! <= k) break;
      this.ids[p] = this.ids[q]!;
      this.keys[p] = this.keys[q]!;
      p = q;
    }
    this.ids[p] = id;
    this.keys[p] = k;
  }

  pop(): number {
    const top = this.ids[0]!;
    const n = --this.size;
    if (n > 0) {
      const id = this.ids[n]!;
      const k = this.keys[n]!;
      let p = 0;
      for (;;) {
        let c = p * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && this.keys[c + 1]! < this.keys[c]!) c++;
        if (this.keys[c]! >= k) break;
        this.ids[p] = this.ids[c]!;
        this.keys[p] = this.keys[c]!;
        p = c;
      }
      this.ids[p] = id;
      this.keys[p] = k;
    }
    return top;
  }
}

export const COARSE = 8;

export class Pathfinder {
  private g: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private cur = 1;
  private heap = new Heap();
  readonly cw: number;
  readonly ch: number;
  private coarsePass: Uint8Array;
  private coarseAt: Int32Array;
  private cg: Float32Array;
  private cparent: Int32Array;
  private cstamp: Uint32Array;
  private cclosed: Uint32Array;
  nodesThisTick = 0;
  searches = 0;

  constructor(readonly w: World) {
    this.g = new Float32Array(w.n);
    this.parent = new Int32Array(w.n);
    this.stamp = new Uint32Array(w.n);
    this.closed = new Uint32Array(w.n);
    this.cw = Math.ceil(w.w / COARSE);
    this.ch = Math.ceil(w.h / COARSE);
    const cn = this.cw * this.ch;
    this.coarsePass = new Uint8Array(cn * 3);
    this.coarseAt = new Int32Array(cn * 3).fill(-100000);
    this.cg = new Float32Array(cn);
    this.cparent = new Int32Array(cn);
    this.cstamp = new Uint32Array(cn);
    this.cclosed = new Uint32Array(cn);
  }

  find(from: number, to: number, mode: Mover, budget = 3000): Int32Array | null {
    const w = this.w;
    if (from === to) return new Int32Array([to]);
    if (!passable(w, to, mode)) return null;
    this.searches++;
    const s = ++this.cur;
    const g = this.g;
    const st = this.stamp;
    const cl = this.closed;
    const par = this.parent;
    const heap = this.heap;
    heap.size = 0;
    const W = w.w;
    const tx = to % W;
    const ty = (to - tx) / W;
    const h = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      const dx = Math.abs(x - tx);
      const dy = Math.abs(y - ty);
      return (dx + dy + (1.414 - 2) * Math.min(dx, dy)) * 0.9;
    };
    g[from] = 0;
    st[from] = s;
    par[from] = -1;
    heap.push(from, h(from));
    let n = 0;
    let best = from;
    let bestH = h(from);
    while (heap.size > 0) {
      const c = heap.pop();
      if (cl[c] === s) continue;
      cl[c] = s;
      if (c === to) {
        best = c;
        break;
      }
      const hc = h(c);
      if (hc < bestH) {
        bestH = hc;
        best = c;
      }
      if (++n > budget) break;
      const cx = c % W;
      const cy = (c - cx) / W;
      const gc = g[c]!;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX8[k]!;
        const ny = cy + DY8[k]!;
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
        const j = ny * W + nx;
        if (cl[j] === s) continue;
        if (!passable(w, j, mode)) continue;
        if (k >= 4 && (!passable(w, cy * W + nx, mode) || !passable(w, ny * W + cx, mode))) continue;
        const ng = gc + DC8[k]! * moveCost(w, j, mode);
        if (st[j] !== s || ng < g[j]!) {
          st[j] = s;
          g[j] = ng;
          par[j] = c;
          heap.push(j, ng + h(j));
        }
      }
    }
    this.nodesThisTick += n;
    if (best === from) return null;
    let len = 0;
    for (let c = best; c !== -1 && c !== from; c = par[c]!) len++;
    const path = new Int32Array(len);
    let k = len - 1;
    for (let c = best; c !== -1 && c !== from; c = par[c]!) path[k--] = c;
    return path;
  }

  private coarseOk(b: number, mode: Mover, _tick: number): boolean {
    const slot = b * 3 + Math.min(mode, 2);
    const w0 = this.w;
    const chunk = (Math.floor(Math.floor(b / this.cw) * COARSE / 32)) * w0.cw + Math.floor(((b % this.cw) * COARSE) / 32);
    const v = w0.ver[chunk]!;
    if (this.coarseAt[slot] !== v || this.coarseAt[slot] === -100000) {
      const w = this.w;
      const bx = (b % this.cw) * COARSE;
      const by = Math.floor(b / this.cw) * COARSE;
      let ok = 0;
      let tot = 0;
      for (let y = by; y < Math.min(w.h, by + COARSE); y++)
        for (let x = bx; x < Math.min(w.w, bx + COARSE); x++) {
          tot++;
          if (passable(w, y * w.w + x, mode)) ok++;
        }
      this.coarsePass[slot] = ok * 2 > tot ? 1 : 0;
      this.coarseAt[slot] = v;
    }
    return this.coarsePass[slot] === 1;
  }

  invalidateCoarse(x: number, y: number): void {
    const b = Math.floor(y / COARSE) * this.cw + Math.floor(x / COARSE);
    for (let k = 0; k < 3; k++) this.coarseAt[b * 3 + k] = -100000;
  }

  coarse(from: number, to: number, mode: Mover, tick: number, budget = 4000): number[] | null {
    const W = this.w.w;
    const fb = Math.floor(Math.floor(from / W) / COARSE) * this.cw + Math.floor((from % W) / COARSE);
    const tb = Math.floor(Math.floor(to / W) / COARSE) * this.cw + Math.floor((to % W) / COARSE);
    if (fb === tb) return [to];
    const s = ++this.cur;
    const g = this.cg;
    const st = this.cstamp;
    const cl = this.cclosed;
    const par = this.cparent;
    const heap = this.heap;
    heap.size = 0;
    const tbx = tb % this.cw;
    const tby = Math.floor(tb / this.cw);
    const h = (b: number) => {
      const dx = Math.abs((b % this.cw) - tbx);
      const dy = Math.abs(Math.floor(b / this.cw) - tby);
      return dx + dy + (1.414 - 2) * Math.min(dx, dy);
    };
    g[fb] = 0;
    st[fb] = s;
    par[fb] = -1;
    heap.push(fb, h(fb));
    let n = 0;
    let found = false;
    while (heap.size > 0) {
      const c = heap.pop();
      if (cl[c] === s) continue;
      cl[c] = s;
      if (c === tb) {
        found = true;
        break;
      }
      if (++n > budget) break;
      const cx = c % this.cw;
      const cy = Math.floor(c / this.cw);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX8[k]!;
        const ny = cy + DY8[k]!;
        if (nx < 0 || ny < 0 || nx >= this.cw || ny >= this.ch) continue;
        const j = ny * this.cw + nx;
        if (cl[j] === s) continue;
        if (j !== tb && !this.coarseOk(j, mode, tick)) continue;
        const ng = g[c]! + DC8[k]!;
        if (st[j] !== s || ng < g[j]!) {
          st[j] = s;
          g[j] = ng;
          par[j] = c;
          heap.push(j, ng + h(j));
        }
      }
    }
    this.nodesThisTick += n;
    if (!found) return null;
    const blocks: number[] = [];
    for (let c = tb; c !== -1 && c !== fb; c = par[c]!) blocks.push(c);
    blocks.reverse();
    const out: number[] = [];
    for (let k = 0; k < blocks.length - 1; k++) {
      const b = blocks[k]!;
      const cx = (b % this.cw) * COARSE + (COARSE >> 1);
      const cy = Math.floor(b / this.cw) * COARSE + (COARSE >> 1);
      out.push(this.nearestPassable(cx, cy, mode, 4) ?? Math.min(this.w.h - 1, cy) * W + Math.min(W - 1, cx));
    }
    out.push(to);
    return out;
  }

  nearestPassable(x: number, y: number, mode: Mover, r: number): number | null {
    const w = this.w;
    for (let d = 0; d <= r; d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const xx = Math.floor(x) + dx;
          const yy = Math.floor(y) + dy;
          if (!w.inside(xx, yy)) continue;
          const i = yy * w.w + xx;
          if (passable(w, i, mode)) return i;
        }
    return null;
  }
}

export class FlowField {
  dist: Uint16Array;
  readonly x0: number;
  readonly y0: number;
  readonly size: number;
  builtAt: number;

  constructor(w: World, targets: number[], radius: number, mode: Mover, tick: number) {
    let sx = 0;
    let sy = 0;
    for (const t of targets) {
      sx += t % w.w;
      sy += Math.floor(t / w.w);
    }
    const cx = Math.round(sx / Math.max(1, targets.length));
    const cy = Math.round(sy / Math.max(1, targets.length));
    this.size = radius * 2 + 1;
    this.x0 = cx - radius;
    this.y0 = cy - radius;
    this.builtAt = tick;
    this.dist = new Uint16Array(this.size * this.size).fill(65535);
    const q = new Int32Array(this.size * this.size);
    let qh = 0;
    let qt = 0;
    for (const t of targets) {
      const l = this.local(t % w.w, Math.floor(t / w.w));
      if (l >= 0 && this.dist[l] !== 0) {
        this.dist[l] = 0;
        q[qt++] = l;
      }
    }
    while (qh < qt) {
      const l = q[qh++]!;
      const lx = l % this.size;
      const ly = (l - lx) / this.size;
      const d = this.dist[l]!;
      for (let k = 0; k < 4; k++) {
        const nx = lx + DX8[k]!;
        const ny = ly + DY8[k]!;
        if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
        const wx = nx + this.x0;
        const wy = ny + this.y0;
        if (!w.inside(wx, wy)) continue;
        const nl = ny * this.size + nx;
        if (this.dist[nl] !== 65535) continue;
        if (!passable(w, wy * w.w + wx, mode)) continue;
        this.dist[nl] = d + 1;
        q[qt++] = nl;
      }
    }
  }

  local(x: number, y: number): number {
    const lx = x - this.x0;
    const ly = y - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.size || ly >= this.size) return -1;
    return ly * this.size + lx;
  }

  distAt(x: number, y: number): number {
    const l = this.local(x, y);
    return l < 0 ? 65535 : this.dist[l]!;
  }

  next(x: number, y: number): [number, number] | null {
    const d0 = this.distAt(x, y);
    if (d0 === 0 || d0 === 65535) return null;
    let best: [number, number] | null = null;
    let bd = d0;
    for (let k = 0; k < 8; k++) {
      const d = this.distAt(x + DX8[k]!, y + DY8[k]!);
      if (d < bd) {
        bd = d;
        best = [x + DX8[k]!, y + DY8[k]!];
      }
    }
    return best;
  }
}
