import { Simulation } from '@sotv/sim';
const sim = new Simulation({ seed: 'bench-large-world', size: (process.argv[2] as 'large') ?? 'large' });
const acc: Record<string, number> = {};
for (const s of sim.systems) {
  const orig = s.step.bind(s);
  s.step = (x) => { const t = performance.now(); orig(x); acc[s.name] = (acc[s.name] ?? 0) + performance.now() - t; };
}
for (let i = 0; i < 600; i++) sim.step();
for (const k in acc) acc[k] = 0;
const n0 = sim.creatures.pf.searches;
for (let i = 0; i < 300; i++) sim.step();
console.log(Object.entries(acc).map(([k, v]) => `${k}=${(v / 300).toFixed(2)}ms`).join(' '), 'searches/tick', ((sim.creatures.pf.searches - n0) / 300).toFixed(1), 'ents', sim.creatures.e.count, 'active', sim.substances.activeCount);
console.log('goTo by task', Array.from(sim.creatures.pathStats).map((v, k) => (v ? `${k}:${v}` : '')).filter(Boolean).join(' '));
