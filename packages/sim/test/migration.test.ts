import { describe, it, expect } from 'vitest';
import { Simulation, SaveReader, SAVE_VERSION, downgradeForTest, Mat, TICKS_PER_DAY } from '../src/index.ts';

describe('save migrations', () => {
  it('current saves carry the current version', () => {
    const s = new Simulation({ seed: 'mig', size: 'small' });
    expect(new SaveReader(s.save()).version).toBe(SAVE_VERSION);
  });

  it('a v1 save without newer sections loads and keeps running', () => {
    const a = new Simulation({ seed: 'mig-1', size: 'small' });
    for (let t = 0; t < TICKS_PER_DAY; t++) a.step();
    const v1 = downgradeForTest(a.save(), 1, ['L.still', 'CHRN', 'EVNT', 'BELF', 'DIPL', 'SIMX']);
    expect(new SaveReader(v1).version).toBe(1);
    const b = Simulation.load(v1);
    let still = 0;
    let water = 0;
    for (let i = 0; i < b.world.n; i++) {
      if (b.world.mat[i] === Mat.Water && b.world.depth[i]! > 0) water++;
      if (b.world.still[i]) still++;
    }
    expect(still).toBe(water);
    expect(b.laws.worldAges).toBe(true);
    for (let t = 0; t < TICKS_PER_DAY; t++) b.step();
    expect(b.creatures.e.count).toBeGreaterThan(0);
    const again = Simulation.load(b.save());
    expect(again.hash()).toBe(b.hash());
  });

  it('rejects saves from a newer version', () => {
    const a = new Simulation({ seed: 'mig-2', size: 'small' });
    const future = downgradeForTest(a.save(), SAVE_VERSION + 1, []);
    expect(() => new SaveReader(future)).toThrow(/newer/);
  });
});
