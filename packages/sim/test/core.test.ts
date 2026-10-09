import { describe, it, expect } from 'vitest';
import { Rng, Simulation } from '../src/index.ts';

describe('rng', () => {
  it('is deterministic and serializable', () => {
    const a = new Rng('seed');
    const b = new Rng('seed');
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
    const st = a.getState();
    const x = a.float();
    b.setState(st);
    expect(b.float()).toBe(x);
  });
  it('float in [0,1)', () => {
    const r = new Rng(5);
    for (let i = 0; i < 10000; i++) {
      const f = r.float();
      expect(f >= 0 && f < 1).toBe(true);
    }
  });
});

describe('simulation', () => {
  it('same seed gives same state', () => {
    const a = new Simulation({ seed: 'x', size: 'small' });
    const b = new Simulation({ seed: 'x', size: 'small' });
    for (let i = 0; i < 20; i++) {
      a.step();
      b.step();
    }
    expect(a.hash()).toBe(b.hash());
  });
});
