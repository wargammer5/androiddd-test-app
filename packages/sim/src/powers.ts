import type { Simulation } from './sim.ts';
import type { Command } from './protocol.ts';
import { forBrush } from './brush.ts';
import { Biome, Mat, SEA_LEVEL } from './world.ts';
import { classify } from './worldgen.ts';

export type PowerCmd = Extract<Command, { t: 'power' }>;

export interface PowerDef {
  id: string;
  tab: 'world' | 'civ' | 'creatures' | 'nature' | 'destruction' | 'other';
  icon: string;
  brush: boolean;
  danger?: boolean;
  minRadius?: number;
  args?: string[];
  apply(sim: Simulation, c: PowerCmd): void;
}

export const POWERS = new Map<string, PowerDef>();

export function definePower(p: PowerDef): void {
  POWERS.set(p.id, p);
}

const BIOME_KEYS = ['sea', 'plains', 'forest', 'jungle', 'savanna', 'desert', 'mountain', 'snow', 'swamp', 'volcanic', 'acid', 'magic', 'beach'];

export function biomeFromKey(k: string | number | undefined): number {
  if (typeof k === 'number') return k;
  const i = BIOME_KEYS.indexOf(k ?? 'plains');
  return i < 0 ? Biome.Plains : i;
}

export function reclassify(sim: Simulation, i: number): void {
  const w = sim.world;
  const hgt = w.height[i]!;
  if (hgt >= SEA_LEVEL && w.biome[i] === Biome.Sea) {
    w.biome[i] = classify(w, i, 3);
    if (w.biome[i] === Biome.Sea) w.biome[i] = Biome.Beach;
  }
  if (hgt < SEA_LEVEL && w.mat[i] === Mat.Water) w.biome[i] = Biome.Sea;
}

function terrain(sim: Simulation, c: PowerCmd, fn: (i: number, f: number) => void): void {
  const w = sim.world;
  sim.undo.begin(c.stroke, c.power);
  forBrush(w, c.x, c.y, c.radius, c.shape, (i, _x, _y, f) => {
    sim.undo.record(w, i);
    fn(i, f);
    w.wake(i);
  });
}

function nearWater(sim: Simulation, i: number): boolean {
  const w = sim.world;
  const x = i % w.w;
  const y = (i - x) / w.w;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!w.inside(x + dx, y + dy)) continue;
      if (w.mat[(y + dy) * w.w + x + dx] === Mat.Water) return true;
    }
  return false;
}

definePower({
  id: 'raise',
  tab: 'world',
  icon: '⛰',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i, f) => {
      const add = Math.max(1, Math.round(4 * f));
      const surf = w.mat[i] === Mat.Water ? w.depth[i]! : 0;
      w.height[i] = Math.min(255, w.height[i]! + add);
      if (w.mat[i] === Mat.Water || w.mat[i] === Mat.Lava || w.mat[i] === Mat.Acid) {
        w.depth[i] = Math.max(0, surf - add);
        if (w.depth[i] === 0) w.mat[i] = Mat.None;
      }
      if (w.height[i]! > SEA_LEVEL + 90 && w.biome[i] !== Biome.Snow) w.biome[i] = Biome.Mountain;
      reclassify(sim, i);
    });
  },
});

definePower({
  id: 'lower',
  tab: 'world',
  icon: '⛏',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i, f) => {
      const sub = Math.max(1, Math.round(4 * f));
      w.height[i] = Math.max(1, w.height[i]! - sub);
      if (w.mat[i] === Mat.Water) w.depth[i] = Math.min(255, w.depth[i]! + sub);
      else if (w.height[i]! < SEA_LEVEL && nearWater(sim, i)) {
        w.mat[i] = Mat.Water;
        w.depth[i] = SEA_LEVEL - w.height[i]!;
      }
      if (w.biome[i] === Biome.Mountain && w.height[i]! < SEA_LEVEL + 60) w.biome[i] = classify(w, i, 10);
      reclassify(sim, i);
    });
  },
});

definePower({
  id: 'flatten',
  tab: 'world',
  icon: '▭',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    const ci = Math.floor(c.y) * w.w + Math.floor(c.x);
    if (!w.inside(Math.floor(c.x), Math.floor(c.y))) return;
    const target = w.height[ci]!;
    terrain(sim, c, (i) => {
      const hh = w.height[i]!;
      w.height[i] = hh + Math.sign(target - hh) * Math.min(3, Math.abs(target - hh));
      reclassify(sim, i);
    });
  },
});

definePower({
  id: 'ocean',
  tab: 'world',
  icon: '🌊',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if (w.height[i]! >= SEA_LEVEL - 4) w.height[i] = SEA_LEVEL - 6;
      w.mat[i] = Mat.Water;
      w.depth[i] = SEA_LEVEL - w.height[i]!;
      w.obj[i] = 0;
      w.biome[i] = Biome.Sea;
    });
  },
});

definePower({
  id: 'land',
  tab: 'world',
  icon: '🏝',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if (w.height[i]! < SEA_LEVEL + 3) w.height[i] = SEA_LEVEL + 3;
      if (w.mat[i] === Mat.Water) {
        w.mat[i] = Mat.None;
        w.depth[i] = 0;
      }
      if (w.biome[i] === Biome.Sea) w.biome[i] = Biome.Plains;
    });
  },
});

definePower({
  id: 'biome',
  tab: 'world',
  icon: '🎨',
  brush: true,
  args: BIOME_KEYS.filter((k) => k !== 'sea'),
  apply(sim, c) {
    const w = sim.world;
    const b = biomeFromKey(c.arg);
    terrain(sim, c, (i) => {
      if (w.mat[i] === Mat.Water && w.depth[i]! > 2) return;
      w.biome[i] = b;
      if (b === Biome.Mountain && w.height[i]! < SEA_LEVEL + 70) w.height[i] = SEA_LEVEL + 70;
      if (b === Biome.Snow && w.mat[i] === Mat.None) {
        w.mat[i] = Mat.Snow;
        w.depth[i] = 2;
      }
    });
  },
});

definePower({
  id: 'erase',
  tab: 'world',
  icon: '🧽',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      w.obj[i] = 0;
      w.objData[i] = 0;
      w.road[i] = 0;
    });
  },
});

export function applyPower(sim: Simulation, c: PowerCmd): void {
  const p = POWERS.get(c.power);
  if (!p) return;
  if (!sim.laws.godPowers) return;
  p.apply(sim, c);
}
