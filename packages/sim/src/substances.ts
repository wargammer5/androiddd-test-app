import type { Simulation, System } from './sim.ts';
import { World, Mat, CHUNK, SEA_LEVEL, Biome } from './world.ts';
import { hash2 } from './rng.ts';
import { isPlant, isTree, isBuilding, plantStage, Obj, isOre } from './objects.ts';

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

export const LAVA_TEMP = 200;
export const FIRE_TEMP = 90;
const MAX_ACTIVE_PER_TICK = 400;

export function fuelOf(w: World, i: number): number {
  const o = w.obj[i]!;
  const mm = w.mat[i]!;
  if (mm === Mat.Water || mm === Mat.Ice || mm === Mat.Snow || ((mm === Mat.Lava || mm === Mat.Acid) && w.depth[i]! > 0)) return 0;
  if (isPlant(o)) {
    if (isTree(o)) return plantStage(o) >= 3 ? 9 : 5;
    return plantStage(o) >= 2 ? 3 : 1;
  }
  if (isBuilding(o)) return 10;
  if (o === Obj.FieldGrowing || o === Obj.FieldRipe) return 3;
  if (o === Obj.Bridge || o === Obj.Wreck) return 6;
  const b = w.biome[i]!;
  if (b === Biome.Plains || b === Biome.Savanna || b === Biome.Forest || b === Biome.Jungle || b === Biome.Magic) return w.moist[i]! > 200 ? 0 : 1;
  return 0;
}

export interface FireHooks {
  onBurnObject(i: number, obj: number): void;
}

export class Substances implements System {
  readonly name = 'substances';
  hooks: FireHooks | null = null;
  activeCount = 0;
  wind = [0, 0];

  step(sim: Simulation): void {
    const w = sim.world;
    const tick = sim.tick;
    let processed = 0;
    const total = w.active.length;
    const start = (tick * 7) % total;
    this.activeCount = 0;
    for (let k = 0; k < total; k++) {
      const c = (start + k) % total;
      if (w.active[c]! === 0) continue;
      this.activeCount++;
      if (processed >= MAX_ACTIVE_PER_TICK) continue;
      processed++;
      const changed = this.chunk(sim, w, c, tick);
      if (changed) {
        if (w.active[c]! < 24) w.active[c] = 24;
        w.dirty[c] = 1;
        w.ver[c]!++;
      } else w.active[c] = w.active[c]! - 1;
    }
  }

  private chunk(sim: Simulation, w: World, c: number, tick: number): boolean {
    const cx = c % w.cw;
    const cy = (c - cx) / w.cw;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const x1 = Math.min(w.w, x0 + CHUNK);
    const y1 = Math.min(w.h, y0 + CHUNK);
    const rev = (tick & 1) === 1;
    let changed = false;
    for (let yy = y0; yy < y1; yy++) {
      const y = rev ? y1 - 1 - (yy - y0) : yy;
      for (let xx = x0; xx < x1; xx++) {
        const x = rev ? x1 - 1 - (xx - x0) : xx;
        const i = y * w.w + x;
        if (this.cell(sim, w, i, x, y, tick)) changed = true;
      }
    }
    return changed;
  }

  private cell(sim: Simulation, w: World, i: number, x: number, y: number, tick: number): boolean {
    let changed = false;
    const m = w.mat[i]!;
    const d = w.depth[i]!;
    const base = w.baseTemp[i]!;
    let heat = w.heat[i]!;
    const f = w.fire[i]!;
    const lava = m === Mat.Lava && d > 0;
    const source = f > 0 || (lava && w.obj[i] === Obj.Vent);
    const diff = heat - base;
    if (source || diff > 0.5 || diff < -0.5) {
      const k = lava && !source ? 0.03 : 0.09;
      let t = 0;
      if (x + 1 < w.w) {
        const j = i + 1;
        const tr = (heat - w.heat[j]!) * k;
        if (tr > 0.05 || tr < -0.05) {
          w.heat[j] = w.heat[j]! + tr;
          t += tr;
        }
      }
      if (x > 0) {
        const j = i - 1;
        const tr = (heat - w.heat[j]!) * k;
        if (tr > 0.05 || tr < -0.05) {
          w.heat[j] = w.heat[j]! + tr;
          t += tr;
        }
      }
      if (y + 1 < w.h) {
        const j = i + w.w;
        const tr = (heat - w.heat[j]!) * k;
        if (tr > 0.05 || tr < -0.05) {
          w.heat[j] = w.heat[j]! + tr;
          t += tr;
        }
      }
      if (y > 0) {
        const j = i - w.w;
        const tr = (heat - w.heat[j]!) * k;
        if (tr > 0.05 || tr < -0.05) {
          w.heat[j] = w.heat[j]! + tr;
          t += tr;
        }
      }
      heat -= t;
      let target = base;
      if (lava && w.obj[i] === Obj.Vent) target = LAVA_TEMP;
      if (f > 0) target = Math.max(target, FIRE_TEMP + f * 8);
      if (target !== base) heat += (target - heat) * 0.25;
      else heat += (base - heat) * (lava ? 0.002 : 0.04);
      if (!lava && Math.abs(heat - base) < 0.4) heat = base;
      w.heat[i] = heat;
      changed = Math.abs(heat - base) > 1.5;
    }
    if (m === Mat.None && f === 0 && w.obj[i] !== Obj.Spring) return changed;
    if (m !== Mat.None && m !== Mat.Lava && f === 0 && ((tick + (x >> 5) + (y >> 5)) & 1) === 1 && d > 0) return changed;

    if (f > 0) {
      if (this.fire(sim, w, i, x, y, tick, f)) changed = true;
    }

    if (d === 0 || m === Mat.None) {
      if (m !== Mat.None) {
        w.mat[i] = Mat.None;
        changed = true;
      }
      if (w.obj[i] === Obj.Spring && heat < 90) {
        w.mat[i] = Mat.Water;
        w.depth[i] = 2;
        changed = true;
      }
      return changed;
    }

    if (w.still[i]) {
      if (m !== Mat.Water && m !== Mat.Ice) w.still[i] = 0;
      else return changed;
    }
    switch (m) {
      case Mat.Water: {
        if (heat > 100 || (heat > 38 && d === 1 && (hash2(i, tick, 11) & 255) < 3)) {
          w.depth[i] = d - 1;
          if (d - 1 === 0) w.mat[i] = Mat.None;
          w.heat[i] = heat - 6;
          return true;
        }
        if (heat < -4 && w.biome[i] !== Biome.Sea && (hash2(i, tick, 12) & 63) === 0) {
          w.mat[i] = Mat.Ice;
          return true;
        }
        if (w.biome[i] === Biome.Sea && w.height[i]! < SEA_LEVEL && w.height[i]! + d < SEA_LEVEL) {
          w.depth[i] = SEA_LEVEL - w.height[i]!;
          changed = true;
        }
        if (w.fire[i]! > 0) {
          w.fire[i] = 0;
          changed = true;
        }
        if (w.obj[i] === Obj.Spring && d < 4) {
          w.depth[i] = d + 1;
          changed = true;
        }
        if (this.flow(sim, w, i, x, y, tick, 1)) changed = true;
        break;
      }
      case Mat.Lava: {
        if (heat < 100 && (hash2(i, tick, 13) & 15) === 0) {
          w.height[i] = Math.min(255, w.height[i]! + Math.ceil(d / 2));
          w.mat[i] = Mat.None;
          w.depth[i] = 0;
          if (w.biome[i] !== Biome.Sea) w.biome[i] = Biome.Volcanic;
          else w.biome[i] = Biome.Mountain;
          return true;
        }
        if (w.obj[i] !== Obj.Vent && w.obj[i] !== 0) {
          const o = w.obj[i]!;
          if (fuelOf(w, i) > 0) this.hooks?.onBurnObject(i, o);
          w.obj[i] = isOre(o) ? o : 0;
          changed = true;
        }
        if (w.obj[i] === Obj.Vent) {
          w.heat[i] = LAVA_TEMP;
          if ((tick + i) % 30 === 0 && d < 6) {
            w.depth[i] = d + 1;
            changed = true;
          }
        }
        if ((tick + i) % 3 === 0 && this.flow(sim, w, i, x, y, tick, 2)) changed = true;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k]!;
          const ny = y + DY[k]!;
          if (!w.inside(nx, ny)) continue;
          const j = ny * w.w + nx;
          if (w.fire[j] === 0 && fuelOf(w, j) > 0 && (hash2(j, tick, 14) & 7) === 0) {
            w.fire[j] = 3;
            w.wake(j, 30);
            changed = true;
          }
          if (w.mat[j] === Mat.Snow || w.mat[j] === Mat.Ice) {
            w.mat[j] = Mat.Water;
            w.wake(j);
            changed = true;
          }
        }
        changed = true;
        break;
      }
      case Mat.Acid: {
        const o = w.obj[i]!;
        if (o !== 0 && (hash2(i, tick, 15) & 7) === 0) {
          w.obj[i] = o === Obj.Spring || o === Obj.Vent ? o : 0;
          changed = true;
        }
        if ((hash2(i, tick, 16) & 255) < 2 && w.height[i]! > 2) {
          w.height[i] = w.height[i]! - 1;
          changed = true;
        }
        if ((hash2(i, tick, 17) & 255) < 2) {
          w.depth[i] = d - 1;
          if (d - 1 === 0) w.mat[i] = Mat.None;
          if (w.biome[i] !== Biome.Sea && (hash2(i, tick, 18) & 3) === 0) w.biome[i] = Biome.Acid;
          return true;
        }
        if (w.fire[i]! > 0) w.fire[i] = 0;
        if (this.flow(sim, w, i, x, y, tick, 1)) changed = true;
        break;
      }
      case Mat.Snow: {
        if (heat > 2 && (hash2(i, tick, 19) & 15) === 0) {
          if (d <= 1) {
            w.mat[i] = Mat.Water;
            w.depth[i] = 1;
          } else w.depth[i] = d - 1;
          return true;
        }
        if (w.fire[i]! > 0) {
          w.fire[i] = 0;
          changed = true;
        }
        break;
      }
      case Mat.Ice: {
        if (heat > 2 && (hash2(i, tick, 20) & 15) === 0) {
          w.mat[i] = Mat.Water;
          return true;
        }
        break;
      }
    }
    return changed;
  }

  private flow(sim: Simulation, w: World, i: number, x: number, y: number, tick: number, minDiff: number): boolean {
    const m = w.mat[i]!;
    const d = w.depth[i]!;
    const s = w.height[i]! + d;
    let best = -1;
    let bestS = s;
    const r = hash2(i, tick, 21) & 3;
    for (let kk = 0; kk < 4; kk++) {
      const k = (kk + r) & 3;
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
      const j = ny * w.w + nx;
      const nm = w.mat[j]!;
      if (nm !== Mat.None && nm !== m && w.depth[j]! > 0) {
        if (this.react(sim, w, i, j, m, nm)) return true;
        continue;
      }
      const ns = w.height[j]! + (nm === m ? w.depth[j]! : 0);
      if (ns < bestS) {
        bestS = ns;
        best = j;
      }
    }
    if (best < 0) return false;
    const diff = s - bestS;
    if (diff < minDiff) return false;
    let amt = Math.min(d, Math.max(1, diff >> 1));
    if (diff === 1 && d < 2) return false;
    if (amt <= 0) return false;
    if (w.mat[best] !== m) {
      w.mat[best] = m;
      w.depth[best] = 0;
    }
    if (w.still[best]) this.unstill(w, best);
    if (w.depth[best]! + amt > 255) amt = 255 - w.depth[best]!;
    w.depth[best] = w.depth[best]! + amt;
    w.depth[i] = d - amt;
    if (w.depth[i] === 0) w.mat[i] = Mat.None;
    if (m === Mat.Water && w.fire[best]! > 0) w.fire[best] = 0;
    w.wake(best, 24);
    if (m === Mat.Lava) w.heat[best] = Math.max(w.heat[best]!, w.heat[i]! - 5);
    return true;
  }

  unstill(w: World, i: number): void {
    const x0 = i % w.w;
    const y0 = (i - x0) / w.w;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!w.inside(x, y)) continue;
        const j = y * w.w + x;
        if (w.still[j]) {
          w.still[j] = 0;
          w.wake(j, 24);
        }
      }
  }

  private react(_sim: Simulation, w: World, i: number, j: number, m: number, nm: number): boolean {
    if (w.still[i]) this.unstill(w, i);
    if (w.still[j]) this.unstill(w, j);
    const pair = (a: number, b: number) => (m === a && nm === b) || (m === b && nm === a);
    if (pair(Mat.Water, Mat.Lava)) {
      const lava = m === Mat.Lava ? i : j;
      const water = m === Mat.Lava ? j : i;
      w.height[lava] = Math.min(255, w.height[lava]! + Math.max(1, w.depth[lava]! >> 1));
      w.mat[lava] = Mat.None;
      w.depth[lava] = 0;
      w.obj[lava] = Obj.Stone;
      w.heat[lava] = 90;
      w.depth[water] = Math.max(0, w.depth[water]! - 1);
      if (w.depth[water] === 0) w.mat[water] = Mat.None;
      w.heat[water] = Math.max(w.heat[water]!, 80);
      w.wake(lava);
      w.wake(water);
      return true;
    }
    if (pair(Mat.Water, Mat.Acid)) {
      const acid = m === Mat.Acid ? i : j;
      w.depth[acid] = Math.max(0, w.depth[acid]! - 1);
      if (w.depth[acid] === 0) w.mat[acid] = Mat.None;
      w.wake(acid);
      return true;
    }
    if (pair(Mat.Lava, Mat.Snow) || pair(Mat.Lava, Mat.Ice)) {
      const cold = m === Mat.Lava ? j : i;
      w.mat[cold] = Mat.Water;
      w.depth[cold] = Math.max(1, w.depth[cold]!);
      w.wake(cold);
      return true;
    }
    if (pair(Mat.Lava, Mat.Acid)) {
      const acid = m === Mat.Acid ? i : j;
      w.depth[acid] = Math.max(0, w.depth[acid]! - 1);
      if (w.depth[acid] === 0) w.mat[acid] = Mat.None;
      w.wake(acid);
      return true;
    }
    return false;
  }

  private fire(sim: Simulation, w: World, i: number, x: number, y: number, tick: number, f: number): boolean {
    const fuel = fuelOf(w, i);
    const h = hash2(i, tick, 22);
    if (fuel === 0) {
      w.fire[i] = f > 2 ? f - 2 : 0;
      return true;
    }
    if (sim.weatherRain(i)) {
      if ((h & 1) === 0) w.fire[i] = f > 2 ? f - 2 : 0;
      return true;
    }
    const maxF = Math.min(15, fuel * 2 + 2);
    if (f < maxF && (h & 3) === 0) w.fire[i] = f + 1;
    const spread = f >= 3 && ((h >>> 4) & 7) < 3;
    if (spread) {
      const k = (h >>> 8) & 3;
      let nx = x + DX[k]!;
      let ny = y + DY[k]!;
      if ((this.wind[0] || this.wind[1]) && ((h >>> 12) & 3) === 0) {
        nx = x + this.wind[0]!;
        ny = y + this.wind[1]!;
      }
      if (w.inside(nx, ny)) {
        const j = ny * w.w + nx;
        const fj = fuelOf(w, j);
        const dryness = Math.max(0, 1 - w.moist[j]! / 280);
        if (w.fire[j] === 0 && fj > 0 && ((h >>> 16) & 255) < 255 * dryness * (fj <= 1 ? 0.035 : Math.min(1, fj / 10 + 0.1))) {
          w.fire[j] = 2;
          w.wake(j, 30);
        }
      }
    }
    if (f >= maxF - 1 && ((h >>> 20) & 15) === 0) {
      const o = w.obj[i]!;
      if (o !== 0) {
        this.hooks?.onBurnObject(i, o);
        if (isTree(o)) w.obj[i] = Obj.Burnt;
        else if (isBuilding(o)) w.obj[i] = Obj.Ruins;
        else if (isPlant(o) || o === Obj.FieldGrowing || o === Obj.FieldRipe || o === Obj.Bridge || o === Obj.Wreck) w.obj[i] = Obj.Ash;
      } else {
        w.obj[i] = Obj.Ash;
        w.fire[i] = f - 3;
      }
      return true;
    }
    return true;
  }
}
