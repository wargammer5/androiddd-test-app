import { Simulation, TICKS_PER_YEAR, TICKS_PER_DAY } from '@sotv/sim';
const sim = new Simulation({ seed: 'kings', size: 'medium' });
const w = sim.world;
const e = sim.creatures.e;
for (let i = 0; i < 12 * TICKS_PER_YEAR; i++) sim.step();
const ops = [...sim.diplomacy.relations.values()].map((r) => Math.round(r.opinion)).sort((a, b) => a - b);
console.log('opinions', ops.join(' '));
for (let d = 0; d < 30; d++) {
  for (let i = 0; i < TICKS_PER_DAY / 2; i++) sim.step();
  for (const war of sim.diplomacy.activeWars()) {
    const g = sim.cities.city(war.goal);
    if (!g) continue;
    const gx = g.center % w.w, gy = Math.floor(g.center / w.w);
    let near7 = 0, near20 = 0, warriors = 0, warTask = new Int32Array(22);
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i] || !war.attackers.includes(e.kingdom[i]!)) continue;
      if (e.job[i] === 11) { warriors++; warTask[e.task[i]!]!++; }
      const dd = Math.hypot(e.x[i]! - gx, e.y[i]! - gy);
      if (dd < 7) near7++;
      if (dd < 20) near20++;
    }
    console.log(`d${d} war${war.id} goal ${g.name} siege${war.siege} warriors${warriors} near7 ${near7} near20 ${near20} cas ${war.casualties} tasks ${Array.from(warTask).map((v, k) => (v ? k + ':' + v : '')).filter(Boolean).join(' ')}`);
  }
}
