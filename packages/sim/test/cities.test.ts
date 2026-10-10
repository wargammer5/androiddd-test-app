import { describe, it, expect } from 'vitest';
import { Store, Simulation, TICKS_PER_YEAR, TICKS_PER_PULSE, Mat, Biome, SPECIES_INDEX, Obj, Rng } from '../src/index.ts';

describe('store', () => {
  it('spend is atomic and reservations are consistent', () => {
    const s = new Store();
    s.capacity = 1000;
    s.add('wood', 10, 't');
    s.add('stone', 5, 't');
    expect(s.spend({ wood: 4, stone: 6 }, 't')).toBe(false);
    expect(s.get('wood')).toBe(10);
    expect(s.spend({ wood: 4, stone: 5 }, 't')).toBe(true);
    expect(s.get('wood')).toBe(6);
    expect(s.get('stone')).toBe(0);
    const id = s.reserve({ wood: 5 }, 'b');
    expect(id).toBeGreaterThan(0);
    expect(s.free('wood')).toBe(1);
    expect(s.spend({ wood: 2 }, 't')).toBe(false);
    s.consumeReserved(id, 0.4, 'b');
    expect(s.get('wood')).toBeCloseTo(4);
    s.release(id, 'b');
    expect(s.free('wood')).toBeCloseTo(4);
    expect(s.check()).toEqual([]);
  });

  it('respects capacity and survives random operations', () => {
    const s = new Store();
    s.capacity = 50;
    expect(s.add('food', 80, 't')).toBe(50);
    const r = new Rng(9);
    const ids: number[] = [];
    for (let k = 0; k < 2000; k++) {
      const op = r.int(6);
      const res = r.pick(['food', 'wood', 'stone']);
      if (op === 0) s.add(res, r.int(10), 'x');
      else if (op === 1) s.spend({ [res]: r.int(6) }, 'x');
      else if (op === 2) {
        const id = s.reserve({ [res]: r.int(6) }, 'x');
        if (id) ids.push(id);
      } else if (op === 3 && ids.length) s.consumeReserved(r.pick(ids), r.float(), 'x');
      else if (op === 4 && ids.length) s.release(ids.splice(r.int(ids.length), 1)[0]!, 'x');
      else s.spoil('food', 0.1, 'x');
      expect(s.check()).toEqual([]);
      expect(s.total()).toBeLessThanOrEqual(50 + 1e-6);
    }
  });

  it('round-trips through JSON', () => {
    const s = new Store();
    s.add('gold', 3, 't');
    const id = s.reserve({ gold: 2 }, 'x');
    const t = Store.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(t.free('gold')).toBe(1);
    t.finish(id, 'x');
    expect(t.get('gold')).toBe(1);
    expect(t.check()).toEqual([]);
  });
});

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

describe('cities', () => {
  it('nomads found a city that builds, works and keeps a valid ledger', () => {
    const s = plains('city-life');
    const sp = SPECIES_INDEX.get('velen')!;
    s.creatures.spawnGroup(sp, 128, 128, 10);
    for (let t = 0; t < TICKS_PER_YEAR * 3; t++) s.step();
    const cities = s.cities.cities.filter((c) => c.alive);
    expect(cities.length).toBeGreaterThanOrEqual(1);
    const c = cities[0]!;
    expect(c.buildings.filter((b) => b.done).length).toBeGreaterThan(2);
    expect(c.store.totalIn[0]! + c.store.totalIn[1]!).toBeGreaterThan(20);
    expect(c.store.check()).toEqual([]);
    expect(c.jobs.slice(1).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(s.kingdomSys.kingdoms.length).toBeGreaterThanOrEqual(1);
    let zone = 0;
    for (let i = 0; i < s.world.n; i++) if (s.world.zone[i] === c.id + 1) zone++;
    expect(zone).toBeGreaterThan(50);
  });

  it('construction consumes reserved resources stage by stage and stalls without materials', () => {
    const s = plains('build');
    const sp = SPECIES_INDEX.get('drok')!;
    const ids = s.creatures.spawnGroup(sp, 100, 100, 6);
    const c = s.cities.newCity(sp, s.world.idx(100, 100), ids)!;
    c.store.spend({ wood: c.store.get('wood') }, 'test');
    c.store.add('wood', 8, 'test');
    for (let t = 0; t < 100; t++) s.step();
    const b = c.buildings.find((x) => !x.done || x.type === 1);
    expect(b).toBeDefined();
    expect(c.store.check()).toEqual([]);
    for (let t = 0; t < TICKS_PER_PULSE * 4; t++) s.step();
    expect(c.store.check()).toEqual([]);
    expect(c.store.totalOut[1]!).toBeGreaterThan(0);
  });

  it('food spoils and cargo drops when a carrier dies', () => {
    const s = plains('spoil');
    const sp = SPECIES_INDEX.get('velen')!;
    const ids = s.creatures.spawnGroup(sp, 60, 60, 4);
    const c = s.cities.newCity(sp, s.world.idx(60, 60), ids)!;
    c.store.add('food', 100, 't');
    const before = c.store.get('food');
    const e = s.creatures.e;
    const i = ids[0]!;
    e.carry[i] = 1;
    e.carryAmt[i] = 5;
    const cell = s.world.idx(Math.floor(e.x[i]!), Math.floor(e.y[i]!));
    s.creatures.die(i, -1, 'test');
    expect(s.cities.drops.get(cell)).toEqual(['wood', 5]);
    for (let t = 0; t < TICKS_PER_PULSE + 2; t++) s.step();
    expect(c.store.totalOut[0]!).toBeGreaterThan(0);
    expect(c.store.get('food')).toBeLessThan(before);
  });

  it('city flag founds a city for nearby nomads', () => {
    const s = plains('flag');
    s.creatures.spawnGroup(SPECIES_INDEX.get('sylv')!, 50, 50, 2);
    s.enqueue({ t: 'power', power: 'city_flag', x: 55, y: 52, radius: 1, shape: 'circle', stroke: 1 });
    s.step();
    expect(s.cities.cities.filter((c) => c.alive).length).toBe(1);
  });

  it('is deterministic and save/load preserves cities', () => {
    const a = new Simulation({ seed: 'det-city', size: 'small' });
    for (let t = 0; t < TICKS_PER_YEAR; t++) a.step();
    const b = Simulation.load(a.save());
    expect(b.hash()).toBe(a.hash());
    for (let t = 0; t < 400; t++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
    expect(b.cities.cities.length).toBe(a.cities.cities.length);
  });
});
