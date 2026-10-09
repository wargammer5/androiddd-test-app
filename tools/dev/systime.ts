import { Simulation, TICKS_PER_YEAR } from '@sotv/sim';
const sim = new Simulation({ seed: process.argv[3] ?? 'cities', size: (process.argv[2] as 'medium') ?? 'medium' });
const warm = Number(process.argv[4] ?? 3) * TICKS_PER_YEAR;
for (let i = 0; i < warm; i++) sim.step();
const acc: Record<string, number> = {};
for (const s of sim.systems) {
  const orig = s.step.bind(s);
  s.step = (x) => { const t = performance.now(); orig(x); acc[s.name] = (acc[s.name] ?? 0) + performance.now() - t; };
}
const n0 = sim.creatures.pf.searches;
const T = 600;
for (let i = 0; i < T; i++) sim.step();
console.log(Object.entries(acc).map(([k, v]) => `${k}=${(v / T).toFixed(2)}ms`).join(' '), 'searches/tick', ((sim.creatures.pf.searches - n0) / T).toFixed(1), 'ents', sim.creatures.e.count, 'pop', sim.stats(0).population);
