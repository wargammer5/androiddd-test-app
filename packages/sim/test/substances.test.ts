import { describe, it, expect } from 'vitest';
import { Simulation, Mat, Biome, Obj, plantObj } from '../src/index.ts';

function flatSim(): Simulation {
  const s = new Simulation({ seed: 'subst', size: 'small' });
  const w = s.world;
  for (let y = 0; y < w.h; y++)
    for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y);
      w.height[i] = 150;
      w.biome[i] = Biome.Plains;
      w.mat[i] = Mat.None;
      w.depth[i] = 0;
      w.obj[i] = 0;
      w.baseTemp[i] = 15;
      w.heat[i] = 15;
      w.moist[i] = 100;
      w.fire[i] = 0;
    }
  w.active.fill(0);
  s.laws.ecosystem = 'off';
  return s;
}

function sumDepth(s: Simulation, mat: number): number {
  let t = 0;
  for (let i = 0; i < s.world.n; i++) if (s.world.mat[i] === mat) t += s.world.depth[i]!;
  return t;
}

describe('water', () => {
  it('spreads on flat ground and conserves volume', () => {
    const s = flatSim();
    const w = s.world;
    const c = w.idx(128, 128);
    w.mat[c] = Mat.Water;
    w.depth[c] = 60;
    w.wake(c);
    for (let i = 0; i < 300; i++) s.step();
    expect(sumDepth(s, Mat.Water)).toBe(60);
    expect(w.depth[c]).toBeLessThan(10);
    let wet = 0;
    for (let i = 0; i < w.n; i++) if (w.mat[i] === Mat.Water) wet++;
    expect(wet).toBeGreaterThan(20);
  });

  it('flows downhill into a pit', () => {
    const s = flatSim();
    const w = s.world;
    for (let y = 100; y < 110; y++) for (let x = 100; x < 110; x++) w.height[w.idx(x, y)] = 130;
    const src = w.idx(111, 105);
    w.mat[src] = Mat.Water;
    w.depth[src] = 30;
    w.wake(src);
    for (let i = 0; i < 400; i++) s.step();
    let inPit = 0;
    for (let y = 100; y < 110; y++) for (let x = 100; x < 110; x++) if (w.mat[w.idx(x, y)] === Mat.Water) inPit += w.depth[w.idx(x, y)]!;
    expect(inPit).toBeGreaterThan(10);
  });

  it('evaporates when boiling', () => {
    const s = flatSim();
    const w = s.world;
    const c = w.idx(50, 50);
    w.mat[c] = Mat.Water;
    w.depth[c] = 3;
    w.baseTemp[c] = 60;
    w.heat[c] = 150;
    w.wake(c);
    s.enqueue({ t: 'power', power: 'heat', x: 50.5, y: 50.5, radius: 3, shape: 'circle', stroke: 1 });
    for (let i = 0; i < 20; i++) {
      s.enqueue({ t: 'power', power: 'heat', x: 50.5, y: 50.5, radius: 3, shape: 'circle', stroke: 1 });
      s.step();
    }
    expect(sumDepth(s, Mat.Water)).toBeLessThan(3);
  });
});

describe('lava', () => {
  it('turns to stone when it meets water', () => {
    const s = flatSim();
    const w = s.world;
    const a = w.idx(60, 60);
    const b = w.idx(61, 60);
    w.mat[a] = Mat.Lava;
    w.depth[a] = 4;
    w.heat[a] = 200;
    w.mat[b] = Mat.Water;
    w.depth[b] = 4;
    w.wake(a);
    for (let i = 0; i < 10; i++) s.step();
    expect(w.mat[a]).not.toBe(Mat.Lava);
    expect(w.height[a]).toBeGreaterThan(150);
  });

  it('cools down and solidifies far from a vent', () => {
    const s = flatSim();
    const w = s.world;
    const a = w.idx(80, 80);
    w.mat[a] = Mat.Lava;
    w.depth[a] = 2;
    w.heat[a] = 200;
    w.wake(a);
    for (let i = 0; i < 2000; i++) s.step();
    expect(sumDepth(s, Mat.Lava)).toBe(0);
  });

  it('ignites trees nearby', () => {
    const s = flatSim();
    const w = s.world;
    for (let x = 90; x < 100; x++) w.obj[w.idx(x, 90)] = plantObj(0, 3);
    const a = w.idx(89, 90);
    w.mat[a] = Mat.Lava;
    w.depth[a] = 3;
    w.wake(a);
    for (let i = 0; i < 200; i++) s.step();
    let burnt = 0;
    for (let x = 90; x < 100; x++) if (w.obj[w.idx(x, 90)] === Obj.Burnt || w.fire[w.idx(x, 90)]! > 0) burnt++;
    expect(burnt).toBeGreaterThan(0);
  });
});

describe('fire', () => {
  it('spreads through a forest and leaves burnt trees', () => {
    const s = flatSim();
    const w = s.world;
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) w.obj[w.idx(x, y)] = plantObj(0, 3);
    s.enqueue({ t: 'power', power: 'fire', x: 30, y: 30, radius: 1, shape: 'circle', stroke: 1 });
    for (let i = 0; i < 600; i++) s.step();
    let burnt = 0;
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) if (w.obj[w.idx(x, y)] === Obj.Burnt) burnt++;
    expect(burnt).toBeGreaterThan(20);
  });

  it('is put out by water', () => {
    const s = flatSim();
    const w = s.world;
    const c = w.idx(10, 10);
    w.obj[c] = plantObj(0, 3);
    w.fire[c] = 8;
    w.wake(c);
    s.enqueue({ t: 'power', power: 'water', x: 10.5, y: 10.5, radius: 2, shape: 'circle', stroke: 1 });
    s.step();
    s.step();
    expect(w.fire[c]).toBe(0);
  });
});

describe('snow and temperature', () => {
  it('snow melts in warm weather and heat diffuses', () => {
    const s = flatSim();
    const w = s.world;
    const c = w.idx(30, 30);
    w.mat[c] = Mat.Snow;
    w.depth[c] = 1;
    w.heat[c] = 15;
    w.wake(c);
    for (let i = 0; i < 300; i++) s.step();
    expect(w.mat[c]).not.toBe(Mat.Snow);
    const h = w.idx(200, 200);
    w.heat[h] = 200;
    w.wake(h);
    s.step();
    s.step();
    expect(w.heat[w.idx(201, 200)]!).toBeGreaterThan(16);
  });
});

describe('determinism with substances', () => {
  it('same commands give same state', () => {
    const run = () => {
      const s = new Simulation({ seed: 'det-sub', size: 'small' });
      s.enqueue({ t: 'power', power: 'lava', x: 120, y: 120, radius: 4, shape: 'circle', stroke: 1 });
      s.enqueue({ t: 'power', power: 'water', x: 128, y: 120, radius: 4, shape: 'circle', stroke: 2 });
      s.enqueue({ t: 'power', power: 'fire', x: 90, y: 140, radius: 3, shape: 'circle', stroke: 3 });
      for (let i = 0; i < 200; i++) s.step();
      return s.hash();
    };
    expect(run()).toBe(run());
  });
});
