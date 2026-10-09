import { Simulation, TICKS_PER_YEAR, CHUNK } from '@sotv/sim';
const sim = new Simulation({ seed: 'cities', size: 'medium' });
for (let i = 0; i < 3 * TICKS_PER_YEAR; i++) sim.step();
const w = sim.world;
let act = 0;
const mats = new Int32Array(8);
let still = 0, fire = 0, hot = 0;
for (let c = 0; c < w.active.length; c++) {
  if (!w.active[c]) continue;
  act++;
  const cx = c % w.cw, cy = Math.floor(c / w.cw);
  for (let y = cy * CHUNK; y < cy * CHUNK + CHUNK; y++) for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
    const i = y * w.w + x;
    mats[w.mat[i]!]!++;
    if (w.still[i]) still++;
    if (w.fire[i]) fire++;
    if (Math.abs(w.heat[i]! - w.baseTemp[i]!) > 1.5) hot++;
  }
}
console.log('active', act, 'of', w.active.length, 'mats', Array.from(mats).join(','), 'still', still, 'fire', fire, 'hot', hot, 'season off', sim.nature.seasonOffset(sim.tick).toFixed(1));
