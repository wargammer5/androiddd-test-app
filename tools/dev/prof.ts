import { Simulation } from '@sotv/sim';
const sim = new Simulation({ seed: 'bench-large-world', size: 'large' });
for (let i = 0; i < 300; i++) sim.step();
const t0 = performance.now();
let nodes = 0, searches0 = sim.creatures.pf.searches;
for (let i = 0; i < 300; i++) { sim.step(); nodes += sim.creatures.pf.nodesThisTick; }
console.log('ms/tick', ((performance.now() - t0) / 300).toFixed(2), 'ents', sim.creatures.e.count, 'nodes/tick', (nodes / 300).toFixed(0), 'searches/tick', ((sim.creatures.pf.searches - searches0) / 300).toFixed(1), 'activeChunks', sim.substances.activeCount);
console.log('goTo by task', Array.from(sim.creatures.pathStats).map((v, k) => (v ? `${k}:${v}` : '')).filter(Boolean).join(' '));
const tasks = new Int32Array(32);
for (let i = 0; i < sim.creatures.e.high; i++) if (sim.creatures.e.alive[i]) tasks[sim.creatures.e.task[i]!]!++;
console.log('tasks now', Array.from(tasks).map((v, k) => (v ? `${k}:${v}` : '')).filter(Boolean).join(' '));
