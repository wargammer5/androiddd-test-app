import { species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import type { Kingdom } from './kingdoms.ts';
import type { City } from './cities.ts';
import { Job } from './cities.ts';
import { Rng } from './rng.ts';
import { TICKS_PER_DAY, TICKS_PER_YEAR } from './time.ts';
import { EFlag, Task, Anim } from './entities.ts';
import { placeName } from './names.ts';
import { Bld } from './objects.ts';

export interface Relation {
  a: number;
  b: number;
  opinion: number;
  alliance: boolean;
  truce: number;
  trade: number;
}

export interface War {
  id: number;
  attackers: number[];
  defenders: number[];
  cause: string;
  started: number;
  ended: number;
  casualties: [number, number];
  captured: number[];
  goal: number;
  siege: number;
  result: string;
}

export interface Tribute {
  from: number;
  to: number;
  amount: number;
  until: number;
}

export interface Clan {
  id: number;
  name: string;
  kingdom: number;
  members: number;
  prestige: number;
  founded: number;
  alive: boolean;
}

export interface Plot {
  id: number;
  kingdom: number;
  type: 'coup' | 'assassination' | 'rebellion' | 'war';
  leader: number;
  leaderName: string;
  members: number;
  progress: number;
  target: number;
  started: number;
  state: 'active' | 'done' | 'failed';
}

export interface TradeRoute {
  from: number;
  to: number;
  goods: number;
  started: number;
}

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class Diplomacy implements System {
  readonly name = 'diplomacy';
  relations = new Map<string, Relation>();
  wars: War[] = [];
  tributes: Tribute[] = [];
  clans: Clan[] = [];
  plots: Plot[] = [];
  routes: TradeRoute[] = [];
  private rng: Rng;
  private atWarCache = new Map<string, number>();

  constructor(private sim: Simulation) {
    this.rng = sim.rng.fork(777);
  }

  rel(a: number, b: number): Relation {
    const k = key(a, b);
    let r = this.relations.get(k);
    if (!r) {
      const ka = this.sim.kingdomSys.kingdoms[a];
      const kb = this.sim.kingdomSys.kingdoms[b];
      const same = ka && kb && ka.race === kb.race;
      r = { a: Math.min(a, b), b: Math.max(a, b), opinion: same ? 15 : -5, alliance: false, truce: 0, trade: 0 };
      this.relations.set(k, r);
    }
    return r;
  }

  activeWars(): War[] {
    return this.wars.filter((w) => w.ended < 0);
  }

  warBetween(a: number, b: number): War | null {
    const c = this.atWarCache.get(key(a, b));
    if (c !== undefined) return c >= 0 ? this.wars[c]! : null;
    for (const w of this.wars) {
      if (w.ended >= 0) continue;
      if ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a))) {
        this.atWarCache.set(key(a, b), w.id);
        return w;
      }
    }
    this.atWarCache.set(key(a, b), -1);
    return null;
  }

  atWar(a: number, b: number): boolean {
    if (a < 0 || b < 0 || a === b) return false;
    return this.warBetween(a, b) !== null;
  }

  hostile(i: number, j: number): boolean {
    const e = this.sim.creatures.e;
    const ka = e.kingdom[i]!;
    const kb = e.kingdom[j]!;
    if (ka < 0 || kb < 0) return false;
    return this.atWar(ka, kb);
  }

  step(sim: Simulation): void {
    const tick = sim.tick;
    if (tick % 24 === 11) this.sieges();
    if (tick % TICKS_PER_DAY !== 120) return;
    this.atWarCache.clear();
    const ks = sim.kingdomSys.kingdoms.filter((k) => k.alive);
    this.clansDaily();
    this.tributesDaily();
    for (let x = 0; x < ks.length; x++)
      for (let y = x + 1; y < ks.length; y++) this.relationDaily(ks[x]!, ks[y]!, tick);
    for (const w of this.activeWars()) this.warDaily(w);
    for (const k of ks) this.plotsDaily(k);
    this.tradeDaily();
    this.atWarCache.clear();
  }

  private borderContact(a: Kingdom, b: Kingdom): number {
    const cs = this.sim.cities;
    const w = this.sim.world;
    let best = 1e9;
    for (const ca of a.cities) {
      const A = cs.city(ca);
      if (!A) continue;
      for (const cb of b.cities) {
        const B = cs.city(cb);
        if (!B) continue;
        const d = Math.hypot((A.center % w.w) - (B.center % w.w), Math.floor(A.center / w.w) - Math.floor(B.center / w.w)) - A.radius - B.radius;
        if (d < best) best = d;
      }
    }
    return best;
  }

  private relationDaily(a: Kingdom, b: Kingdom, tick: number): void {
    const sim = this.sim;
    const r = this.rel(a.id, b.id);
    const dist = this.borderContact(a, b);
    let drift = 0;
    if (a.race === b.race) drift += 0.6;
    else drift -= 0.1;
    if (dist < 8) drift -= 0.8;
    else if (dist > 60) drift += 0.2;
    drift -= (sim.rulerMod(a, 'war') + sim.rulerMod(b, 'war')) * 0.5;
    drift += sim.relationBonus(a, b);
    if (r.trade > 0) drift += 0.6;
    if (r.alliance) drift += 0.3;
    r.opinion = Math.max(-100, Math.min(100, r.opinion * 0.995 + drift));
    const war = this.warBetween(a.id, b.id);
    if (war) return;
    if (!sim.laws.wars || tick < r.truce) return;
    if (r.alliance && r.opinion < -10 && this.rng.chance(0.15)) {
      r.alliance = false;
      this.betray(a, b, 'ally');
      return;
    }
    if (!r.alliance && (r.opinion > 35 || (r.opinion > 10 && this.commonEnemy(a.id, b.id))) && this.rng.chance(0.08) && dist < 160) {
      r.alliance = true;
      sim.kingdomSys.log(a, `alliance:${b.name}`);
      sim.kingdomSys.log(b, `alliance:${a.name}`);
      sim.emit({ kind: 'alliance', text: 'ev.alliance', args: { a: a.name, b: b.name }, important: true });
      return;
    }
    if (r.opinion < -35 && dist < 30) {
      const pa = a.army + a.pop * 0.1;
      const pb = b.army + b.pop * 0.1;
      const agg = (0.04 + sim.rulerMod(a, 'war') * 0.04 + sim.laws.eventFrequency * 0.01) * sim.events.mod('war');
      const cause = this.holyCause(a, b) ? 'religion' : dist < 8 ? 'border' : 'conquest';
      if (pa > pb * 0.9 && this.rng.chance(agg)) this.declare(a, b, cause);
      else if (pb > pa * 0.9 && this.rng.chance(agg)) this.declare(b, a, cause);
    }
  }

  private holyCause(a: Kingdom, b: Kingdom): boolean {
    const sim = this.sim;
    const ca = sim.cities.city(a.capital);
    const cb = sim.cities.city(b.capital);
    if (!ca || !cb || ca.religion < 0 || cb.religion < 0 || ca.religion === cb.religion) return false;
    return sim.beliefs.tenet(ca.religion, 'war') || sim.beliefs.tenet(cb.religion, 'war');
  }

  private commonEnemy(a: number, b: number): boolean {
    for (const k of this.sim.kingdomSys.kingdoms) {
      if (!k.alive || k.id === a || k.id === b) continue;
      const ra = this.relations.get(key(a, k.id));
      const rb = this.relations.get(key(b, k.id));
      if (!ra || !rb) continue;
      if ((ra.opinion < -25 || this.atWar(a, k.id)) && (rb.opinion < -25 || this.atWar(b, k.id))) return true;
    }
    return false;
  }

  declare(att: Kingdom, def: Kingdom, cause: string): War {
    const sim = this.sim;
    const w: War = { id: this.wars.length, attackers: [att.id], defenders: [def.id], cause, started: sim.tick, ended: -1, casualties: [0, 0], captured: [], goal: -1, siege: 0, result: '' };
    this.wars.push(w);
    this.atWarCache.clear();
    const r = this.rel(att.id, def.id);
    r.opinion = Math.min(r.opinion, -50);
    r.alliance = false;
    r.trade = 0;
    this.routes = this.routes.filter((x) => !this.routeBetween(x, att.id, def.id));
    w.goal = this.pickGoal(w);
    sim.kingdomSys.log(att, `war:${def.name}`);
    sim.kingdomSys.log(def, `war:${att.name}`);
    sim.emit({ kind: 'war', text: 'ev.war', args: { a: att.name, b: def.name, cause: 'cause.' + cause }, important: true });
    for (const side of [0, 1] as const) {
      const main = side === 0 ? att : def;
      for (const k of sim.kingdomSys.kingdoms) {
        if (!k.alive || k.id === att.id || k.id === def.id) continue;
        const rr = this.relations.get(key(main.id, k.id));
        if (!rr || !rr.alliance) continue;
        const willing = rr.opinion > 10 || sim.rulerMod(k, 'war') > 0;
        if (willing && !(side === 0 ? w.defenders : w.attackers).includes(k.id)) {
          (side === 0 ? w.attackers : w.defenders).push(k.id);
          sim.emit({ kind: 'callToArms', text: 'ev.callToArms', args: { ally: k.name, kingdom: main.name } });
        } else {
          rr.alliance = false;
          this.betray(k, main, 'call');
        }
      }
    }
    this.setWarFooting();
    return w;
  }

  private betray(traitor: Kingdom, victim: Kingdom, kind: string): void {
    const sim = this.sim;
    const r = this.rel(traitor.id, victim.id);
    r.opinion = Math.max(-100, r.opinion - 45);
    sim.kingdomSys.log(traitor, `betrayal:${victim.name}`);
    sim.kingdomSys.log(victim, `betrayal:${traitor.name}`);
    sim.emit({ kind: 'betrayal', text: kind === 'call' ? 'ev.betrayalCall' : 'ev.betrayal', args: { a: traitor.name, b: victim.name }, important: true });
  }

  private pickGoal(w: War): number {
    const sim = this.sim;
    const ww = sim.world;
    let best = -1;
    let bd = 1e9;
    for (const att of w.attackers) {
      const ka = sim.kingdomSys.get(att);
      if (!ka) continue;
      const cap = sim.cities.city(ka.capital);
      if (!cap) continue;
      for (const def of w.defenders) {
        const kd = sim.kingdomSys.get(def);
        if (!kd) continue;
        for (const cid of kd.cities) {
          const c = sim.cities.city(cid);
          if (!c) continue;
          const d = Math.hypot((c.center % ww.w) - (cap.center % ww.w), Math.floor(c.center / ww.w) - Math.floor(cap.center / ww.w));
          if (d < bd) {
            bd = d;
            best = c.id;
          }
        }
      }
    }
    return best;
  }

  private setWarFooting(): void {
    const sim = this.sim;
    const fighting = new Set<number>();
    for (const w of this.activeWars()) for (const k of [...w.attackers, ...w.defenders]) fighting.add(k);
    for (const c of sim.cities.cities) {
      if (!c.alive) continue;
      c.extra.war = fighting.has(c.kingdom) ? 1 : 0;
    }
  }

  warTarget(c: City, _i: number): number {
    for (const w of this.activeWars()) {
      if (!w.attackers.includes(c.kingdom)) continue;
      const g = this.sim.cities.city(w.goal);
      if (g) return g.center;
    }
    return -1;
  }

  private sieges(): void {
    const sim = this.sim;
    const cr = sim.creatures;
    const e = cr.e;
    const ww = sim.world;
    for (const w of this.activeWars()) {
      let g = sim.cities.city(w.goal);
      if (!g || !w.defenders.includes(g.kingdom)) {
        w.goal = this.pickGoal(w);
        w.siege = 0;
        g = sim.cities.city(w.goal);
        if (!g) continue;
      }
      const cx = (g.center % ww.w) + 0.5;
      const cy = Math.floor(g.center / ww.w) + 0.5;
      let att = 0;
      let def = 0;
      cr.grid.query(cx, cy, 7, (j) => {
        if (!e.alive[j]) return;
        const k = e.kingdom[j]!;
        if (w.attackers.includes(k)) att++;
        else if (k === g!.kingdom && e.age[j]! >= SPECIES[e.species[j]!]!.maturity) def += e.job[j] === Job.Warrior ? 1 : 0.25;
      });
      if (att >= 3 && att > def * 1.2) {
        w.siege++;
        if (w.siege % 4 === 0) {
          const b = g.buildings.find((x) => x.done && x.type !== Bld.Hall && x.type !== Bld.Wall && this.rng.chance(0.3));
          if (b && ww.fire[b.cell] === 0) {
            ww.fire[b.cell] = 5;
            ww.wake(b.cell, 40);
          }
        }
        if (w.siege >= 12) this.capture(w, g);
      } else w.siege = Math.max(0, w.siege - 1);
    }
  }

  private capture(w: War, c: City): void {
    const sim = this.sim;
    const loser = sim.kingdomSys.get(c.kingdom);
    const winner = sim.kingdomSys.get(w.attackers[0]!);
    if (!winner) return;
    const e = sim.creatures.e;
    let prisoners = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== c.id) continue;
      if (e.flags[i]! & EFlag.Ruler) {
        sim.creatures.die(i, -1, 'executed');
        continue;
      }
      if (e.job[i] === Job.Warrior) e.job[i] = Job.None;
      prisoners++;
    }
    sim.kingdomSys.assignCity(c, winner);
    c.loyalty = 0.35;
    c.happiness = Math.max(0, c.happiness - 0.3);
    w.captured.push(c.id);
    w.siege = 0;
    sim.kingdomSys.log(winner, `capture:${c.name}`);
    if (loser) sim.kingdomSys.log(loser, `lost:${c.name}`);
    sim.emit({ kind: 'capture', text: 'ev.capture', args: { city: c.name, a: winner.name, b: loser?.name ?? '?', n: prisoners }, x: c.center % sim.world.w, y: Math.floor(c.center / sim.world.w), important: true });
    w.goal = this.pickGoal(w);
    this.setWarFooting();
  }

  onDeath(i: number, killer: number): void {
    const e = this.sim.creatures.e;
    if (killer < 0) return;
    const kv = e.kingdom[i]!;
    const kk = e.kingdom[killer]!;
    if (kv < 0 || kk < 0) return;
    const w = this.warBetween(kv, kk);
    if (!w) return;
    if (w.attackers.includes(kv)) w.casualties[0]++;
    else w.casualties[1]++;
  }

  private warDaily(w: War): void {
    const sim = this.sim;
    const tick = sim.tick;
    w.attackers = w.attackers.filter((k) => sim.kingdomSys.get(k));
    w.defenders = w.defenders.filter((k) => sim.kingdomSys.get(k));
    if (w.attackers.length === 0 || w.defenders.length === 0) {
      this.endWar(w, w.attackers.length ? 'attackers' : 'defenders');
      return;
    }
    const age = tick - w.started;
    const pa = w.attackers.reduce((s, k) => s + (sim.kingdomSys.get(k)?.pop ?? 0), 0);
    const pd = w.defenders.reduce((s, k) => s + (sim.kingdomSys.get(k)?.pop ?? 0), 0);
    const exhaustionA = w.casualties[0] / Math.max(10, pa);
    const exhaustionD = w.casualties[1] / Math.max(10, pd);
    if (age > TICKS_PER_YEAR * 3 || (age > TICKS_PER_YEAR && (exhaustionA > 0.4 || exhaustionD > 0.4)) || (age > TICKS_PER_YEAR * 1.5 && this.rng.chance(0.03))) {
      const winner = w.captured.length > 0 || exhaustionD > exhaustionA * 1.3 ? 'attackers' : exhaustionA > exhaustionD * 1.3 ? 'defenders' : 'draw';
      this.endWar(w, winner);
    }
  }

  endWar(w: War, result: string): void {
    const sim = this.sim;
    w.ended = sim.tick;
    w.result = result;
    this.atWarCache.clear();
    const a = sim.kingdomSys.kingdoms[w.attackers[0] ?? -1];
    const d = sim.kingdomSys.kingdoms[w.defenders[0] ?? -1];
    if (a && d) {
      const r = this.rel(a.id, d.id);
      r.truce = sim.tick + TICKS_PER_YEAR * 3;
      r.opinion = Math.max(r.opinion, -30);
      if (result !== 'draw' && a.alive && d.alive) {
        const [win, lose] = result === 'attackers' ? [a, d] : [d, a];
        this.tributes.push({ from: lose.id, to: win.id, amount: 0.8 + lose.pop * 0.01, until: sim.tick + TICKS_PER_YEAR * 3 });
      }
      sim.kingdomSys.log(a, `peace:${d.name}`);
      sim.kingdomSys.log(d, `peace:${a.name}`);
      sim.emit({ kind: 'peace', text: 'ev.peace', args: { a: a.name, b: d.name, result: 'result.' + result, n: w.captured.length }, important: true });
    }
    this.setWarFooting();
  }

  private tributesDaily(): void {
    const sim = this.sim;
    this.tributes = this.tributes.filter((t) => {
      if (sim.tick > t.until) return false;
      const from = sim.kingdomSys.get(t.from);
      const to = sim.kingdomSys.get(t.to);
      if (!from || !to) return false;
      const pay = Math.min(from.treasury, t.amount);
      from.treasury -= pay;
      to.treasury += pay;
      return true;
    });
  }

  onRebellion(c: City, from: Kingdom, to: Kingdom): void {
    if (!this.sim.laws.wars) return;
    const w = this.declare(from, to, 'rebellion');
    w.goal = c.id;
  }

  onKingdomFell(k: Kingdom): void {
    for (const w of this.activeWars()) {
      if (w.attackers.includes(k.id) || w.defenders.includes(k.id)) this.atWarCache.clear();
    }
    this.plots = this.plots.filter((p) => p.kingdom !== k.id || p.state !== 'active');
  }

  newClans(members: number[], k: Kingdom | null): void {
    const e = this.sim.creatures.e;
    const per = 4;
    let cur: Clan | null = null;
    members.forEach((i, n) => {
      if (e.clan[i]! >= 0) return;
      if (!cur || n % per === 0) {
        cur = { id: this.clans.length, name: placeName(this.rng.nextU32(), SPECIES[e.species[i]!]!.race), kingdom: k?.id ?? -1, members: 0, prestige: 0, founded: this.sim.tick, alive: true };
        this.clans.push(cur);
      }
      e.clan[i] = cur.id;
      cur.members++;
    });
  }

  onBirth(child: number, mother: number): void {
    const e = this.sim.creatures.e;
    const fi = e.index(e.father[child]!);
    const clan = fi >= 0 && e.clan[fi]! >= 0 ? e.clan[fi]! : e.clan[mother]!;
    e.clan[child] = clan;
  }

  private clansDaily(): void {
    const e = this.sim.creatures.e;
    for (const c of this.clans) {
      c.members = 0;
      c.prestige = 0;
    }
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const cl = this.clans[e.clan[i]!];
      if (!cl) continue;
      cl.members++;
      cl.kingdom = e.kingdom[i]!;
      cl.prestige += e.level[i]! + e.kills[i]! * 0.5 + (e.flags[i]! & EFlag.Ruler ? 20 : 0) + (e.flags[i]! & EFlag.Hero ? 10 : 0);
    }
    for (const c of this.clans) if (c.members === 0) c.alive = false;
  }

  findHeir(k: Kingdom): number {
    const e = this.sim.creatures.e;
    const prevClan = k.extra.dynasty !== undefined ? k.extra.dynasty - 1 : -1;
    if (prevClan < 0) return -1;
    let best = -1;
    let bs = -1;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.kingdom[i] !== k.id || e.clan[i] !== prevClan) continue;
      if (e.age[i]! < SPECIES[e.species[i]!]!.maturity) continue;
      const s = e.age[i]! + e.level[i]! * 3;
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    return best;
  }

  onNewRuler(k: Kingdom, unit: number, succession: boolean): void {
    const e = this.sim.creatures.e;
    const clan = e.clan[unit]!;
    const prev = k.extra.dynasty !== undefined ? k.extra.dynasty - 1 : -1;
    if (clan >= 0 && clan !== prev) {
      k.extra.dynasty = clan + 1;
      const cl = this.clans[clan];
      if (cl && succession) this.sim.emit({ kind: 'dynasty', text: 'ev.dynasty', args: { kingdom: k.name, clan: cl.name } });
    }
  }

  private plotsDaily(k: Kingdom): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    for (const p of this.plots) {
      if (p.state !== 'active' || p.kingdom !== k.id) continue;
      const li = e.index(p.leader);
      if (li < 0 || e.kingdom[li] !== k.id) {
        p.state = 'failed';
        continue;
      }
      p.progress += 0.03 + p.members * 0.01;
      const detect = 0.02 + (sim.rulerMod(k, 'loyalty') > 0 ? 0.02 : 0);
      if (this.rng.chance(detect)) {
        p.state = 'failed';
        sim.creatures.die(li, -1, 'executed');
        sim.kingdomSys.log(k, `plot:${p.leaderName}`);
        sim.emit({ kind: 'plotFailed', text: 'ev.plotFailed', args: { kingdom: k.name, name: p.leaderName, type: 'plot.' + p.type } });
        continue;
      }
      if (p.progress >= 1) this.executePlot(k, p, li);
    }
    if (this.plots.filter((p) => p.state === 'active' && p.kingdom === k.id).length > 0) return;
    if (k.pop < 15 || !this.rng.chance(0.04 * Math.max(0.3, sim.laws.eventFrequency))) return;
    const ri = e.index(k.ruler);
    let rival = -1;
    let rs = -1;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.kingdom[i] !== k.id || i === ri) continue;
      if (e.age[i]! < SPECIES[e.species[i]!]!.maturity) continue;
      const s = e.level[i]! * 2 + e.kills[i]! + (e.flags[i]! & EFlag.Hero ? 8 : 0) + (this.clans[e.clan[i]!]?.prestige ?? 0) * 0.02;
      if (s > rs) {
        rs = s;
        rival = i;
      }
    }
    if (rival < 0) return;
    const capital = sim.cities.city(k.capital);
    const unhappy = capital ? 1 - capital.happiness : 0.5;
    const types: Plot['type'][] = ['coup', 'assassination', 'rebellion', 'war'];
    const type = types[this.rng.weighted([1 + unhappy * 2, 0.6, k.cities.length > 1 ? 1 : 0, sim.rulerMod(k, 'war') > 0 ? 1 : 0.2])]!;
    let target = -1;
    if (type === 'rebellion') {
      const cs = k.cities.filter((c) => c !== k.capital);
      target = cs.length ? cs[this.rng.int(cs.length)]! : -1;
    } else if (type === 'war') {
      let worst = 1e9;
      for (const o of sim.kingdomSys.kingdoms) {
        if (!o.alive || o.id === k.id) continue;
        const r = this.rel(k.id, o.id);
        if (r.opinion < worst && sim.tick >= r.truce) {
          worst = r.opinion;
          target = o.id;
        }
      }
    }
    const p: Plot = { id: this.plots.length, kingdom: k.id, type, leader: e.id(rival), leaderName: sim.creatures.unitName(rival), members: 1 + this.rng.int(4), progress: 0, target, started: sim.tick, state: 'active' };
    this.plots.push(p);
    if (this.plots.length > 200) this.plots.splice(0, this.plots.length - 200);
    sim.emit({ kind: 'plot', text: 'ev.plot', args: { kingdom: k.name, name: p.leaderName, type: 'plot.' + type } });
  }

  private executePlot(k: Kingdom, p: Plot, leader: number): void {
    const sim = this.sim;
    const e = sim.creatures.e;
    p.state = 'done';
    const ri = e.index(k.ruler);
    switch (p.type) {
      case 'coup':
      case 'assassination': {
        if (ri >= 0) {
          e.flags[ri] = e.flags[ri]! & ~EFlag.Ruler;
          if (p.type === 'assassination') sim.creatures.die(ri, leader, 'assassinated');
        }
        k.ruler = -1;
        k.extra.dynasty = e.clan[leader]! + 1;
        k.ruler = e.id(leader);
        k.rulerName = sim.creatures.unitName(leader);
        k.rulers++;
        e.flags[leader] = e.flags[leader]! | EFlag.Ruler;
        sim.kingdomSys.log(k, `coup:${k.rulerName}`);
        sim.emit({ kind: 'coup', text: p.type === 'coup' ? 'ev.coup' : 'ev.assassination', args: { kingdom: k.name, name: k.rulerName }, important: true });
        break;
      }
      case 'rebellion': {
        const c = sim.cities.city(p.target);
        if (c && c.kingdom === k.id) {
          e.city[leader] = c.id;
          sim.kingdomSys.rebel(c, k);
        }
        break;
      }
      case 'war': {
        const t = sim.kingdomSys.get(p.target);
        if (t && !this.atWar(k.id, t.id) && sim.laws.wars) this.declare(k, t, 'plot');
        break;
      }
    }
  }

  private routeBetween(r: TradeRoute, a: number, b: number): boolean {
    const cs = this.sim.cities;
    const ka = cs.cities[r.from]?.kingdom;
    const kb = cs.cities[r.to]?.kingdom;
    return (ka === a && kb === b) || (ka === b && kb === a);
  }

  private tradeDaily(): void {
    const sim = this.sim;
    const cs = sim.cities;
    const ww = sim.world;
    this.routes = this.routes.filter((r) => {
      const a = cs.city(r.from);
      const b = cs.city(r.to);
      return a && b && !this.atWar(a.kingdom, b.kingdom);
    });
    for (const c of cs.cities) {
      if (!c.alive || !c.buildings.some((b) => b.done && b.type === Bld.Market)) continue;
      if (this.routes.some((r) => r.from === c.id)) continue;
      let best = -1;
      let bd = 1e9;
      for (const o of cs.cities) {
        if (!o.alive || o.id === c.id || o.kingdom === c.kingdom) continue;
        if (this.atWar(c.kingdom, o.kingdom) || this.rel(c.kingdom, o.kingdom).opinion < -10) continue;
        const d = Math.hypot((c.center % ww.w) - (o.center % ww.w), Math.floor(c.center / ww.w) - Math.floor(o.center / ww.w));
        if (d < bd && d < 150) {
          bd = d;
          best = o.id;
        }
      }
      if (best >= 0) {
        this.routes.push({ from: c.id, to: best, goods: 0, started: sim.tick });
        const o = cs.city(best)!;
        this.rel(c.kingdom, o.kingdom).trade = 1;
        sim.emit({ kind: 'trade', text: 'ev.tradeRoute', args: { a: c.name, b: o.name } });
      }
    }
    for (const r of this.relations.values()) r.trade = this.routes.some((x) => this.routeBetween(x, r.a, r.b)) ? 1 : 0;
  }

  traderTarget(c: City, i: number): number {
    const e = this.sim.creatures.e;
    const r = this.routes.find((x) => x.from === c.id);
    if (!r) return -1;
    const o = this.sim.cities.city(r.to);
    if (!o) return -1;
    return e.carryAmt[i]! > 0 && e.carry[i] === 4 ? c.center : o.center;
  }

  traderWork(c: City, i: number, timer: number): boolean {
    const sim = this.sim;
    const e = sim.creatures.e;
    const r = this.routes.find((x) => x.from === c.id);
    e.anim[i] = Anim.Work;
    if (!r || timer < 30) return true;
    const o = sim.cities.city(r.to);
    if (!o) return false;
    const atHome = e.taskTarget[i] === c.center;
    if (atHome) {
      if (e.carryAmt[i]) c.store.add('gold', e.carryAmt[i]!, 'trade income');
      e.carryAmt[i] = 0;
      e.phase[i] = 0;
      return false;
    }
    let sold = 0;
    for (const res of ['food', 'wood', 'stone', 'tools']) {
      const surplus = c.store.free(res) - 40;
      if (surplus <= 0) continue;
      const n = Math.min(10, surplus, o.store.room());
      if (n <= 0) continue;
      sold += c.store.takeUpTo(res, n, 'export') ;
      o.store.add(res, n, 'import');
    }
    const gold = Math.max(1, Math.round(sold / 5));
    r.goods += sold;
    e.carry[i] = 4;
    e.carryAmt[i] = gold;
    sim.creatures.gainXp(i, 1);
    const rel = this.rel(c.kingdom, o.kingdom);
    rel.opinion = Math.min(100, rel.opinion + 0.5);
    e.phase[i] = 0;
    e.task[i] = Task.Work;
    return false;
  }

  kingdomExtra(k: Kingdom): Record<string, string | number> {
    const sim = this.sim;
    const out: Record<string, string | number> = {};
    const wars = this.activeWars().filter((w) => w.attackers.includes(k.id) || w.defenders.includes(k.id));
    const names = (ids: number[]) => ids.map((x) => sim.kingdomSys.kingdoms[x]?.name ?? '?').join(', ');
    if (wars.length) out['dip.wars'] = '$' + wars.map((w) => names(w.attackers.includes(k.id) ? w.defenders : w.attackers)).join('; ');
    const allies = [...this.relations.values()].filter((r) => r.alliance && (r.a === k.id || r.b === k.id)).map((r) => (r.a === k.id ? r.b : r.a));
    if (allies.length) out['dip.allies'] = '$' + names(allies);
    const dyn = k.extra.dynasty !== undefined ? this.clans[k.extra.dynasty - 1] : undefined;
    if (dyn) out['dip.dynasty'] = '$' + dyn.name;
    const plots = this.plots.filter((p) => p.kingdom === k.id && p.state === 'active');
    if (plots.length) out['dip.plots'] = '$' + plots.map((p) => `${p.leaderName} (${Math.round(p.progress * 100)}%)`).join(', ');
    const trib = this.tributes.filter((t) => t.from === k.id);
    if (trib.length) out['dip.tribute'] = '$' + names(trib.map((t) => t.to));
    return out;
  }

  info(): unknown {
    const sim = this.sim;
    const name = (id: number) => sim.kingdomSys.kingdoms[id]?.name ?? '?';
    return {
      wars: this.wars
        .slice(-30)
        .reverse()
        .map((w) => ({ id: w.id, attackers: w.attackers.map(name), defenders: w.defenders.map(name), cause: w.cause, started: w.started, ended: w.ended, casualties: w.casualties, captured: w.captured.map((c) => sim.cities.cities[c]?.name ?? '?'), result: w.result, siege: w.siege, goal: sim.cities.cities[w.goal]?.name ?? '' })),
      plots: this.plots
        .filter((p) => p.state === 'active')
        .map((p) => ({ kingdom: name(p.kingdom), type: p.type, leader: p.leaderName, progress: p.progress, members: p.members, target: p.type === 'war' ? name(p.target) : p.type === 'rebellion' ? sim.cities.cities[p.target]?.name ?? '' : '' })),
      alliances: [...this.relations.values()].filter((r) => r.alliance).map((r) => [name(r.a), name(r.b)]),
      routes: this.routes.map((r) => [sim.cities.cities[r.from]?.name ?? '?', sim.cities.cities[r.to]?.name ?? '?', r.goods]),
      tributes: this.tributes.map((t) => [name(t.from), name(t.to), Math.round(t.amount * 10) / 10]),
      clans: this.clans
        .filter((c) => c.alive)
        .sort((a, b) => b.prestige - a.prestige)
        .slice(0, 20)
        .map((c) => ({ name: c.name, kingdom: name(c.kingdom), members: c.members, prestige: Math.round(c.prestige) })),
      relations: [...this.relations.values()]
        .filter((r) => sim.kingdomSys.get(r.a) && sim.kingdomSys.get(r.b))
        .map((r) => ({ a: name(r.a), b: name(r.b), opinion: Math.round(r.opinion), alliance: r.alliance, war: this.atWar(r.a, r.b), trade: r.trade })),
    };
  }

  save(w: SaveWriter): void {
    w.json('DIPL', { relations: [...this.relations.values()], wars: this.wars, tributes: this.tributes, clans: this.clans, plots: this.plots, routes: this.routes, rng: Array.from(this.rng.getState()) });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ relations: Relation[]; wars: War[]; tributes: Tribute[]; clans: Clan[]; plots: Plot[]; routes: TradeRoute[]; rng: number[] } | null>('DIPL', null);
    if (!m) return;
    this.relations = new Map(m.relations.map((x) => [key(x.a, x.b), x]));
    this.wars = m.wars;
    this.tributes = m.tributes;
    this.clans = m.clans;
    this.plots = m.plots;
    this.routes = m.routes;
    this.rng.setState(m.rng);
    this.atWarCache.clear();
  }

  hash(): number {
    let h = this.wars.length * 31 + this.plots.length * 7 + this.routes.length;
    for (const r of this.relations.values()) h = (Math.imul(h, 31) + Math.round(r.opinion * 10) + (r.alliance ? 1 : 0)) | 0;
    return h >>> 0;
  }
}
