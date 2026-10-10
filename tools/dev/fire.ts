import { Simulation, TICKS_PER_YEAR, fuelOf } from '@sotv/sim';
const sim = new Simulation({ seed: 'kings', size: 'medium' });
const w = sim.world;
for (let y = 0; y < 16; y++) {
  for (let i = 0; i < TICKS_PER_YEAR; i++) sim.step();
  const fv = new Int32Array(16); const byMat = new Int32Array(8); let fuel0 = 0; const byObj: Record<number, number> = {};
  for (let i = 0; i < w.n; i++) { const f = w.fire[i]!; if (!f) continue; fv[f]!++; byMat[w.mat[i]!]!++; if (fuelOf(w, i) === 0) fuel0++; byObj[w.obj[i]!] = (byObj[w.obj[i]!] ?? 0) + 1; }
  console.log('y' + (y + 1), 'fire', Array.from(fv).join(','), 'mat', Array.from(byMat).join(','), 'fuel0', fuel0, 'obj', JSON.stringify(byObj).slice(0, 120), 'active', sim.substances.activeCount);
}
