import { writeFileSync } from 'node:fs';
import { Simulation, type WorldSizeKey } from '@sotv/sim';
import { encodePng } from '../lib/png.mjs';

const seeds = (process.argv[2] ?? 'a,b,c').split(',');
const size = (process.argv[3] ?? 'medium') as WorldSizeKey;
const ticks = Number(process.argv[4] ?? 0);
const out = process.argv[5] ?? 'map';
for (const seed of seeds) {
  const sim = new Simulation({ seed, size });
  for (let i = 0; i < ticks; i++) sim.step();
  const m = sim.minimap(true)!;
  writeFileSync(`${out}-${seed}.png`, encodePng(m.w, m.h, m.data));
  console.log(seed, sim.stats(0));
}
