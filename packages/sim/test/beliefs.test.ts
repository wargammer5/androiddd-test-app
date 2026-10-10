import { describe, it, expect } from 'vitest';
import { Simulation, TICKS_PER_PULSE, TICKS_PER_YEAR, Mat, Biome, SPECIES_INDEX, Obj, Bld, buildingObj } from '../src/index.ts';

function plains(seed: string): Simulation {
  const s = new Simulation({ seed, size: 'small', laws: { startPeoples: false } });
  const w = s.world;
  for (let i = 0; i < w.n; i++) {
    w.height[i] = 120;
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

function temple(s: Simulation, c: ReturnType<typeof city>) {
  const cell = c.center + 3;
  c.buildings.push({ type: Bld.Temple, cell, done: true, progress: 0, resId: 0, era: 0, hp: 100 });
  s.world.obj[cell] = buildingObj(Bld.Temple, c.race);
}

describe('languages and cultures', () => {
  it('languages generate stable, distinct words', () => {
    const s = plains('b1');
    const a = s.beliefs.newLanguage('alpha');
    const b = s.beliefs.newLanguage('beta');
    expect(s.beliefs.langName(a.id, 42, 'person')).toBe(s.beliefs.langName(a.id, 42, 'person'));
    const wa = new Set(Array.from({ length: 20 }, (_, k) => s.beliefs.langName(a.id, k, 'place')));
    const wb = new Set(Array.from({ length: 20 }, (_, k) => s.beliefs.langName(b.id, k, 'place')));
    expect(wa.size).toBeGreaterThan(10);
    let same = 0;
    for (const x of wa) if (wb.has(x)) same++;
    expect(same).toBeLessThan(5);
  });

  it('cities receive the founders culture and a name in its language', () => {
    const s = plains('b2');
    const a = city(s, 'velen', 40, 40, 6);
    const b = city(s, 'velen', 200, 200, 6);
    expect(a.culture).toBeGreaterThanOrEqual(0);
    expect(b.culture).toBe(a.culture);
    const e = s.creatures.e;
    let ok = 0;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === a.id && e.culture[i] === a.culture) ok++;
    expect(ok).toBeGreaterThan(0);
    const c = city(s, 'drok', 120, 40, 6);
    expect(c.culture).not.toBe(a.culture);
  });

  it('editors change names, colours and sanitise traits', () => {
    const s = plains('b3');
    const a = city(s, 'sylv', 60, 60, 6);
    s.enqueue({ t: 'edit', kind: 'culture', id: a.culture, data: { name: 'Новое имя', color: [10, 20, 300], traits: ['militant', 'hacker', 'scholarly'] } });
    s.step();
    const cu = s.beliefs.cultures[a.culture]!;
    expect(cu.name).toBe('Новое имя');
    expect(cu.color).toEqual([10, 20, 255]);
    expect(cu.traits).toEqual(['militant', 'scholarly']);
    const lang = s.beliefs.languages[cu.language]!;
    s.enqueue({ t: 'edit', kind: 'language', id: lang.id, data: { consonants: 'k r t zz', vowels: 'a o' } });
    s.step();
    expect(lang.consonants).toEqual(['k', 'r', 't']);
    expect(lang.vowels).toEqual(['a', 'o']);
  });
});

describe('religions', () => {
  it('a temple city founds a religion that spreads and grants abilities', () => {
    const s = plains('b4');
    const a = city(s, 'velen', 60, 60, 14);
    const b = city(s, 'velen', 90, 60, 6);
    temple(s, a);
    a.pop = 14;
    for (let t = 0; t < TICKS_PER_YEAR * 2 && a.religion < 0; t++) {
      a.pop = Math.max(a.pop, 12);
      s.step();
    }
    expect(a.religion).toBeGreaterThanOrEqual(0);
    const r = s.beliefs.religions[a.religion]!;
    r.tenets = ['war', 'fire'];
    for (let t = 0; t < TICKS_PER_YEAR * 2 && b.religion !== a.religion; t++) s.step();
    expect(b.religion).toBe(a.religion);
    const e = s.creatures.e;
    let unit = -1;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === a.id) unit = i;
    expect(s.unitBonus(unit, 'dmg')).toBeGreaterThan(0);
    expect(s.unitBonus(unit, 'fireRes')).toBeGreaterThan(0);
  });

  it('prophet power founds a faith and different faiths sour relations', () => {
    const s = plains('b5');
    const a = city(s, 'velen', 50, 50, 6);
    const b = city(s, 'skarn', 200, 200, 6);
    s.enqueue({ t: 'power', power: 'prophet', x: 50.5, y: 50.5, radius: 1, shape: 'circle', stroke: 1 });
    s.enqueue({ t: 'power', power: 'prophet', x: 200.5, y: 200.5, radius: 1, shape: 'circle', stroke: 2 });
    s.step();
    expect(a.religion).toBeGreaterThanOrEqual(0);
    expect(b.religion).toBeGreaterThanOrEqual(0);
    expect(a.religion).not.toBe(b.religion);
    expect(s.beliefs.relationBonus(a.kingdom, b.kingdom)).toBeLessThan(0);
  });

  it('beliefs survive save and load', () => {
    const a = new Simulation({ seed: 'b6', size: 'small' });
    for (let t = 0; t < TICKS_PER_YEAR; t++) a.step();
    const c = a.cities.cities.find((x) => x.alive);
    if (c) {
      a.enqueue({ t: 'power', power: 'prophet', x: (c.center % a.world.w) + 0.5, y: Math.floor(c.center / a.world.w) + 0.5, radius: 1, shape: 'circle', stroke: 9 });
      a.step();
    }
    const b = Simulation.load(a.save());
    expect(b.beliefs.religions.length).toBe(a.beliefs.religions.length);
    expect(b.beliefs.cultures.map((x) => x.name)).toEqual(a.beliefs.cultures.map((x) => x.name));
    for (let t = 0; t < TICKS_PER_PULSE * 2; t++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });
});
