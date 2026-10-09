import { Rng } from './rng.ts';
import { fbm, ridged, perlin } from './noise.ts';
import { World, SEA_LEVEL, Biome, Mat } from './world.ts';
import { Obj } from './objects.ts';

export interface GenParams {
  landRatio: number;
  mountains: number;
  rivers: number;
  lakes: number;
  temperature: number;
}

export const DEFAULT_GEN: GenParams = { landRatio: 0.45, mountains: 1, rivers: 1, lakes: 1, temperature: 0 };

const D4 = [1, 0, -1, 0, 0, 1, 0, -1];
const D8 = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 1];

export function generateWorld(world: World, rng: Rng, p: GenParams = DEFAULT_GEN): void {
  const { w, h, n } = world;
  const seed = rng.nextU32();
  const sA = seed ^ 0x1234;
  const sB = seed ^ 0x9876;
  const sC = seed ^ 0x5555;
  const sM = seed ^ 0x7777;
  const sT = seed ^ 0x3131;
  const scale = 2.6 + Math.sqrt(w / 256) * 1.4;
  const raw = new Float32Array(n);
  const mount = new Float32Array(n);
  const cont = 3 + rng.int(3);
  const centers: [number, number, number][] = [];
  for (let c = 0; c < cont; c++) centers.push([rng.range(0.15, 0.85), rng.range(0.15, 0.85), rng.range(0.12, 0.24)]);
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const i = y * w + x;
      const wx = nx * scale + fbm(nx * scale * 1.5, ny * scale * 1.5, sB, 3) * 0.6;
      const wy = ny * scale + fbm(nx * scale * 1.5 + 9.1, ny * scale * 1.5 + 3.7, sB, 3) * 0.6;
      let v = fbm(wx, wy, sA, 6) * 1.2;
      let cv = 0;
      for (const [cx, cy, r] of centers) {
        const d = Math.hypot(nx - cx, ny - cy) / r;
        cv = Math.max(cv, 1 - d);
      }
      v += cv * 0.4;
      const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
      v -= Math.max(0, 0.12 - edge) * 6;
      raw[i] = v;
      mount[i] = ridged(wx * 1.6, wy * 1.6, sM, 5);
    }
  }
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) sample.push(raw[i]!);
  sample.sort((a, b) => a - b);
  const thr = sample[Math.floor(sample.length * (1 - p.landRatio))]!;
  const maxV = sample[sample.length - 1]!;
  const minV = sample[0]!;
  for (let i = 0; i < n; i++) {
    const v = raw[i]!;
    if (v >= thr) {
      const e = (v - thr) / (maxV - thr + 1e-6);
      const inland = Math.min(1, e * 3);
      const m = Math.max(0, mount[i]! - 0.47) * inland * p.mountains;
      world.height[i] = Math.min(255, SEA_LEVEL + 1 + Math.round(Math.pow(e, 1.3) * 45 + m * 260));
    } else {
      const e = (thr - v) / (thr - minV + 1e-6);
      world.height[i] = Math.max(20, SEA_LEVEL - 1 - Math.round(Math.pow(e, 0.7) * 70));
    }
  }
  smooth(world, 1);
  for (let i = 0; i < n; i++) {
    if (world.height[i]! < SEA_LEVEL) {
      world.mat[i] = Mat.Water;
      world.depth[i] = SEA_LEVEL - world.height[i]!;
    }
  }
  makeLakes(world, rng, p);
  makeRivers(world, rng, p);
  const dist = waterDistance(world, 40);
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(y / h - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nx = x / w;
      const ny = y / h;
      const mo = fbm(nx * scale * 2, ny * scale * 2, sC, 4) * 0.5 + 0.5;
      const wet = Math.max(0, 1 - dist[i]! / 40);
      world.moist[i] = Math.max(0, Math.min(255, Math.round((mo * 0.95 + wet * 0.3 - 0.12) * 255)));
      const alt = Math.max(0, world.height[i]! - SEA_LEVEL);
      const t = 33 - lat * lat * 44 - alt * 0.16 + perlin(nx * 6, ny * 6, sT) * 6 + p.temperature;
      world.baseTemp[i] = Math.max(-60, Math.min(60, Math.round(t)));
    }
  }
  for (let i = 0; i < n; i++) world.biome[i] = classify(world, i, dist[i]!);
  specialBiomes(world, rng);
  for (let i = 0; i < n; i++) {
    world.heat[i] = world.baseTemp[i]!;
    if (world.biome[i] === Biome.Snow && world.mat[i] === Mat.None && world.baseTemp[i]! < -2) {
      world.mat[i] = Mat.Snow;
      world.depth[i] = 2 + (rng.int(3));
    }
    if (world.mat[i] === Mat.Water && world.baseTemp[i]! < -12 && world.depth[i]! < 25) world.mat[i] = Mat.Ice;
  }
  placeResources(world, rng);
  world.markAllDirty();
}

function smooth(world: World, passes: number): void {
  const { w, h } = world;
  const tmp = new Uint8Array(world.n);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += world.height[yy * w + xx]!;
            c++;
          }
        tmp[y * w + x] = Math.round(s / c);
      }
    world.height.set(tmp);
  }
}

function makeLakes(world: World, rng: Rng, p: GenParams): void {
  const { w, h } = world;
  const count = Math.round((w * h) / 30000 * p.lakes);
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const cx = rng.irange(10, w - 11);
      const cy = rng.irange(10, h - 11);
      const ci = cy * w + cx;
      const hh = world.height[ci]!;
      if (hh < SEA_LEVEL + 4 || hh > SEA_LEVEL + 60 || world.mat[ci] !== Mat.None) continue;
      const r = rng.range(3, 4 + w / 64);
      const level = hh;
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
        for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
          if (!world.inside(x, y)) continue;
          const d = Math.hypot(x - cx, y - cy) / r + perlin(x * 0.3, y * 0.3, k) * 0.35;
          if (d > 1) continue;
          const i = y * w + x;
          const depth = Math.max(1, Math.round((1 - d) * 8) + 1);
          world.height[i] = Math.max(1, level - depth);
          world.mat[i] = Mat.Water;
          world.depth[i] = depth;
        }
      break;
    }
  }
}

function makeRivers(world: World, rng: Rng, p: GenParams): void {
  const { w, h } = world;
  const count = Math.round((w * h) / 22000 * p.rivers);
  for (let k = 0; k < count; k++) {
    let src = -1;
    for (let tries = 0; tries < 60; tries++) {
      const i = rng.int(world.n);
      if (world.height[i]! > SEA_LEVEL + 45 && world.mat[i] === Mat.None) {
        src = i;
        break;
      }
    }
    if (src < 0) continue;
    const path: number[] = [];
    const seen = new Set<number>();
    let cur = src;
    let curH = world.height[src]!;
    for (let s = 0; s < w * 2; s++) {
      path.push(cur);
      seen.add(cur);
      if (world.mat[cur] === Mat.Water && s > 0) break;
      const x = cur % w;
      const y = (cur - x) / w;
      let best = -1;
      let bestV = Infinity;
      for (let d = 0; d < 8; d += 2) {
        const xx = x + D4[d]!;
        const yy = y + D4[d + 1]!;
        if (!world.inside(xx, yy)) continue;
        const j = yy * w + xx;
        if (seen.has(j)) continue;
        const v = world.height[j]! + rng.float() * 3;
        if (v < bestV) {
          bestV = v;
          best = j;
        }
      }
      if (best < 0) break;
      cur = best;
    }
    if (path.length < 12) continue;
    world.obj[src] = Obj.Spring;
    for (let s = 0; s < path.length; s++) {
      const i = path[s]!;
      if (world.mat[i] === Mat.Water && world.depth[i]! > 2) break;
      curH = Math.min(curH, world.height[i]!);
      const bed = Math.max(SEA_LEVEL - 1, curH - 2);
      world.height[i] = bed;
      world.mat[i] = Mat.Water;
      world.depth[i] = Math.max(world.depth[i]!, 2);
      if (s > path.length * 0.4) {
        const x = i % w;
        const y = (i - x) / w;
        for (let d = 0; d < 8; d += 2) {
          const xx = x + D4[d]!;
          const yy = y + D4[d + 1]!;
          if (!world.inside(xx, yy) || rng.chance(0.6)) continue;
          const j = yy * w + xx;
          if (world.mat[j] !== Mat.None) continue;
          world.height[j] = Math.min(world.height[j]!, bed);
          world.mat[j] = Mat.Water;
          world.depth[j] = 2;
        }
      }
    }
  }
}

export function waterDistance(world: World, cap: number): Uint8Array {
  const { w, h, n } = world;
  const dist = new Uint8Array(n).fill(cap);
  const q = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < n; i++)
    if (world.mat[i] === Mat.Water) {
      dist[i] = 0;
      q[qt++] = i;
    }
  while (qh < qt) {
    const i = q[qh++]!;
    const d = dist[i]!;
    if (d >= cap - 1) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let k = 0; k < 8; k += 2) {
      const xx = x + D4[k]!;
      const yy = y + D4[k + 1]!;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (dist[j]! > d + 1) {
        dist[j] = d + 1;
        q[qt++] = j;
      }
    }
  }
  return dist;
}

export function classify(world: World, i: number, waterDist: number): Biome {
  const hgt = world.height[i]!;
  if (world.mat[i] === Mat.Water && world.depth[i]! > 0 && hgt < SEA_LEVEL) return Biome.Sea;
  const t = world.baseTemp[i]!;
  const m = world.moist[i]! / 255;
  if (hgt > SEA_LEVEL + 85) return t < 2 ? Biome.Snow : Biome.Mountain;
  if (hgt > SEA_LEVEL + 62 && m < 0.75) return t < -4 ? Biome.Snow : Biome.Mountain;
  if (t < -6) return Biome.Snow;
  if (waterDist <= 2 && hgt <= SEA_LEVEL + 3 && world.mat[i] !== Mat.Water) return Biome.Beach;
  if (t > 24) {
    if (m < 0.33) return Biome.Desert;
    if (m < 0.55) return Biome.Savanna;
    return Biome.Jungle;
  }
  if (t > 16) {
    if (m < 0.25) return Biome.Desert;
    if (m < 0.45) return Biome.Savanna;
    if (m > 0.78 && hgt < SEA_LEVEL + 12) return Biome.Swamp;
    return m > 0.6 ? Biome.Forest : Biome.Plains;
  }
  if (m > 0.8 && hgt < SEA_LEVEL + 10) return Biome.Swamp;
  if (m > 0.52) return Biome.Forest;
  return Biome.Plains;
}

function blob(world: World, rng: Rng, cx: number, cy: number, r: number, fn: (i: number, d: number) => void): void {
  const { w } = world;
  const s = rng.nextU32();
  for (let y = Math.floor(cy - r * 1.4); y <= cy + r * 1.4; y++)
    for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      if (!world.inside(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / r + perlin(x * 0.15, y * 0.15, s) * 0.5;
      if (d < 1) fn(y * w + x, d);
    }
}

function randomLand(world: World, rng: Rng, pred: (i: number) => boolean): number {
  for (let t = 0; t < 400; t++) {
    const i = rng.int(world.n);
    if (world.mat[i] === Mat.None && pred(i)) return i;
  }
  return -1;
}

function specialBiomes(world: World, rng: Rng): void {
  const { w } = world;
  const scale = w / 256;
  const magic = 1 + rng.int(2);
  for (let k = 0; k < magic; k++) {
    const i = randomLand(world, rng, (j) => world.biome[j] === Biome.Forest || world.biome[j] === Biome.Plains);
    if (i < 0) continue;
    blob(world, rng, i % w, Math.floor(i / w), rng.range(5, 9) * Math.sqrt(scale), (j) => {
      if (world.mat[j] === Mat.None && world.biome[j] !== Biome.Beach) world.biome[j] = Biome.Magic;
    });
  }
  if (rng.chance(0.7)) {
    const i = randomLand(world, rng, (j) => world.biome[j] === Biome.Desert || world.biome[j] === Biome.Savanna || world.biome[j] === Biome.Plains);
    if (i >= 0)
      blob(world, rng, i % w, Math.floor(i / w), rng.range(4, 8) * Math.sqrt(scale), (j) => {
        if (world.mat[j] === Mat.None) world.biome[j] = Biome.Acid;
      });
  }
  const volc = 1 + rng.int(2);
  for (let k = 0; k < volc; k++) {
    const i = randomLand(world, rng, (j) => world.height[j]! > SEA_LEVEL + 30);
    if (i < 0) continue;
    const cx = i % w;
    const cy = Math.floor(i / w);
    const r = rng.range(6, 11) * Math.sqrt(scale);
    blob(world, rng, cx, cy, r, (j, d) => {
      if (world.mat[j] !== Mat.None && world.mat[j] !== Mat.Snow) return;
      world.biome[j] = Biome.Volcanic;
      world.height[j] = Math.min(255, world.height[j]! + Math.round((1 - d) * 40));
      world.baseTemp[j] = Math.min(60, world.baseTemp[j]! + 15);
    });
    for (let y = cy - 2; y <= cy + 2; y++)
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (!world.inside(x, y) || Math.hypot(x - cx, y - cy) > 2.2) continue;
        const j = y * w + x;
        world.mat[j] = Mat.Lava;
        world.depth[j] = 3;
        world.height[j] = Math.max(SEA_LEVEL + 20, world.height[j]! - 10);
      }
    world.obj[cy * w + cx] = Obj.Vent;
  }
}

function placeResources(world: World, rng: Rng): void {
  const { w, h } = world;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (world.mat[i] !== Mat.None || world.obj[i] !== 0) continue;
      const b = world.biome[i]!;
      if (b === Biome.Mountain) {
        const r = rng.float();
        if (r < 0.015) world.obj[i] = Obj.IronOre;
        else if (r < 0.02) world.obj[i] = Obj.GoldOre;
        else if (r < 0.022) world.obj[i] = Obj.Gems;
        else if (r < 0.06) world.obj[i] = Obj.Stone;
        else if (r < 0.0625) world.obj[i] = Obj.Cave;
      } else if (b === Biome.Desert || b === Biome.Savanna || b === Biome.Plains) {
        const r = rng.float();
        if (r < 0.004) world.obj[i] = Obj.Stone;
        else if (r < 0.0045) world.obj[i] = Obj.IronOre;
      } else if (b === Biome.Snow && rng.chance(0.006)) world.obj[i] = Obj.Stone;
      else if (b === Biome.Magic && rng.chance(0.004)) world.obj[i] = Obj.Gems;
    }
  const ruins = Math.max(1, Math.round((w * h) / 120000));
  for (let k = 0; k < ruins; k++) {
    const i = randomLand(world, rng, (j) => world.biome[j] === Biome.Plains || world.biome[j] === Biome.Desert);
    if (i >= 0 && world.obj[i] === 0) world.obj[i] = Obj.Ruins;
  }
}

export { D4, D8 };
