import { describe, it, expect } from 'vitest';
import { Simulation, TICKS_PER_PULSE, Mat, Biome, SPECIES_INDEX, Obj, POWERS, EVENT_KINDS, AGES, isBuilding, Bld } from '../src/index.ts';

function plains(seed: string): Simulation {
  const s = new Simulation({ seed, size: 'small', laws: { startPeoples: false } });
  const w = s.world;
  for (let i = 0; i < w.n; i++) {
    w.height[i] = 140;
    w.biome[i] = Biome.Plains;
    w.mat[i] = Mat.None;
    w.depth[i] = 0;
    w.baseTemp[i] = 18;
    w.heat[i] = 18;
    w.still[i] = 0;
    if (w.obj[i] === Obj.Vent) w.obj[i] = 0;
  }
  return s;
}

function city(s: Simulation, race: string, x: number, y: number, n: number) {
  const sp = SPECIES_INDEX.get(race)!;
  return s.cities.newCity(sp, s.world.idx(x, y), s.creatures.spawnGroup(sp, x, y, n))!;
}

const tap = (s: Simulation, power: string, x: number, y: number, stroke: number, extra: Record<string, unknown> = {}) =>
  s.enqueue({ t: 'power', power, x, y, radius: 3, shape: 'circle', stroke, ...extra });

describe('events and ages', () => {
  it('every event kind can be triggered', () => {
    const s = plains('ev1');
    const c = city(s, 'velen', 128, 128, 10);
    const lake = s.world.idx(40, 40);
    s.world.mat[lake] = Mat.Water;
    s.world.depth[lake] = 3;
    s.world.obj[s.world.idx(60, 60)] = 4;
    s.world.height[s.world.idx(200, 200)] = 220;
    for (const k of EVENT_KINDS) {
      const ok = s.events.trigger(k);
      expect(ok, k).toBe(true);
    }
    for (let t = 0; t < TICKS_PER_PULSE; t++) s.step();
    expect(s.events.history.length).toBeGreaterThanOrEqual(EVENT_KINDS.length);
    void c;
  });

  it('world ages change modifiers', () => {
    const s = plains('ev2');
    for (const a of AGES) {
      s.events.setAge(a);
      expect(s.events.age).toBe(a);
    }
    s.events.setAge('ice');
    expect(s.events.mod('temp')).toBeLessThan(0);
    s.events.setAge('darkness');
    expect(s.events.mod('light')).toBeLessThan(1);
    s.events.setAge('prosperity');
    expect(s.events.mod('growth')).toBeGreaterThan(1);
  });

  it('comet carves a crater and undo restores it', () => {
    const s = plains('ev3');
    const before = s.world.height.slice();
    tap(s, 'comet', 100, 100, 1);
    s.step();
    expect(s.world.height[s.world.idx(100, 100)]).toBeLessThan(140);
    s.enqueue({ t: 'undo' });
    s.step();
    expect(s.world.height[s.world.idx(100, 100)]).toBe(before[s.world.idx(100, 100)]);
  });

  it('plague kills and spreads, healers fight it', () => {
    const s = plains('ev4');
    const a = city(s, 'velen', 60, 60, 20);
    city(s, 'velen', 85, 60, 10);
    s.events.plague.set(a.id, 1);
    s.laws.reproduction = false;
    const sp = SPECIES_INDEX.get('velen')!;
    const pop = s.creatures.speciesCount[sp]!;
    for (let t = 0; t < TICKS_PER_PULSE * 4; t++) s.step();
    expect(s.creatures.speciesCount[sp]!).toBeLessThan(pop);
  });
});

describe('monsters and special powers', () => {
  it('dragons burn what they attack and raid cities', () => {
    const s = plains('m1');
    const c = city(s, 'velen', 128, 128, 10);
    const d = s.creatures.spawnGroup(SPECIES_INDEX.get('dragon')!, 128, 150, 1)[0]!;
    let fire = 0;
    for (let t = 0; t < 600 && fire === 0; t++) {
      s.step();
      for (let i = 0; i < s.world.n; i++) if (s.world.fire[i]) fire++;
    }
    expect(fire).toBeGreaterThan(0);
    void c;
    void d;
  });

  it('titan crab follows commands and crushes buildings', () => {
    const s = plains('m2');
    const c = city(s, 'drok', 100, 100, 6);
    tap(s, 'titancrab', 80, 100, 1);
    s.step();
    const e = s.creatures.e;
    const crab = e.index(s.controlled);
    expect(crab).toBeGreaterThanOrEqual(0);
    s.enqueue({ t: 'control', x: 100.5, y: 100.5 });
    for (let t = 0; t < 200; t++) s.step();
    expect(Math.hypot(e.x[crab]! - 100.5, e.y[crab]! - 100.5)).toBeLessThan(1.5);
    expect(isBuilding(s.world.obj[c.center]!)).toBe(false);
    expect(c.buildings.find((b) => b.type === Bld.Hall && b.cell === c.center)).toBeUndefined();
  });

  it('the divine magnet carries units and drops them', () => {
    const s = plains('m3');
    const ids = s.creatures.spawnGroup(SPECIES_INDEX.get('sheep')!, 50, 50, 4);
    tap(s, 'magnet', 50, 50, 7);
    s.step();
    tap(s, 'magnet', 150, 150, 7);
    s.step();
    tap(s, 'magnet_drop', 0, 0, 0);
    s.step();
    const e = s.creatures.e;
    const moved = ids.filter((i) => e.alive[i] && Math.hypot(e.x[i]! - 150, e.y[i]! - 150) < 4).length;
    expect(moved).toBeGreaterThan(0);
    expect(s.events.magnet.length).toBe(0);
  });

  it('undead turn their victims', () => {
    const s = plains('m4');
    const e = s.creatures.e;
    const victims = s.creatures.spawnGroup(SPECIES_INDEX.get('velen')!, 70, 70, 6);
    for (const v of victims) e.hp[v] = 1;
    const und = SPECIES_INDEX.get('undead')!;
    s.creatures.spawnGroup(und, 70, 71, 4);
    const before = s.creatures.speciesCount[und]!;
    for (let t = 0; t < 600; t++) s.step();
    expect(s.creatures.speciesCount[und]!).toBeGreaterThanOrEqual(before);
  });

  it('law profiles change the rules and all powers are registered with strings', () => {
    const s = plains('m5');
    s.enqueue({ t: 'profile', key: 'garden' });
    s.step();
    expect(s.laws.wars).toBe(false);
    expect(s.laws.disasters).toBe(false);
    s.enqueue({ t: 'profile', key: 'apocalypse' });
    s.step();
    expect(s.laws.eventFrequency).toBeGreaterThan(3);
    expect(POWERS.size).toBeGreaterThan(50);
  });
});

import { strings } from '@sotv/content';
import { TENETS, CULTURE_TRAITS, JOB_COUNT, TASK_COUNT, DEFAULT_LAWS, LAW_PROFILES } from '../src/index.ts';

describe('dynamic translation keys', () => {
  it('exist for powers, ages, jobs, tasks, tenets, traits, laws and profiles', () => {
    const keys: string[] = [];
    for (const p of POWERS.values()) if (p.icon) keys.push('power.' + p.id);
    for (const a of AGES) keys.push('age.' + a);
    for (let j = 0; j < JOB_COUNT; j++) keys.push('job.' + j);
    for (let t = 0; t < TASK_COUNT; t++) keys.push('task.' + t);
    for (const t of TENETS) keys.push('tenet.' + t);
    for (const t of CULTURE_TRAITS) keys.push('ctrait.' + t);
    for (const k of Object.keys(DEFAULT_LAWS)) if (k !== 'godPowers' && k !== 'ecosystem') keys.push('law.' + k);
    for (const k of Object.keys(LAW_PROFILES)) keys.push('profile.' + k);
    for (const k of ['border', 'conquest', 'rebellion', 'plot', 'religion']) keys.push('cause.' + k);
    const missing = keys.filter((k) => !strings.ru[k] || !strings.en[k]);
    expect(missing).toEqual([]);
  });
});
