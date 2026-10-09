import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '@sotv/sim';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(here, 'baseline.json');
const update = process.argv.includes('--update');

interface Scenario {
  name: string;
  size: 'small' | 'medium' | 'large' | 'huge';
  warm: number;
  ticks: number;
}

const scenarios: Scenario[] = [
  { name: 'large-world', size: 'large', warm: 600, ticks: 300 },
  { name: 'medium-world', size: 'medium', warm: 600, ticks: 300 },
];

function runOnce(s: Scenario): { msPerTick: number; entities: number; maxMs: number } {
  const sim = new Simulation({ seed: 'bench-' + s.name, size: s.size });
  for (let i = 0; i < s.warm; i++) sim.step();
  let maxMs = 0;
  const t0 = performance.now();
  for (let i = 0; i < s.ticks; i++) {
    const a = performance.now();
    sim.step();
    maxMs = Math.max(maxMs, performance.now() - a);
  }
  const ms = (performance.now() - t0) / s.ticks;
  return { msPerTick: ms, entities: sim.stats(0).creatures, maxMs };
}

const results: Record<string, { msPerTick: number; entities: number; maxMs: number }> = {};
for (const s of scenarios) {
  let best = { msPerTick: Infinity, entities: 0, maxMs: 0 };
  for (let r = 0; r < 3; r++) {
    const res = runOnce(s);
    if (res.msPerTick < best.msPerTick) best = res;
  }
  results[s.name] = best;
  console.log(`${s.name}: ${best.msPerTick.toFixed(3)} ms/tick (max ${best.maxMs.toFixed(2)} ms), entities ${best.entities}`);
}

const baseline = existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, { msPerTick: number }>) : {};
let failed = false;
for (const [k, r] of Object.entries(results)) {
  const b = baseline[k];
  if (!b || update || b.msPerTick < 0.05) continue;
  const ratio = r.msPerTick / b.msPerTick;
  const flag = ratio > 1.15 ? 'REGRESSION' : 'ok';
  console.log(`  ${k}: ${(ratio * 100).toFixed(0)}% of baseline ${b.msPerTick.toFixed(3)} ms -> ${flag}`);
  if (ratio > 1.15) failed = true;
}
const budget = Object.values(results).every((r) => r.msPerTick <= 8);
console.log(`tick budget 8 ms: ${budget ? 'met' : 'NOT met'}`);
if (update || Object.keys(baseline).length === 0 || Object.keys(results).some((k) => !baseline[k])) {
  writeFileSync(baselinePath, JSON.stringify({ ...baseline, ...results }, null, 2) + '\n');
  console.log('baseline updated');
}
writeFileSync(path.join(here, 'last.json'), JSON.stringify(results, null, 2) + '\n');
if (failed || !budget) process.exit(1);
