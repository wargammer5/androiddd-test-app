import { Simulation, TICKS_PER_YEAR } from '@sotv/sim';
const years = Number(process.argv[2] ?? 4);
const sim = new Simulation({ seed: process.argv[3] ?? 'cities', size: 'medium' });
const t0 = performance.now();
for (let y = 0; y < years; y++) {
  for (let t = 0; t < TICKS_PER_YEAR; t++) sim.step();
  const st = sim.stats(0);
  console.log(`year ${y + 1}: pop ${st.population} creatures ${st.creatures} cities ${st.cities} | ` + sim.cities.cities.filter((c) => c.alive).map((c) => `${c.name}[${c.race}] p${c.pop}/h${c.housing} b${c.buildings.filter((b) => b.done).length}+${c.buildings.filter((b) => !b.done).length} era${c.era} f${Math.floor(c.store.get('food'))} w${Math.floor(c.store.get('wood'))} s${Math.floor(c.store.get('stone'))} k${Math.floor(c.store.get('knowledge'))} t${c.techs.length}${c.stall ? ' STALL:' + c.stall : ''} errs${c.store.check().length}`).join(' ; '));
}
console.log('ms/tick', ((performance.now() - t0) / (years * TICKS_PER_YEAR)).toFixed(2));
const jobs = new Array(14).fill(0);
const e = sim.creatures.e;
for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] >= 0) jobs[e.job[i]]++;
console.log('jobs', jobs.join(' '));
const tasks = new Array(22).fill(0);
for (let i = 0; i < e.high; i++) if (e.alive[i] && e.city[i] >= 0) tasks[e.task[i]]++;
console.log('tasks', tasks.join(' '));
