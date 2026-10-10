import { describe, it, expect } from 'vitest';
import { Simulation, TICKS_PER_DAY, TICKS_PER_YEAR, Mat, Biome, SPECIES_INDEX, Obj, EFlag } from '../src/index.ts';

function plains(seed: string): Simulation {
  const s = new Simulation({ seed, size: 'small', laws: { startPeoples: false } });
  const w = s.world;
  for (let i = 0; i < w.n; i++) {
    const x = i % w.w;
    const sea = x > 200;
    w.height[i] = sea ? 80 : 120;
    w.biome[i] = sea ? Biome.Sea : Biome.Plains;
    w.mat[i] = sea ? Mat.Water : Mat.None;
    w.depth[i] = sea ? 20 : 0;
    w.baseTemp[i] = 18;
    w.heat[i] = 18;
    w.still[i] = sea ? 1 : 0;
    if (w.obj[i] === Obj.Vent || sea) w.obj[i] = 0;
  }
  return s;
}

describe('kingdoms', () => {
  it('a new city creates a kingdom with a ruler and taxes', () => {
    const s = plains('k1');
    const sp = SPECIES_INDEX.get('velen')!;
    const ids = s.creatures.spawnGroup(sp, 100, 100, 8);
    const c = s.cities.newCity(sp, s.world.idx(100, 100), ids)!;
    const k = s.kingdomSys.get(c.kingdom)!;
    expect(k).toBeTruthy();
    expect(k.capital).toBe(c.id);
    for (let t = 0; t < TICKS_PER_DAY * 2; t++) s.step();
    const ri = s.creatures.e.index(k.ruler);
    expect(ri).toBeGreaterThanOrEqual(0);
    expect(s.creatures.e.flags[ri]! & EFlag.Ruler).toBeTruthy();
    expect(k.treasury).toBeGreaterThan(0);
    s.creatures.die(ri, -1, 'test');
    for (let t = 0; t < TICKS_PER_DAY; t++) s.step();
    expect(s.creatures.e.index(k.ruler)).toBeGreaterThanOrEqual(0);
    expect(k.rulers).toBe(2);
  });

  it('a disloyal city rebels and forms a new kingdom', () => {
    const s = plains('k2');
    const sp = SPECIES_INDEX.get('skarn')!;
    const a = s.cities.newCity(sp, s.world.idx(40, 40), s.creatures.spawnGroup(sp, 40, 40, 10))!;
    const k = s.kingdomSys.get(a.kingdom)!;
    const b = s.cities.newCity(sp, s.world.idx(160, 160), s.creatures.spawnGroup(sp, 160, 160, 10), k)!;
    expect(b.kingdom).toBe(k.id);
    b.loyalty = 0.01;
    b.happiness = 0;
    for (let t = 0; t < TICKS_PER_DAY * 6 && b.kingdom === k.id; t++) {
      b.loyalty = 0.01;
      s.step();
    }
    expect(b.kingdom).not.toBe(k.id);
    expect(s.kingdomSys.get(b.kingdom)!.extra.parent).toBe(k.id + 1);
  });

  it('crowded cities send settlers who found colonies of the same kingdom', () => {
    const s = plains('k3');
    const sp = SPECIES_INDEX.get('velen')!;
    const c = s.cities.newCity(sp, s.world.idx(60, 120), s.creatures.spawnGroup(sp, 60, 120, 30))!;
    c.housing = 30;
    c.pop = 30;
    const k = s.kingdomSys.get(c.kingdom)!;
    let colonies = 0;
    for (let t = 0; t < TICKS_PER_YEAR * 2 && colonies === 0; t++) {
      if (t % 100 === 0) {
        c.store.add('food', 50, 'test');
        c.store.add('wood', 50, 'test');
      }
      s.step();
      colonies = k.cities.length - 1;
    }
    expect(colonies).toBeGreaterThan(0);
  });

  it('kingdoms survive save and load', () => {
    const a = new Simulation({ seed: 'k4', size: 'small' });
    for (let t = 0; t < TICKS_PER_YEAR; t++) a.step();
    const b = Simulation.load(a.save());
    expect(b.kingdomSys.kingdoms.length).toBe(a.kingdomSys.kingdoms.length);
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });
});
