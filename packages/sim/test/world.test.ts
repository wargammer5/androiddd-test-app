import { describe, it, expect } from 'vitest';
import { Simulation, Mat, Biome, SaveReader, SaveError, BIOME_COUNT } from '../src/index.ts';

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = new Simulation({ seed: 'gen-1', size: 'small' });
    const b = new Simulation({ seed: 'gen-1', size: 'small' });
    const c = new Simulation({ seed: 'gen-2', size: 'small' });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('produces land, sea and several biomes', () => {
    const s = new Simulation({ seed: 'gen-biomes', size: 'medium' });
    const w = s.world;
    let water = 0;
    const counts = new Array(BIOME_COUNT).fill(0);
    for (let i = 0; i < w.n; i++) {
      if (w.mat[i] === Mat.Water) water++;
      counts[w.biome[i]!]++;
    }
    const frac = water / w.n;
    expect(frac).toBeGreaterThan(0.3);
    expect(frac).toBeLessThan(0.8);
    expect(counts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(7);
    expect(counts[Biome.Sea]).toBeGreaterThan(0);
    expect(counts[Biome.Mountain] + counts[Biome.Snow]).toBeGreaterThan(0);
  });

  it('map edges are water', () => {
    const s = new Simulation({ seed: 'edges', size: 'small' });
    const w = s.world;
    let land = 0;
    for (let x = 0; x < w.w; x++) if (w.mat[x] !== Mat.Water && w.mat[x] !== Mat.Ice) land++;
    expect(land).toBeLessThan(w.w * 0.05);
  });
});

describe('save format', () => {
  it('round-trips the world', () => {
    const a = new Simulation({ seed: 'save-1', size: 'small' });
    for (let i = 0; i < 30; i++) a.step();
    const bytes = a.save();
    const b = Simulation.load(bytes);
    expect(b.hash()).toBe(a.hash());
    for (let i = 0; i < 30; i++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });

  it('detects corruption and foreign files', () => {
    const a = new Simulation({ seed: 'save-2', size: 'small' });
    const bytes = a.save();
    const bad = bytes.slice();
    bad[bad.length - 5] = bad[bad.length - 5]! ^ 0xff;
    expect(() => new SaveReader(bad)).toThrow(SaveError);
    expect(() => new SaveReader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toThrow(/not a Sotvorenie save/);
    expect(() => new SaveReader(bytes.slice(0, 30))).toThrow(SaveError);
  });
});

describe('terrain powers', () => {
  it('raise then undo restores the world', () => {
    const s = new Simulation({ seed: 'pow', size: 'small' });
    const snap = () => [s.world.height.slice(), s.world.biome.slice()];
    const before = snap();
    s.enqueue({ t: 'power', power: 'raise', x: 100, y: 100, radius: 6, shape: 'circle', stroke: 1 });
    s.enqueue({ t: 'power', power: 'raise', x: 104, y: 100, radius: 6, shape: 'circle', stroke: 1 });
    s.step();
    expect(snap()).not.toEqual(before);
    s.enqueue({ t: 'undo' });
    s.step();
    expect(snap()).toEqual(before);
  });

  it('ocean brush creates water', () => {
    const s = new Simulation({ seed: 'pow2', size: 'small' });
    s.enqueue({ t: 'power', power: 'ocean', x: 128, y: 128, radius: 3, shape: 'square', stroke: 1 });
    s.step();
    expect(s.world.mat[s.world.idx(128, 128)]).toBe(Mat.Water);
  });
});
