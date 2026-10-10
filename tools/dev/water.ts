import { Simulation, TICKS_PER_YEAR, SEA_LEVEL } from '@sotv/sim';
const sim = new Simulation({ seed: 'kings', size: 'medium' });
const w = sim.world;
for (let i = 0; i < Number(process.argv[2] ?? 6) * TICKS_PER_YEAR; i++) sim.step();
const d0 = w.depth.slice(); const m0 = w.mat.slice();
for (let i = 0; i < 24; i++) sim.step();
let changed = 0, sea = 0, below = 0, land = 0, ice = 0, snow = 0;
const samples: string[] = [];
for (let i = 0; i < w.n; i++) {
  if (d0[i] === w.depth[i] && m0[i] === w.mat[i]) continue;
  changed++;
  if (w.biome[i] === 0) sea++; else land++;
  if (w.height[i]! < SEA_LEVEL) below++;
  if (w.mat[i] === 5 || m0[i] === 5) ice++;
  if (w.mat[i] === 4 || m0[i] === 4) snow++;
  if (samples.length < 12 && Math.random() < 0.01) samples.push(`${i % w.w},${Math.floor(i / w.w)} b${w.biome[i]} h${w.height[i]} m${m0[i]}->${w.mat[i]} d${d0[i]}->${w.depth[i]} t${w.heat[i]!.toFixed(0)}`);
}
console.log({ changed, sea, below, land, ice, snow, active: sim.substances.activeCount });
console.log(samples.join('\n'));
