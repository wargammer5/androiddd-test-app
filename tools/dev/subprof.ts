import { Simulation } from '@sotv/sim';
const sim = new Simulation({ seed: 'bench-large-substances', size: 'large' });
const w = sim.world.w;
let stroke = 1;
for (let k = 0; k < 12; k++) {
  const x = ((k * 97) % 10) * (w / 10) + w / 20;
  const y = ((k * 53) % 10) * (w / 10) + w / 20;
  sim.enqueue({ t: 'power', power: k % 3 === 0 ? 'lava' : k % 3 === 1 ? 'water' : 'fire', x, y, radius: 8, shape: 'circle', stroke: stroke++ });
}
for (let i = 0; i < 420; i++) {
  sim.step();
  if (i % 60 === 0) {
    let fire = 0, lava = 0;
    for (let j = 0; j < sim.world.n; j++) { if (sim.world.fire[j]) fire++; if (sim.world.mat[j] === 2) lava++; }
    console.log(i, 'active', sim.substances.activeCount, 'fire', fire, 'lava', lava);
  }
}
