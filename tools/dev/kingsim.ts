import { Simulation, TICKS_PER_YEAR } from '@sotv/sim';
const years = Number(process.argv[2] ?? 10);
const sim = new Simulation({ seed: process.argv[3] ?? 'kings', size: (process.argv[4] as 'medium') ?? 'medium' });
const evCount: Record<string, number> = {};
const t0 = performance.now();
for (let y = 0; y < years; y++) {
  for (let t = 0; t < TICKS_PER_YEAR; t++) {
    sim.step();
    for (const e of sim.drainEvents()) evCount[e.kind] = (evCount[e.kind] ?? 0) + 1;
  }
  const ks = sim.kingdomSys.kingdoms.filter((k) => k.alive);
  console.log('  deaths', JSON.stringify(sim.creatures.deathStats));
  for (const k in sim.creatures.deathStats) delete sim.creatures.deathStats[k];
  console.log(`y${y + 1} pop ${sim.stats(0).population} cities ${sim.stats(0).cities} kingdoms ${ks.length} exp ${sim.kingdomSys.expeditions.length} | ` + ks.map((k) => `${k.name}: c${k.cities.length} p${k.pop} a${k.army} $${k.treasury.toFixed(0)} r:${k.rulerName}`).join(' ; '));
}
console.log('events', JSON.stringify(evCount));
const d = sim.diplomacy.info() as { wars: unknown[]; plots: unknown[]; alliances: unknown[]; routes: unknown[]; clans: unknown[] };
console.log('wars', JSON.stringify(d.wars.slice(0, 4)));
console.log('alliances', d.alliances.length, 'routes', d.routes.length, 'plots', JSON.stringify(d.plots), 'clans', d.clans.length);
console.log('ms/tick', ((performance.now() - t0) / (years * TICKS_PER_YEAR)).toFixed(2));
