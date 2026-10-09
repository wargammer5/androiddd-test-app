import { species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import type { City } from './cities.ts';
import { Rng } from './rng.ts';
import { placeName } from './names.ts';
import { LUT_KINGDOM, LUT_UNIT, lutSet } from './palette.ts';

export interface Kingdom {
  id: number;
  name: string;
  race: number;
  color: [number, number, number];
  color2: [number, number, number];
  symbol: number;
  capital: number;
  cities: number[];
  alive: boolean;
  founded: number;
  ruler: number;
  rulerName: string;
  treasury: number;
  extra: Record<string, number>;
}

export function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export class KingdomSystem implements System {
  readonly name = 'kingdoms';
  kingdoms: Kingdom[] = [];
  protected rng: Rng;

  constructor(protected sim: Simulation) {
    this.rng = sim.rng.fork(321);
  }

  get(id: number): Kingdom | null {
    const k = this.kingdoms[id];
    return k && k.alive ? k : null;
  }

  create(city: City): Kingdom {
    const id = this.kingdoms.length;
    const hue = (id * 0.61803398875 + this.rng.float() * 0.1) % 1;
    const k: Kingdom = {
      id,
      name: placeName(this.rng.nextU32(), city.race),
      race: city.race,
      color: hsl(hue, 0.65, 0.5),
      color2: hsl((hue + 0.5) % 1, 0.5, 0.75),
      symbol: this.rng.int(16),
      capital: city.id,
      cities: [city.id],
      alive: true,
      founded: this.sim.tick,
      ruler: -1,
      rulerName: '',
      treasury: 0,
      extra: {},
    };
    this.kingdoms.push(k);
    this.assignCity(city, k);
    return k;
  }

  assignCity(city: City, k: Kingdom): void {
    const old = this.get(city.kingdom);
    if (old && old !== k) {
      old.cities = old.cities.filter((c) => c !== city.id);
      if (old.capital === city.id) old.capital = old.cities[0] ?? -1;
      if (old.cities.length === 0) this.fall(old);
    }
    city.kingdom = k.id;
    if (!k.cities.includes(city.id)) k.cities.push(city.id);
    if (k.capital < 0) k.capital = city.id;
    const w = this.sim.world;
    w.kingdomOfZone[city.id + 1] = (k.id % 255) + 1;
    const e = this.sim.creatures.e;
    for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] === city.id) e.kingdom[i] = k.id;
    for (let i = 0; i < w.n; i++) if (w.zone[i] === city.id + 1) w.touchVisual(i);
    this.sim.lutDirty = true;
  }

  fall(k: Kingdom): void {
    k.alive = false;
    this.sim.emit({ kind: 'kingdomFell', text: 'ev.kingdomFell', args: { kingdom: k.name }, important: true });
  }

  writeLut(lut: Uint8Array): void {
    for (const k of this.kingdoms) {
      const idx = (k.id % 255) + 1;
      lutSet(lut, LUT_KINGDOM, idx, k.color);
      lutSet(lut, LUT_UNIT, idx, k.color);
    }
  }

  step(_sim: Simulation): void {}

  info(id: number): unknown {
    const k = this.get(id) ?? this.kingdoms[id];
    if (!k) return null;
    return { ...k, raceKey: SPECIES[k.race]!.key, cityNames: k.cities.map((c) => this.sim.cities.cities[c]?.name ?? '?') };
  }

  save(w: SaveWriter): void {
    w.json('KING', { kingdoms: this.kingdoms, rng: Array.from(this.rng.getState()) });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ kingdoms: Kingdom[]; rng: number[] } | null>('KING', null);
    if (!m) return;
    this.kingdoms = m.kingdoms;
    this.rng.setState(m.rng);
    const w = this.sim.world;
    for (const c of this.sim.cities.cities) if (c.kingdom >= 0) w.kingdomOfZone[c.id + 1] = (c.kingdom % 255) + 1;
  }
}
