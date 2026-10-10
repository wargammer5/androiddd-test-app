import { species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import type { City } from './cities.ts';
import { Rng, hashString } from './rng.ts';
import { TICKS_PER_PULSE } from './time.ts';
import { hsl } from './kingdoms.ts';
import { lutSet, LUT_CULTURE, LUT_RELIGION } from './palette.ts';

export interface Language {
  id: number;
  name: string;
  consonants: string[];
  vowels: string[];
  patterns: string[];
  endings: string[];
  parent: number;
}

export const CULTURE_TRAITS = ['militant', 'mercantile', 'scholarly', 'agrarian', 'seafaring', 'artisan', 'xenophobic', 'tolerant', 'nomadic', 'builders'] as const;
export const TENETS = ['war', 'harvest', 'sea', 'sun', 'death', 'fire', 'wisdom', 'peace', 'nature', 'sky'] as const;

export interface Culture {
  id: number;
  name: string;
  language: number;
  traits: string[];
  color: [number, number, number];
  race: number;
  origin: number;
  founded: number;
  parent: number;
  members: number;
  cities: number;
  alive: boolean;
}

export interface Religion {
  id: number;
  name: string;
  deity: string;
  tenets: string[];
  color: [number, number, number];
  holyCity: number;
  founder: string;
  founded: number;
  parent: number;
  followers: number;
  cities: number;
  faith: number;
  alive: boolean;
}

const CONS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'sh', 'th', 'kh', 'zh', 'ch', 'f', 'h', 'y', 'w', 'x', 'q'];
const VOWS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ei', 'ou', 'y', 'ia', 'uo'];
const PATS = ['CV', 'CVC', 'VC', 'CVV', 'CCV', 'V'];

export class Beliefs implements System {
  readonly name = 'beliefs';
  languages: Language[] = [];
  cultures: Culture[] = [];
  religions: Religion[] = [];
  private rng: Rng;
  private raceCulture = new Map<number, number>();

  constructor(private sim: Simulation) {
    this.rng = sim.rng.fork(999);
  }

  newLanguage(seedText: string, parent?: Language): Language {
    const r = new Rng(hashString(seedText) ^ this.rng.nextU32());
    let l: Language;
    if (parent) {
      l = { ...parent, id: this.languages.length, consonants: [...parent.consonants], vowels: [...parent.vowels], patterns: [...parent.patterns], endings: [...parent.endings], parent: parent.id, name: '' };
      for (let k = 0; k < 3; k++) {
        const pool = r.chance(0.5) ? l.consonants : l.vowels;
        const src = pool === l.consonants ? CONS : VOWS;
        pool[r.int(pool.length)] = r.pick(src);
      }
      if (r.chance(0.5)) l.endings[r.int(l.endings.length)] = this.word(l, r, 1);
    } else {
      l = {
        id: this.languages.length,
        name: '',
        consonants: r.shuffle([...CONS]).slice(0, 7 + r.int(6)),
        vowels: r.shuffle([...VOWS]).slice(0, 3 + r.int(3)),
        patterns: r.shuffle([...PATS]).slice(0, 3 + r.int(2)),
        endings: [],
        parent: -1,
      };
      for (let k = 0; k < 4; k++) l.endings.push(this.word(l, r, 1));
    }
    l.name = this.cap(this.word(l, r, 2));
    this.languages.push(l);
    return l;
  }

  word(l: Language, r: Rng, syl: number): string {
    let s = '';
    for (let k = 0; k < syl; k++) {
      const p = r.pick(l.patterns);
      for (const ch of p) s += ch === 'C' ? r.pick(l.consonants) : r.pick(l.vowels);
    }
    return s;
  }

  cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  langName(langId: number, seed: number, kind: 'person' | 'place' | 'deity' | 'group'): string {
    const l = this.languages[langId];
    if (!l) return '';
    const r = new Rng(seed ^ (langId * 2654435761));
    let s = this.word(l, r, kind === 'person' ? 1 + r.int(2) : 2);
    if (kind === 'place' || kind === 'group') s += r.pick(l.endings);
    if (s.length < 3) s += r.pick(l.vowels) + r.pick(l.consonants);
    if (s.length > 12) s = s.slice(0, 12);
    return this.cap(s);
  }

  cultureFor(race: number, city: City): Culture {
    const existing = this.raceCulture.get(race);
    if (existing !== undefined && this.cultures[existing]?.alive) return this.cultures[existing]!;
    return this.newCulture(race, city.id, -1);
  }

  newCulture(race: number, origin: number, parent: number): Culture {
    const p = this.cultures[parent];
    const lang = p ? this.newLanguage('lang' + this.cultures.length, this.languages[p.language]) : this.newLanguage(SPECIES[race]!.key + this.cultures.length);
    const traits = p ? [...p.traits] : [];
    if (p) {
      if (traits.length && this.rng.chance(0.7)) traits.splice(this.rng.int(traits.length), 1);
      const t = this.rng.pick(CULTURE_TRAITS);
      if (!traits.includes(t)) traits.push(t);
    } else {
      while (traits.length < 2) {
        const t = this.rng.pick(CULTURE_TRAITS);
        if (!traits.includes(t)) traits.push(t);
      }
    }
    const c: Culture = {
      id: this.cultures.length,
      name: this.langName(lang.id, this.rng.nextU32(), 'group'),
      language: lang.id,
      traits: traits.slice(0, 3),
      color: hsl((this.cultures.length * 0.37 + 0.13) % 1, 0.55, 0.55),
      race,
      origin,
      founded: this.sim.tick,
      parent,
      members: 0,
      cities: 0,
      alive: true,
    };
    this.cultures.push(c);
    if (parent < 0) this.raceCulture.set(race, c.id);
    this.sim.lutDirty = true;
    return c;
  }

  newReligion(city: City, founder: string, parent: number): Religion {
    const pr = this.religions[parent];
    const culture = this.cultures[city.culture];
    const lang = culture?.language ?? 0;
    const tenets = pr ? [...pr.tenets] : [];
    if (pr) {
      tenets.splice(this.rng.int(tenets.length), 1);
      const t = this.rng.pick(TENETS);
      if (!tenets.includes(t)) tenets.push(t);
    } else
      while (tenets.length < 2) {
        const t = this.rng.pick(TENETS);
        if (!tenets.includes(t)) tenets.push(t);
      }
    const r: Religion = {
      id: this.religions.length,
      name: this.langName(lang, this.rng.nextU32(), 'group'),
      deity: this.langName(lang, this.rng.nextU32(), 'deity'),
      tenets,
      color: hsl((this.religions.length * 0.29 + 0.6) % 1, 0.6, 0.6),
      holyCity: city.id,
      founder,
      founded: this.sim.tick,
      parent,
      followers: 0,
      cities: 0,
      faith: 10,
      alive: true,
    };
    this.religions.push(r);
    this.sim.lutDirty = true;
    return r;
  }

  onCityFounded(c: City): void {
    const e = this.sim.creatures.e;
    let culture = -1;
    let religion = -1;
    const votesC = new Map<number, number>();
    const votesR = new Map<number, number>();
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== c.id) continue;
      if (e.culture[i]! >= 0) votesC.set(e.culture[i]!, (votesC.get(e.culture[i]!) ?? 0) + 1);
      if (e.religion[i]! >= 0) votesR.set(e.religion[i]!, (votesR.get(e.religion[i]!) ?? 0) + 1);
    }
    for (const [k, v] of votesC) if (culture < 0 || v > votesC.get(culture)!) culture = k;
    for (const [k, v] of votesR) if (religion < 0 || v > votesR.get(religion)!) religion = k;
    if (culture < 0 || !this.cultures[culture]?.alive) culture = this.cultureFor(c.race, c).id;
    c.culture = culture;
    c.religion = religion;
    const cul = this.cultures[culture]!;
    c.name = this.langName(cul.language, hashString(c.name), 'place');
    this.syncUnits(c);
  }

  private syncUnits(c: City): void {
    const e = this.sim.creatures.e;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || e.city[i] !== c.id) continue;
      e.culture[i] = c.culture;
      e.religion[i] = c.religion;
    }
  }

  unitName(i: number): string | null {
    const e = this.sim.creatures.e;
    const c = this.cultures[e.culture[i]!];
    if (!c) return null;
    return this.langName(c.language, e.nameSeed[i]!, 'person');
  }

  step(sim: Simulation): void {
    if (sim.tick % TICKS_PER_PULSE !== 150) return;
    const cs = sim.cities.cities.filter((c) => c.alive);
    for (const c of this.cultures) {
      c.members = 0;
      c.cities = 0;
    }
    for (const r of this.religions) {
      r.followers = 0;
      r.cities = 0;
    }
    for (const c of cs) {
      const cu = this.cultures[c.culture];
      if (cu) {
        cu.cities++;
        cu.members += c.pop;
      }
      const re = this.religions[c.religion];
      if (re) {
        re.cities++;
        re.followers += c.pop;
      }
    }
    for (const c of this.cultures) if (c.alive && c.cities === 0 && sim.tick - c.founded > TICKS_PER_PULSE * 4) c.alive = false;
    for (const r of this.religions) if (r.alive && r.cities === 0 && sim.tick - r.founded > TICKS_PER_PULSE * 4) r.alive = false;
    for (const c of cs) {
      this.spreadCulture(c, cs);
      if (sim.laws.religions) this.spreadReligion(c, cs);
      this.syncUnits(c);
    }
    if (sim.laws.religions) this.schisms(cs);
    this.splits(cs);
  }

  private dist(a: City, b: City): number {
    const w = this.sim.world;
    return Math.hypot((a.center % w.w) - (b.center % w.w), Math.floor(a.center / w.w) - Math.floor(b.center / w.w));
  }

  private spreadCulture(c: City, all: City[]): void {
    const infl = new Map<number, number>();
    for (const o of all) {
      if (o === c || o.culture < 0) continue;
      const d = this.dist(c, o);
      if (d > 60) continue;
      const w = (o.pop / (1 + d * 0.15)) * (o.kingdom === c.kingdom ? 1.5 : 0.5);
      infl.set(o.culture, (infl.get(o.culture) ?? 0) + w);
    }
    const own = (infl.get(c.culture) ?? 0) + c.pop * 1.2;
    let best = c.culture;
    let bv = own;
    for (const [k, v] of infl) if (v > bv) {
      bv = v;
      best = k;
    }
    if (best !== c.culture && this.rng.chance(0.12)) {
      const old = this.cultures[c.culture];
      const nw = this.cultures[best]!;
      if (old && old.alive && this.rng.chance(0.25) && !old.traits.includes('xenophobic')) {
        const mix = this.newCulture(c.race, c.id, best);
        mix.traits = [...new Set([...(old.traits.slice(0, 1) ?? []), ...nw.traits.slice(0, 2)])].slice(0, 3);
        mix.name = this.langName(mix.language, this.rng.nextU32(), 'group');
        c.culture = mix.id;
        this.sim.emit({ kind: 'cultureMix', text: 'ev.cultureMix', args: { city: c.name, a: old.name, b: nw.name, c: mix.name } });
      } else {
        c.culture = best;
        this.sim.emit({ kind: 'cultureSpread', text: 'ev.cultureSpread', args: { city: c.name, culture: nw.name } });
      }
      this.sim.lutDirty = true;
      this.sim.markZonesDirty();
    }
  }

  private spreadReligion(c: City, all: City[]): void {
    const sim = this.sim;
    const hasTemple = c.buildings.some((b) => b.done && b.type === 5);
    if (c.religion < 0 && hasTemple && c.pop >= 10 && this.rng.chance(0.15)) {
      const founder = this.prophetName(c);
      const r = this.newReligion(c, founder, -1);
      c.religion = r.id;
      sim.emit({ kind: 'religion', text: 'ev.religionFounded', args: { city: c.name, religion: r.name, deity: r.deity, founder }, important: true });
      sim.markZonesDirty();
      return;
    }
    const infl = new Map<number, number>();
    for (const o of all) {
      if (o === c || o.religion < 0) continue;
      const d = this.dist(c, o);
      if (d > 70) continue;
      const priests = o.jobs[9] ?? 0;
      const w = (o.pop * 0.3 + priests * 6) / (1 + d * 0.1);
      infl.set(o.religion, (infl.get(o.religion) ?? 0) + w);
    }
    const ownPriests = c.jobs[9] ?? 0;
    const own = c.religion >= 0 ? (infl.get(c.religion) ?? 0) + c.pop * 0.6 + ownPriests * 8 : 0;
    let best = c.religion;
    let bv = own;
    for (const [k, v] of infl) if (v > bv) {
      bv = v;
      best = k;
    }
    if (best !== c.religion && best >= 0 && this.rng.chance(c.religion < 0 ? 0.25 : 0.08)) {
      c.religion = best;
      sim.emit({ kind: 'conversion', text: 'ev.conversion', args: { city: c.name, religion: this.religions[best]!.name } });
      sim.lutDirty = true;
      sim.markZonesDirty();
    }
  }

  private prophetName(c: City): string {
    const e = this.sim.creatures.e;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === c.id && e.job[i] === 9) return this.sim.creatures.unitName(i);
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === c.id) return this.sim.creatures.unitName(i);
    return '?';
  }

  private schisms(all: City[]): void {
    for (const r of this.religions) {
      if (!r.alive || r.cities < 4 || !this.rng.chance(0.03 * Math.max(0.3, this.sim.laws.eventFrequency))) continue;
      const holy = this.sim.cities.city(r.holyCity) ?? all.find((c) => c.religion === r.id);
      if (!holy) continue;
      const far = all.filter((c) => c.religion === r.id && c.kingdom !== holy.kingdom);
      if (far.length < 2) continue;
      const seed = far[this.rng.int(far.length)]!;
      const heresy = this.newReligion(seed, this.prophetName(seed), r.id);
      for (const c of far) if (c.kingdom === seed.kingdom) c.religion = heresy.id;
      this.sim.emit({ kind: 'schism', text: 'ev.schism', args: { religion: r.name, heresy: heresy.name, city: seed.name }, important: true });
      this.sim.markZonesDirty();
    }
  }

  private splits(all: City[]): void {
    for (const cu of this.cultures) {
      if (!cu.alive || cu.cities < 5 || !this.rng.chance(0.02)) continue;
      const members = all.filter((c) => c.culture === cu.id);
      const kingdoms = new Set(members.map((c) => c.kingdom));
      if (kingdoms.size < 2) continue;
      const k = [...kingdoms][this.rng.int(kingdoms.size)]!;
      const child = this.newCulture(cu.race, members[0]!.id, cu.id);
      for (const c of members) if (c.kingdom === k) c.culture = child.id;
      this.sim.emit({ kind: 'cultureSplit', text: 'ev.cultureSplit', args: { culture: cu.name, child: child.name } });
      this.sim.markZonesDirty();
    }
  }

  cultureTrait(cultureId: number, t: string): boolean {
    return this.cultures[cultureId]?.traits.includes(t) ?? false;
  }

  tenet(religionId: number, t: string): boolean {
    return this.religions[religionId]?.tenets.includes(t) ?? false;
  }

  unitBonus(i: number, kind: 'dmg' | 'armor' | 'heal' | 'fireRes' | 'swim' | 'speed'): number {
    const e = this.sim.creatures.e;
    const r = e.religion[i]!;
    if (r < 0) return 0;
    switch (kind) {
      case 'dmg':
        return this.tenet(r, 'war') ? 0.15 : 0;
      case 'armor':
        return this.tenet(r, 'sun') ? 0.2 : 0;
      case 'heal':
        return this.tenet(r, 'nature') || this.tenet(r, 'peace') ? 1 : 0;
      case 'fireRes':
        return this.tenet(r, 'fire') ? 0.6 : 0;
      case 'swim':
        return this.tenet(r, 'sea') ? 1 : 0;
      case 'speed':
        return this.tenet(r, 'sky') ? 0.1 : 0;
    }
  }

  relationBonus(a: number, b: number): number {
    const sim = this.sim;
    const ka = sim.kingdomSys.get(a);
    const kb = sim.kingdomSys.get(b);
    if (!ka || !kb) return 0;
    const ca = sim.cities.city(ka.capital);
    const cb = sim.cities.city(kb.capital);
    if (!ca || !cb) return 0;
    let v = 0;
    if (ca.culture >= 0 && ca.culture === cb.culture) v += 0.4;
    else if (this.cultureTrait(ca.culture, 'xenophobic') || this.cultureTrait(cb.culture, 'xenophobic')) v -= 0.5;
    else if (this.cultureTrait(ca.culture, 'tolerant') || this.cultureTrait(cb.culture, 'tolerant')) v += 0.2;
    if (ca.religion >= 0 && ca.religion === cb.religion) v += 0.5;
    else if (ca.religion >= 0 && cb.religion >= 0) {
      const related = this.religions[ca.religion]?.parent === cb.religion || this.religions[cb.religion]?.parent === ca.religion;
      v -= related ? 0.6 : 0.3;
      if (this.tenet(ca.religion, 'war') || this.tenet(cb.religion, 'war')) v -= 0.3;
    }
    return v;
  }

  onPrayer(c: City): void {
    const r = this.religions[c.religion];
    if (r) r.faith = Math.min(1000, r.faith + 0.5);
    c.happiness = Math.min(1, c.happiness + 0.01);
    if (this.tenet(c.religion, 'harvest')) c.store.add('food', 1, 'blessing');
    if (this.tenet(c.religion, 'wisdom')) c.store.add('knowledge', 0.5, 'revelation');
  }

  edit(kind: string, id: number, data: Record<string, unknown>): void {
    const str = (v: unknown, max = 24) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
    const col = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number') ? (v.map((x) => Math.max(0, Math.min(255, Math.round(x)))) as [number, number, number]) : undefined);
    if (kind === 'culture') {
      const c = this.cultures[id];
      if (!c) return;
      c.name = str(data.name) || c.name;
      c.color = col(data.color) ?? c.color;
      if (Array.isArray(data.traits)) c.traits = data.traits.filter((t): t is string => typeof t === 'string' && (CULTURE_TRAITS as readonly string[]).includes(t)).slice(0, 4);
    } else if (kind === 'religion') {
      const r = this.religions[id];
      if (!r) return;
      r.name = str(data.name) || r.name;
      r.deity = str(data.deity) || r.deity;
      r.color = col(data.color) ?? r.color;
      if (Array.isArray(data.tenets)) r.tenets = data.tenets.filter((t): t is string => typeof t === 'string' && (TENETS as readonly string[]).includes(t)).slice(0, 4);
    } else if (kind === 'language') {
      const l = this.languages[id];
      if (!l) return;
      l.name = str(data.name) || l.name;
      const letters = (v: unknown, allowed: readonly string[]) => (typeof v === 'string' ? v.split(/[\s,]+/).filter((x) => allowed.includes(x)) : []);
      const cons = letters(data.consonants, CONS);
      const vows = letters(data.vowels, VOWS);
      if (cons.length >= 3) l.consonants = cons;
      if (vows.length >= 2) l.vowels = vows;
    }
    this.sim.lutDirty = true;
    this.sim.markZonesDirty();
  }

  writeLut(lut: Uint8Array): void {
    for (const c of this.cultures) lutSet(lut, LUT_CULTURE, (c.id % 254) + 1, c.color);
    for (const r of this.religions) lutSet(lut, LUT_RELIGION, (r.id % 254) + 1, r.color);
  }

  zoneLayer(mode: number): Uint8Array {
    const map = new Uint8Array(65536);
    for (const c of this.sim.cities.cities) {
      if (!c.alive) continue;
      const v = mode === 2 ? c.culture : c.religion;
      map[c.id + 1] = v >= 0 ? (v % 254) + 1 : 0;
    }
    return map;
  }

  sample(langId: number): string[] {
    const out: string[] = [];
    for (let k = 0; k < 6; k++) out.push(this.langName(langId, 1000 + k * 7919, k % 2 ? 'place' : 'person'));
    return out;
  }

  info(kind: 'culture' | 'religion', id: number): unknown {
    const sim = this.sim;
    if (kind === 'culture') {
      const c = this.cultures[id];
      if (!c) return null;
      const l = this.languages[c.language]!;
      return { ...c, raceKey: SPECIES[c.race]!.key, parentName: this.cultures[c.parent]?.name ?? '', language: { ...l, sample: this.sample(l.id) }, cityNames: sim.cities.cities.filter((x) => x.alive && x.culture === c.id).map((x) => x.name) };
    }
    const r = this.religions[id];
    if (!r) return null;
    return { ...r, holyCityName: sim.cities.cities[r.holyCity]?.name ?? '', parentName: this.religions[r.parent]?.name ?? '', cityNames: sim.cities.cities.filter((x) => x.alive && x.religion === r.id).map((x) => x.name) };
  }

  list(): unknown {
    return {
      cultures: this.cultures.filter((c) => c.alive).map((c) => ({ id: c.id, name: c.name, color: c.color, members: c.members, cities: c.cities, traits: c.traits })),
      religions: this.religions.filter((r) => r.alive).map((r) => ({ id: r.id, name: r.name, color: r.color, followers: r.followers, cities: r.cities, tenets: r.tenets, deity: r.deity })),
    };
  }

  save(w: SaveWriter): void {
    w.json('BELF', { languages: this.languages, cultures: this.cultures, religions: this.religions, rng: Array.from(this.rng.getState()), raceCulture: [...this.raceCulture] });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ languages: Language[]; cultures: Culture[]; religions: Religion[]; rng: number[]; raceCulture: [number, number][] } | null>('BELF', null);
    if (!m) return;
    this.languages = m.languages;
    this.cultures = m.cultures;
    this.religions = m.religions;
    this.rng.setState(m.rng);
    this.raceCulture = new Map(m.raceCulture);
  }

  hash(): number {
    let h = this.cultures.length * 131 + this.religions.length * 17 + this.languages.length;
    for (const c of this.sim.cities.cities) h = (Math.imul(h, 31) + c.culture * 7 + c.religion) | 0;
    return h >>> 0;
  }
}
