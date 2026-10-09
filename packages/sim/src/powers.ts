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
  forBrush(w, c.x, c.y, c.radius + 2, c.shape, (i) => {
    if (w.still[i]) {
      w.still[i] = 0;
      w.wake(i);
    }
  });
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
  icon: '🪓',
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

function liquid(id: string, tab: PowerDef['tab'], icon: string, mat: number, danger = false): void {
  definePower({
    id,
    tab,
    icon,
    brush: true,
    danger,
    apply(sim, c) {
      const w = sim.world;
      terrain(sim, c, (i, f) => {
        if (w.mat[i] !== mat && w.mat[i] !== Mat.None && w.depth[i]! > 0) {
          if (mat === Mat.Water && w.mat[i] === Mat.Lava) {
            w.mat[i] = Mat.None;
            w.depth[i] = 0;
            w.height[i] = Math.min(255, w.height[i]! + 1);
          }
          return;
        }
        w.mat[i] = mat;
        w.depth[i] = Math.min(255, w.depth[i]! + Math.max(1, Math.round(2 * f + 1)));
        if (mat === Mat.Lava) w.heat[i] = 200;
        if (mat === Mat.Water || mat === Mat.Snow) w.fire[i] = 0;
        w.wake(i, 40);
      });
    },
  });
}

liquid('water', 'nature', '💧', Mat.Water);
liquid('snow', 'nature', '❄', Mat.Snow);
liquid('lava', 'destruction', '🌋', Mat.Lava, false);
liquid('acid', 'destruction', '🧪', Mat.Acid, false);

definePower({
  id: 'ice',
  tab: 'nature',
  icon: '🧊',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      w.heat[i] = Math.min(w.heat[i]!, -20);
      if (w.mat[i] === Mat.Water) w.mat[i] = Mat.Ice;
      else if (w.mat[i] === Mat.Lava) {
        w.mat[i] = Mat.None;
        w.depth[i] = 0;
        w.height[i] = Math.min(255, w.height[i]! + 1);
      }
      w.fire[i] = 0;
      w.wake(i, 60);
    });
  },
});

definePower({
  id: 'heat',
  tab: 'nature',
  icon: '🌡',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i, f) => {
      w.heat[i] = Math.min(205, w.heat[i]! + 15 * f + 5);
      w.wake(i, 60);
    });
  },
});

definePower({
  id: 'cool',
  tab: 'nature',
  icon: '🥶',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i, f) => {
      w.heat[i] = Math.max(-50, w.heat[i]! - 15 * f - 5);
      if (w.fire[i]! > 0) w.fire[i] = Math.max(0, w.fire[i]! - 4);
      w.wake(i, 60);
    });
  },
});

definePower({
  id: 'sponge',
  tab: 'nature',
  icon: '🧽',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if (w.mat[i] !== Mat.None) {
        w.mat[i] = Mat.None;
        w.depth[i] = 0;
        if (w.biome[i] === Biome.Sea) w.biome[i] = Biome.Beach;
      }
    });
  },
});

definePower({
  id: 'fire',
  tab: 'destruction',
  icon: '🔥',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if (w.mat[i] === Mat.Water || w.mat[i] === Mat.Ice) return;
      w.fire[i] = Math.max(w.fire[i]!, 6);
      w.heat[i] = Math.max(w.heat[i]!, 120);
      w.wake(i, 60);
    });
  },
});

const SPAWN_ICONS: Record<string, string> = {
  velen: '🧑',
  drok: '🧔',
  sylv: '🧝',
  skarn: '🦎',
  rabbit: '🐇',
  deer: '🦌',
  sheep: '🐑',
  wolf: '🐺',
  bear: '🐻',
  fox: '🦊',
  crab: '🦀',
  lizard: '🦎',
};

const lastSpawn = new Map<number, [number, number]>();

export function defineSpawn(key: string, tab: PowerDef['tab'], icon: string, danger = false, groupSize = 1): void {
  definePower({
    id: 'spawn_' + key,
    tab,
    icon,
    brush: false,
    danger,
    apply(sim, c) {
      const last = lastSpawn.get(c.stroke);
      if (last && Math.hypot(last[0] - c.x, last[1] - c.y) < 2) return;
      lastSpawn.set(c.stroke, [c.x, c.y]);
      if (lastSpawn.size > 50) lastSpawn.delete(lastSpawn.keys().next().value!);
      const sp = SPECIES_BY_KEY.get(key);
      if (sp === undefined) return;
      sim.undo.begin(c.stroke, c.power);
      const ids = sim.creatures.spawnGroup(sp, c.x, c.y, groupSize);
      for (const i of ids) sim.undo.spawned(sim.creatures.e.id(i));
      sim.onSpawnedByPlayer(ids, key);
    },
  });
}

import { species as SPECIES_DATA } from '@sotv/content';
const SPECIES_BY_KEY = new Map(SPECIES_DATA.map((s) => [s.key, s.id]));
for (const d of SPECIES_DATA) {
  if (d.kind === 'civ') defineSpawn(d.key, 'civ', SPAWN_ICONS[d.key] ?? '👤');
  else if (d.kind === 'animal') defineSpawn(d.key, 'creatures', SPAWN_ICONS[d.key] ?? '🐾');
}

import { plants as PLANT_DATA } from '@sotv/content';
import { plantObj as mkPlant, Stage as PStage, isPlant as isPlantObj } from './objects.ts';

function plantFor(sim: Simulation, i: number, trees: boolean): number {
  const w = sim.world;
  const b = BIOME_KEYS[w.biome[i]!]!;
  const opts = PLANT_DATA.filter((p) => (p.density[b] ?? 0) > 0 && (!trees || p.wood > 0));
  if (!opts.length) return trees ? 0 : 6;
  return opts[(i * 2654435761 >>> 0) % opts.length]!.type;
}

definePower({
  id: 'seeds',
  tab: 'nature',
  icon: '🌱',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if (w.obj[i] !== 0 || w.mat[i] === Mat.Water || w.mat[i] === Mat.Lava || w.biome[i] === Biome.Sea) return;
      if (((i * 7919) >>> 0) % 3 !== 0) return;
      w.obj[i] = mkPlant(plantFor(sim, i, false), PStage.Seed);
      w.objData[i] = 0;
    });
  },
});

definePower({
  id: 'forest',
  tab: 'nature',
  icon: '🌳',
  brush: true,
  apply(sim, c) {
    const w = sim.world;
    terrain(sim, c, (i) => {
      if ((w.obj[i] !== 0 && !isPlantObj(w.obj[i]!)) || w.mat[i] === Mat.Water || w.mat[i] === Mat.Lava || w.biome[i] === Biome.Sea) return;
      if (((i * 2654435761) >>> 0) % 2 !== 0) return;
      w.obj[i] = mkPlant(plantFor(sim, i, true), PStage.Adult);
      w.objData[i] = 2;
    });
  },
});

function cloudPower(id: string, icon: string, type: number): void {
  definePower({
    id,
    tab: 'nature',
    icon,
    brush: false,
    apply(sim, c) {
      if (sim.nature.clouds.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 6)) return;
      sim.nature.spawnCloud(c.x, c.y, Math.max(8, c.radius * 2 + 6), type, 900);
    },
  });
}
cloudPower('rain', '🌧', 1);
cloudPower('storm', '⛈', 3);

definePower({
  id: 'lightning',
  tab: 'destruction',
  icon: '⚡',
  brush: false,
  apply(sim, c) {
    sim.undo.begin(c.stroke, c.power);
    sim.nature.lightning(sim, c.x, c.y);
  },
});

definePower({
  id: 'city_flag',
  tab: 'civ',
  icon: '🚩',
  brush: false,
  apply(sim, c) {
    const last = lastSpawn.get(c.stroke);
    if (last) return;
    lastSpawn.set(c.stroke, [c.x, c.y]);
    const w = sim.world;
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (!w.inside(x, y)) return;
    const cr = sim.creatures;
    const e = cr.e;
    let best = -1;
    let bd = 30 * 30;
    cr.grid.rebuild(e);
    cr.grid.query(c.x, c.y, 30, (j) => {
      if (!e.alive[j] || e.city[j] !== -1) return;
      if (cr.def(j).kind !== 'civ') return;
      const d = (e.x[j]! - c.x) ** 2 + (e.y[j]! - c.y) ** 2;
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    if (best < 0) return;
    const race = e.species[best]!;
    const members: number[] = [];
    cr.grid.query(c.x, c.y, 30, (j) => {
      if (e.alive[j] && e.city[j] === -1 && e.species[j] === race) members.push(j);
    });
    const i = y * w.w + x;
    const site = w.zone[i] === 0 && w.mat[i] === Mat.None ? i : sim.cities.findCitySite(c.x, c.y, race, 6);
    if (site >= 0) sim.cities.newCity(race, site, members);
  },
});
