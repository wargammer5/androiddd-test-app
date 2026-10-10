import { species as SPECIES } from '@sotv/content';
import type { Simulation, System } from './sim.ts';
import type { SaveReader, SaveWriter } from './save.ts';
import type { SimEvent } from './protocol.ts';
import { TICKS_PER_PULSE } from './time.ts';

export interface Sample {
  tick: number;
  pop: number;
  creatures: number;
  cities: number;
  kingdoms: number;
  wars: number;
  plants: number;
  species: number[];
  kingdomPop: Record<string, number>;
  religion: Record<string, number>;
  culture: Record<string, number>;
}

export class Chronicle implements System {
  readonly name = 'chronicle';
  samples: Sample[] = [];
  entries: SimEvent[] = [];
  readonly max = 360;

  constructor(private sim: Simulation) {}

  record(e: SimEvent): void {
    if (!e.important) return;
    this.entries.push(e);
    if (this.entries.length > 600) this.entries.splice(0, this.entries.length - 600);
  }

  step(sim: Simulation): void {
    if (sim.tick % (TICKS_PER_PULSE / 2) !== 0) return;
    if (sim.layerMode === 2 || sim.layerMode === 3 || sim.layerMode === 6) sim.setLayer(sim.layerMode, false);
    const cr = sim.creatures;
    let pop = 0;
    for (const d of SPECIES) if (d.kind === 'civ') pop += cr.speciesCount[d.id]!;
    const kp: Record<string, number> = {};
    const top = sim.kingdomSys.kingdoms.filter((k) => k.alive).sort((a, b) => b.pop - a.pop).slice(0, 8);
    for (const k of top) kp[k.name] = k.pop;
    const rel: Record<string, number> = {};
    for (const r of sim.beliefs.religions.filter((x) => x.alive).sort((a, b) => b.followers - a.followers).slice(0, 6)) rel[r.name] = r.followers;
    const cul: Record<string, number> = {};
    for (const c of sim.beliefs.cultures.filter((x) => x.alive).sort((a, b) => b.members - a.members).slice(0, 6)) cul[c.name] = c.members;
    let plants = 0;
    const w = sim.world;
    const step = Math.max(1, Math.floor(w.n / 8192));
    for (let i = 0; i < w.n; i += step) {
      const o = w.obj[i]!;
      if (o >= 1 && o <= 54) plants++;
    }
    this.samples.push({
      tick: sim.tick,
      pop,
      creatures: cr.e.count,
      cities: sim.cities.cities.filter((c) => c.alive).length,
      kingdoms: sim.kingdomSys.kingdoms.filter((k) => k.alive).length,
      wars: sim.diplomacy.activeWars().length,
      plants: plants * step,
      species: Array.from(cr.speciesCount.slice(0, SPECIES.length)),
      kingdomPop: kp,
      religion: rel,
      culture: cul,
    });
    if (this.samples.length > this.max) {
      const keep: Sample[] = [];
      for (let k = 0; k < this.samples.length; k += 2) keep.push(this.samples[k]!);
      this.samples = keep;
    }
  }

  info(): unknown {
    return { samples: this.samples, entries: this.entries.slice(-300), species: SPECIES.map((s) => ({ key: s.key, kind: s.kind })) };
  }

  save(w: SaveWriter): void {
    w.json('CHRN', { samples: this.samples, entries: this.entries });
  }

  load(r: SaveReader): void {
    const m = r.jsonOr<{ samples: Sample[]; entries: SimEvent[] } | null>('CHRN', null);
    if (!m) return;
    this.samples = m.samples;
    this.entries = m.entries;
  }
}
