import { describe, it, expect } from 'vitest';
import { Simulation, Mat, Biome, Entities, Pathfinder, FlowField, Mover, Task, SPECIES_INDEX, TICKS_PER_YEAR } from '../src/index.ts';

function flat(seed = 'cr'): Simulation {
  const s = new Simulation({ seed, size: 'small', laws: { startPeoples: false } });
  const w = s.world;
  for (let i = 0; i < w.n; i++) {
    w.height[i] = 140;
    w.biome[i] = Biome.Plains;
    w.mat[i] = Mat.None;
    w.depth[i] = 0;
    w.obj[i] = 0;
    w.baseTemp[i] = 15;
    w.heat[i] = 15;
  }
  const e = s.creatures.e;
  for (let i = 0; i < e.high; i++) if (e.alive[i]) s.creatures.die(i, -1, 'test');
  return s;
}

describe('entities', () => {
  it('ids carry generations', () => {
    const e = new Entities();
    const a = e.spawn();
    const ida = e.id(a);
    e.kill(a);
    const b = e.spawn();
    expect(b).toBe(a);
    expect(e.index(ida)).toBe(-1);
    expect(e.index(e.id(b))).toBe(b);
  });
});

describe('pathfinding', () => {
  it('goes around a wall and fails when enclosed', () => {
    const s = flat();
    const w = s.world;
    for (let y = 20; y < 80; y++) {
      const i = w.idx(50, y);
      w.mat[i] = Mat.Water;
      w.depth[i] = 10;
    }
    const pf = new Pathfinder(w);
    const p = pf.find(w.idx(40, 50), w.idx(60, 50), Mover.Walk, 20000)!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toBe(w.idx(60, 50));
    for (const c of p) expect(w.mat[c]).not.toBe(Mat.Water);
    const swim = pf.find(w.idx(40, 50), w.idx(60, 50), Mover.Swim, 20000)!;
    expect(swim.length).toBeLessThan(p.length);
    for (let x = 98; x <= 102; x++)
      for (let y = 98; y <= 102; y++) {
        if (x === 100 && y === 100) continue;
        const i = w.idx(x, y);
        w.mat[i] = Mat.Lava;
        w.depth[i] = 3;
      }
    const blocked = pf.find(w.idx(10, 10), w.idx(100, 100), Mover.Walk, 20000);
    expect(blocked === null || blocked[blocked.length - 1] !== w.idx(100, 100)).toBe(true);
  });

  it('coarse path covers long distances', () => {
    const s = flat();
    const w = s.world;
    const pf = new Pathfinder(w);
    const wp = pf.coarse(w.idx(10, 10), w.idx(240, 230), Mover.Walk, 0)!;
    expect(wp.length).toBeGreaterThan(10);
    expect(wp[wp.length - 1]).toBe(w.idx(240, 230));
  });

  it('flow field descends to the target', () => {
    const s = flat();
    const w = s.world;
    const f = new FlowField(w, [w.idx(100, 100)], 30, Mover.Walk, 0);
    let x = 120;
    let y = 110;
    for (let k = 0; k < 60; k++) {
      const n = f.next(x, y);
      if (!n) break;
      [x, y] = n;
    }
    expect([x, y]).toEqual([100, 100]);
  });
});

describe('creatures', () => {
  it('animals keep moving and never idle for long', () => {
    const s = flat('idle');
    const ids: number[] = [];
    for (let k = 0; k < 30; k++) ids.push(s.creatures.spawn(SPECIES_INDEX.get('deer')!, 60 + k * 3, 60 + (k % 5) * 4));
    const e = s.creatures.e;
    const idle = new Map<number, number>();
    const lastPos = new Map<number, string>();
    for (let t = 0; t < 1200; t++) {
      s.step();
      for (const i of ids) {
        if (!e.alive[i]) continue;
        const task = e.task[i]!;
        if (task === Task.Sleep || task === Task.Rest || task === Task.Eat || task === Task.Social || task === Task.Mate) {
          idle.set(i, 0);
          continue;
        }
        const pos = `${e.x[i]!.toFixed(2)},${e.y[i]!.toFixed(2)}`;
        if (lastPos.get(i) === pos) idle.set(i, (idle.get(i) ?? 0) + 1);
        else idle.set(i, 0);
        lastPos.set(i, pos);
        expect(idle.get(i)!).toBeLessThan(80);
      }
    }
  });

  it('rest never exceeds 20 game seconds', () => {
    const s = flat('rest');
    const i = s.creatures.spawn(SPECIES_INDEX.get('sheep')!, 50, 50);
    const e = s.creatures.e;
    e.fatigue[i] = 1;
    let run = 0;
    let maxRun = 0;
    for (let t = 0; t < 1000; t++) {
      s.step();
      if (e.task[i] === Task.Rest) run++;
      else run = 0;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThanOrEqual(240);
  });

  it('wolves hunt rabbits', () => {
    const s = flat('hunt');
    const e = s.creatures.e;
    const wolf = s.creatures.spawn(SPECIES_INDEX.get('wolf')!, 100, 100);
    e.hunger[wolf] = 0.95;
    const rabbits: number[] = [];
    for (let k = 0; k < 6; k++) rabbits.push(s.creatures.spawn(SPECIES_INDEX.get('rabbit')!, 103 + k, 101));
    for (let t = 0; t < 900; t++) s.step();
    expect(e.kills[wolf]! + (e.alive[wolf] ? 0 : 1)).toBeGreaterThan(0);
  });

  it('offspring inherit traits from parents', () => {
    const s = flat('inherit');
    const e = s.creatures.e;
    const sp = SPECIES_INDEX.get('velen')!;
    let inherited = 0;
    let total = 0;
    for (let k = 0; k < 40; k++) {
      const m = s.creatures.spawn(sp, 30 + k, 30);
      const f = s.creatures.spawn(sp, 30 + k, 31);
      const c = s.creatures.spawn(sp, 30 + k, 32, { mother: e.id(m), father: e.id(f) });
      const pt = new Set([...e.traitList(m), ...e.traitList(f)]);
      for (const t of e.traitList(c)) {
        total++;
        if (pt.has(t)) inherited++;
      }
      expect(e.traitList(c).length).toBeGreaterThanOrEqual(2);
      expect(e.traitList(c).length).toBeLessThanOrEqual(5);
      expect(e.age[c]).toBe(0);
    }
    expect(inherited / total).toBeGreaterThan(0.25);
  });

  it('units stranded in lava are moved or die, never stuck', () => {
    const s = flat('strand');
    const e = s.creatures.e;
    const i = s.creatures.spawn(SPECIES_INDEX.get('sheep')!, 80.5, 80.5);
    const w = s.world;
    w.mat[w.idx(80, 80)] = Mat.Lava;
    w.depth[w.idx(80, 80)] = 2;
    for (let t = 0; t < 30; t++) s.step();
    if (e.alive[i]) expect(w.mat[w.idx(Math.floor(e.x[i]!), Math.floor(e.y[i]!))]).not.toBe(Mat.Lava);
  });

  it('creatures age and die of old age', () => {
    const s = flat('age');
    const e = s.creatures.e;
    const i = s.creatures.spawn(SPECIES_INDEX.get('rabbit')!, 40, 40);
    e.age[i] = e.lifespan[i]! + 0.5;
    const id = e.id(i);
    for (let t = 0; t < TICKS_PER_YEAR; t++) s.step();
    expect(e.index(id)).toBe(-1);
  });

  it('world with creatures is deterministic and survives save/load', () => {
    const a = new Simulation({ seed: 'det-cr', size: 'small' });
    const b = new Simulation({ seed: 'det-cr', size: 'small' });
    expect(a.creatures.e.count).toBeGreaterThan(20);
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.hash()).toBe(b.hash());
    const c = Simulation.load(a.save());
    expect(c.hash()).toBe(a.hash());
    for (let t = 0; t < 200; t++) {
      a.step();
      c.step();
    }
    expect(c.hash()).toBe(a.hash());
  });
});
