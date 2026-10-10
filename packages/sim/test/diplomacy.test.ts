import { describe, it, expect } from 'vitest';
import { Simulation, TICKS_PER_PULSE, TICKS_PER_YEAR, Mat, Biome, SPECIES_INDEX, Obj, EFlag, Bld, buildingObj } from '../src/index.ts';

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
  const e = s.creatures.e;
  for (let i = 0; i < e.high; i++) if (e.alive[i]) s.creatures.die(i, -1, 'test');
  return s;
}

function city(s: Simulation, race: string, x: number, y: number, n: number) {
  const sp = SPECIES_INDEX.get(race)!;
  return s.cities.newCity(sp, s.world.idx(x, y), s.creatures.spawnGroup(sp, x, y, n))!;
}

describe('diplomacy', () => {
  it('war makes citizens of both realms hostile and ends with peace terms', () => {
    const s = plains('d1');
    const a = city(s, 'velen', 40, 40, 8);
    const b = city(s, 'skarn', 200, 200, 8);
    const ka = s.kingdomSys.get(a.kingdom)!;
    const kb = s.kingdomSys.get(b.kingdom)!;
    const ua = s.creatures.e.index(s.creatures.e.id(0));
    expect(s.diplomacy.atWar(ka.id, kb.id)).toBe(false);
    const w = s.diplomacy.declare(ka, kb, 'conquest');
    expect(s.diplomacy.atWar(ka.id, kb.id)).toBe(true);
    let ia = -1;
    let ib = -1;
    const e = s.creatures.e;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      if (e.kingdom[i] === ka.id) ia = i;
      if (e.kingdom[i] === kb.id) ib = i;
    }
    expect(s.creatures.hostile(ia, ib)).toBe(true);
    void ua;
    w.casualties = [50, 2];
    s.diplomacy.endWar(w, 'defenders');
    expect(s.diplomacy.atWar(ka.id, kb.id)).toBe(false);
    expect(s.diplomacy.tributes.length).toBe(1);
    expect(s.diplomacy.tributes[0]!.from).toBe(ka.id);
    expect(s.diplomacy.rel(ka.id, kb.id).truce).toBeGreaterThan(s.tick);
  });

  it('an undefended city under siege is captured', () => {
    const s = plains('d2');
    const a = city(s, 'drok', 60, 60, 6);
    const b = city(s, 'velen', 100, 60, 4);
    const ka = s.kingdomSys.get(a.kingdom)!;
    const kb = s.kingdomSys.get(b.kingdom)!;
    const e = s.creatures.e;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === b.id) e.job[i] = 0;
    const w = s.diplomacy.declare(ka, kb, 'conquest');
    w.goal = b.id;
    const army = s.creatures.spawnGroup(SPECIES_INDEX.get('drok')!, 100, 62, 8);
    for (const i of army) {
      e.kingdom[i] = ka.id;
      e.city[i] = a.id;
      e.job[i] = 11;
      e.dmg[i] = 0.01;
    }
    for (let t = 0; t < 24 * 14; t++) {
      for (const i of army)
        if (e.alive[i]) {
          e.x[i] = 100.5 + (i % 3);
          e.y[i] = 60.5 + (i % 2);
        }
      s.step();
      if (b.kingdom === ka.id) break;
    }
    expect(b.kingdom).toBe(ka.id);
    expect(w.captured).toContain(b.id);
  });

  it('allies are called to arms and refusals count as betrayal', () => {
    const s = plains('d3');
    const a = city(s, 'velen', 30, 30, 6);
    const b = city(s, 'velen', 30, 200, 6);
    const c = city(s, 'skarn', 200, 100, 6);
    const ka = s.kingdomSys.get(a.kingdom)!;
    const kb = s.kingdomSys.get(b.kingdom)!;
    const kc = s.kingdomSys.get(c.kingdom)!;
    const r = s.diplomacy.rel(ka.id, kb.id);
    r.alliance = true;
    r.opinion = 60;
    const w = s.diplomacy.declare(kc, ka, 'conquest');
    expect(w.defenders).toContain(kb.id);
    const s2 = plains('d3b');
    const a2 = city(s2, 'velen', 30, 30, 6);
    const b2 = city(s2, 'velen', 30, 200, 6);
    const c2 = city(s2, 'skarn', 200, 100, 6);
    const r2 = s2.diplomacy.rel(a2.kingdom, b2.kingdom);
    r2.alliance = true;
    r2.opinion = -20;
    const w2 = s2.diplomacy.declare(s2.kingdomSys.get(c2.kingdom)!, s2.kingdomSys.get(a2.kingdom)!, 'conquest');
    expect(w2.defenders).not.toContain(b2.kingdom);
    expect(r2.alliance).toBe(false);
  });

  it('plots eventually change the ruler or fail', () => {
    const s = plains('d4');
    const a = city(s, 'velen', 80, 80, 20);
    const k = s.kingdomSys.get(a.kingdom)!;
    for (let t = 0; t < TICKS_PER_PULSE * 2; t++) s.step();
    const first = k.ruler;
    let resolved = false;
    for (let t = 0; t < TICKS_PER_YEAR * 4 && !resolved; t++) {
      s.step();
      resolved = s.diplomacy.plots.some((p) => p.kingdom === k.id && p.state !== 'active');
    }
    expect(resolved).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it('market cities open trade routes and children inherit clans', () => {
    const s = plains('d5');
    const a = city(s, 'velen', 50, 50, 6);
    const b = city(s, 'drok', 120, 50, 6);
    for (const c of [a, b]) {
      const cell = s.world.idx((c.center % s.world.w) + 3, Math.floor(c.center / s.world.w));
      c.buildings.push({ type: Bld.Market, cell, done: true, progress: 0, resId: 0, era: 0, hp: 100 });
      s.world.obj[cell] = buildingObj(Bld.Market, c.race);
    }
    for (let t = 0; t < TICKS_PER_PULSE * 2; t++) s.step();
    expect(s.diplomacy.routes.length).toBeGreaterThan(0);
    const e = s.creatures.e;
    let m = -1;
    let f = -1;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== a.id) continue;
      if (m < 0 && e.sex[i] === 1) m = i;
      if (f < 0 && e.sex[i] === 0) f = i;
    }
    if (m >= 0 && f >= 0) {
      const child = s.creatures.spawn(e.species[m]!, 50, 50, { mother: e.id(m), father: e.id(f) });
      s.cities.onBirth(s, child, m);
      expect(e.clan[child]).toBe(e.clan[f]);
    }
    expect(e.flags.some((x) => (x & EFlag.Ruler) !== 0)).toBe(true);
  });

  it('diplomatic state survives save and load deterministically', () => {
    const a = new Simulation({ seed: 'd6', size: 'small' });
    for (let t = 0; t < TICKS_PER_YEAR * 2; t++) a.step();
    const ks = a.kingdomSys.kingdoms.filter((k) => k.alive);
    if (ks.length >= 2) a.diplomacy.declare(ks[0]!, ks[1]!, 'border');
    const b = Simulation.load(a.save());
    expect(b.diplomacy.wars.length).toBe(a.diplomacy.wars.length);
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(b.hash()).toBe(a.hash());
  });
});
