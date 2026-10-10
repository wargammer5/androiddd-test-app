import { Simulation, TICKS_PER_YEAR, TICKS_PER_DAY } from '@sotv/sim';
const sim = new Simulation({ seed: 'cities', size: 'medium' });
for (let i = 0; i < 2 * TICKS_PER_YEAR + TICKS_PER_DAY / 2; i++) sim.step();
const e = sim.creatures.e;
const w = sim.world;
const job = Number(process.argv[2] ?? 3);
for (let k = 0; k < 6; k++) {
  for (let i = 0; i < 30; i++) sim.step();
  const rows: string[] = [];
  for (let i = 0; i < e.high; i++) {
    if (!e.alive[i] || e.job[i] !== job) continue;
    const t = e.taskTarget[i]!;
    rows.push(`#${i} task${e.task[i]} ph${e.phase[i]} tgt${t >= 0 ? `${t % w.w},${Math.floor(t / w.w)} obj${w.obj[t]} b${w.biome[t]}` : t} at ${e.x[i]!.toFixed(0)},${e.y[i]!.toFixed(0)} carry${e.carry[i]}x${e.carryAmt[i]} wt${e.workTimer[i]} path${sim.creatures.paths[i]?.length ?? -1}/${sim.creatures.pathPos[i]}`);
  }
  console.log(`--- t${sim.tick}\n` + rows.slice(0, 8).join('\n'));
}
