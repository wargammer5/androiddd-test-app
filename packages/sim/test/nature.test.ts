import { describe, it, expect } from 'vitest';
import { Simulation, Mat, Biome, Obj, plantObj, isPlant, plantStage, TICKS_PER_YEAR, TICKS_PER_PULSE, SPECIES_INDEX } from '../src/index.ts';

function flat(seed: string, biome = Biome.Forest): Simulation {
  const s = new Simulation({ seed, size: 'small', laws: { startPeoples: false } });
  const w = s.world;
  for (let i = 0; i < w.n; i++) {
    w.height[i] = 130;
    w.biome[i] = biome;
    w.mat[i] = Mat.None;
    w.depth[i] = 0;
    w.obj[i] = 0;
    w.baseTemp[i] = 18;
    w.heat[i] = 18;
    w.moist[i] = 170;
    w.fire[i] = 0;
  }
  return s;
}

describe('plants', () => {
  it('seeds grow into adult plants and spread', () => {
    const s = flat('grow');
    const w = s.world;
    for (let k = 0; k < 200; k++) w.obj[w.idx(20 + (k % 20) * 10, 20 + Math.floor(k / 20) * 20)] = plantObj(0, 0);
    for (let t = 0; t < TICKS_PER_YEAR * 2; t++) s.step();
    let adult = 0;
    let total = 0;
    for (let i = 0; i < w.n; i++)
      if (isPlant(w.obj[i]!)) {
        total++;
        if (plantStage(w.obj[i]!) >= 3) adult++;
      }
    expect(adult).toBeGreaterThan(20);
    expect(total).toBeGreaterThan(200);
  });

  it('plants do not grow under deep water', () => {
    const s = flat('drown');
    const w = s.world;
    const i = w.idx(50, 50);
    w.obj[i] = plantObj(0, 3);
    w.mat[i] = Mat.Water;
    w.depth[i] = 5;
    for (let t = 0; t < TICKS_PER_YEAR * 2; t++) {
      w.mat[i] = Mat.Water;
      w.depth[i] = 5;
      s.step();
    }
    expect(isPlant(w.obj[i]!)).toBe(false);
  });

  it('burnt land recovers', () => {
    const s = flat('recover');
    const w = s.world;
    for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) w.obj[w.idx(x, y)] = Obj.Ash;
    for (let t = 0; t < TICKS_PER_YEAR * 3; t++) s.step();
    let ash = 0;
    let plants = 0;
    for (let y = 40; y < 60; y++)
      for (let x = 40; x < 60; x++) {
        if (w.obj[w.idx(x, y)] === Obj.Ash) ash++;
        if (isPlant(w.obj[w.idx(x, y)]!)) plants++;
      }
    expect(ash).toBeLessThan(40);
    expect(plants).toBeGreaterThan(0);
  });
});

describe('seasons and weather', () => {
  it('winter is colder than summer', () => {
    const s = flat('season');
    const summer = s.nature.seasonOffset(TICKS_PER_PULSE * 2 + 10);
    const winter = s.nature.seasonOffset(TICKS_PER_PULSE * 6 + 10);
    expect(winter).toBeLessThan(summer - 8);
  });

  it('rain puts out fire', () => {
    const s = flat('rain');
    const w = s.world;
    for (let y = 95; y < 105; y++) for (let x = 95; x < 105; x++) {
      w.obj[w.idx(x, y)] = plantObj(0, 3);
      w.fire[w.idx(x, y)] = 8;
      w.wake(w.idx(x, y));
    }
    s.nature.spawnCloud(100, 100, 14, 1, 2000);
    s.nature.clouds[0]!.vx = 0;
    s.nature.clouds[0]!.vy = 0;
    s.nature.wind = [0, 0];
    for (let t = 0; t < 300; t++) {
      s.nature.clouds[0] && (s.nature.clouds[0].x = 100, s.nature.clouds[0].y = 100);
      s.step();
    }
    let fire = 0;
    for (let y = 95; y < 105; y++) for (let x = 95; x < 105; x++) if (w.fire[w.idx(x, y)]! > 0) fire++;
    expect(fire).toBeLessThan(10);
  });

  it('snow clouds cover cold land with snow', () => {
    const s = flat('snowfall', Biome.Plains);
    const w = s.world;
    for (let i = 0; i < w.n; i++) {
      w.baseTemp[i] = -20;
      w.heat[i] = -20;
    }
    s.nature.spawnCloud(128, 128, 16, 2, 2000);
    for (let t = 0; t < 200; t++) s.step();
    let snow = 0;
    for (let i = 0; i < w.n; i++) if (w.mat[i] === Mat.Snow) snow++;
    expect(snow).toBeGreaterThan(30);
  });
});

describe('ecosystem', () => {
  it('respawns extinct animals when enabled and not when off', () => {
    const run = (eco: 'off' | 'fast') => {
      const s = flat('eco-' + eco, Biome.Plains);
      const cr = s.creatures;
      for (let i = 0; i < cr.e.high; i++) if (cr.e.alive[i]) cr.die(i, -1, 'test');
      s.laws.ecosystem = eco;
      for (let t = 0; t < 1500; t++) s.step();
      return cr.speciesCount[SPECIES_INDEX.get('rabbit')!]! + cr.speciesCount[SPECIES_INDEX.get('sheep')!]!;
    };
    expect(run('off')).toBe(0);
    expect(run('fast')).toBeGreaterThan(0);
  });
});
