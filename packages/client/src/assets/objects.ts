import type { AtlasPainter, RGB } from './atlas.ts';
import { shade } from './atlas.ts';

export const OBJ_TILE_BASE = 128;
export const BUILDING_TILE_BASE = 256;
export const MISC_TILE_BASE = 448;

const PLANT_TYPES = 9;
const STAGES = 6;

const K: RGB = [255, 0, 255];

interface PlantStyle {
  leaf: RGB;
  trunk: RGB;
  fruit: RGB;
}

const STYLES: PlantStyle[] = [
  { leaf: [62, 128, 52], trunk: [104, 72, 44], fruit: [200, 60, 50] },
  { leaf: [36, 92, 64], trunk: [92, 62, 40], fruit: [140, 100, 60] },
  { leaf: [96, 160, 64], trunk: [150, 116, 70], fruit: [130, 80, 40] },
  { leaf: [34, 112, 44], trunk: [86, 60, 36], fruit: [240, 180, 40] },
  { leaf: [94, 150, 80], trunk: [94, 150, 80], fruit: [230, 90, 140] },
  { leaf: [70, 130, 60], trunk: [70, 110, 50], fruit: [120, 60, 200] },
  { leaf: [90, 160, 70], trunk: [80, 140, 60], fruit: [240, 220, 80] },
  { leaf: [190, 170, 140], trunk: [220, 210, 190], fruit: [200, 50, 50] },
  { leaf: [160, 120, 230], trunk: [110, 80, 170], fruit: [240, 220, 255] },
];

function plant(p: AtlasPainter, t: number, type: number, stage: number): void {
  const s = STYLES[type]!;
  const leaf = stage === 5 ? shade(s.leaf, 0.75) : s.leaf;
  const dark = shade(leaf, 0.72);
  const light = shade(leaf, 1.25);
  if (stage === 0) {
    p.set(t, 3, 5, [120, 90, 50]);
    p.set(t, 4, 5, [140, 105, 60]);
    return;
  }
  if (stage === 1) {
    p.set(t, 4, 6, s.trunk);
    p.set(t, 3, 5, leaf);
    p.set(t, 4, 4, light);
    p.set(t, 5, 5, leaf);
    return;
  }
  const big = stage >= 3;
  switch (type) {
    case 4: {
      p.rect(t, 3, big ? 1 : 3, 2, big ? 6 : 4, leaf);
      p.set(t, 3, big ? 1 : 3, light);
      if (big) {
        p.rect(t, 1, 3, 2, 1, leaf);
        p.set(t, 1, 2, leaf);
        p.rect(t, 5, 4, 2, 1, leaf);
        p.set(t, 6, 3, leaf);
      }
      if (stage === 4) p.set(t, 4, 0, s.fruit);
      return;
    }
    case 5:
    case 6:
    case 7: {
      const r = big ? 3 : 2;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const d = Math.hypot(x - 3.5, y - 4.5);
          if (d < r) p.set(t, x, y, type === 7 ? (y < 4 ? s.leaf : s.trunk) : d < r - 1 ? leaf : dark);
        }
      if (type === 6) {
        p.set(t, 2, 3, s.fruit);
        p.set(t, 5, 4, s.fruit);
        if (big) p.set(t, 4, 2, [240, 240, 240]);
      }
      if (stage === 4) {
        p.set(t, 2, 4, s.fruit);
        p.set(t, 5, 3, s.fruit);
        p.set(t, 4, 6, s.fruit);
      }
      return;
    }
    case 8: {
      p.rect(t, 3, big ? 1 : 3, 2, big ? 6 : 4, leaf);
      p.set(t, 2, 4, light);
      p.set(t, 5, 3, light);
      p.set(t, 3, big ? 1 : 3, s.fruit);
      if (big) {
        p.rect(t, 1, 3, 1, 3, dark);
        p.rect(t, 6, 2, 1, 3, dark);
      }
      return;
    }
  }
  p.rect(t, 3, 5, 2, 3, s.trunk);
  if (type === 2) {
    p.rect(t, 3, 2, 2, 6, s.trunk);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [5, 1],
      [6, 1],
      [0, 2],
      [7, 2],
      [3, 0],
      [4, 0],
      [2, 2],
      [5, 2],
    ] as const)
      p.set(t, x, y, leaf);
    if (stage === 4) {
      p.set(t, 3, 2, s.fruit);
      p.set(t, 4, 2, s.fruit);
    }
    return;
  }
  const r = big ? 3.6 : 2.6;
  const cy = big ? 3 : 3.5;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 8; x++) {
      let d: number;
      if (type === 1) {
        const width = (y + 1) * (big ? 0.55 : 0.45);
        d = Math.abs(x - 3.5) <= width && y <= (big ? 6 : 5) ? 0 : 99;
      } else d = Math.hypot(x - 3.5, y - cy);
      if (d < r) p.set(t, x, y, d < r * 0.5 && x < 4 && y < cy ? light : (x + y) % 3 === 0 ? dark : leaf);
    }
  if (stage === 4) {
    p.set(t, 2, 2, s.fruit);
    p.set(t, 5, 3, s.fruit);
    p.set(t, 3, 5, s.fruit);
  }
  if (stage === 5) {
    p.set(t, 1, 2, [120, 100, 60]);
    p.set(t, 6, 4, [120, 100, 60]);
  }
}

function rock(p: AtlasPainter, t: number, base: RGB, spot?: RGB): void {
  for (let y = 2; y < 8; y++)
    for (let x = 1; x < 7; x++) {
      const d = Math.hypot(x - 3.5, (y - 5) * 1.2);
      if (d < 3) p.set(t, x, y, d < 1.5 && y < 5 ? shade(base, 1.2) : y > 5 ? shade(base, 0.75) : base);
    }
  if (spot) {
    p.set(t, 2, 4, spot);
    p.set(t, 4, 5, spot);
    p.set(t, 5, 3, spot);
  }
}

function building(p: AtlasPainter, t: number, type: number, race: number, era: number): void {
  const walls: RGB[][] = [
    [
      [170, 130, 90],
      [176, 140, 100],
      [190, 170, 140],
      [200, 200, 205],
    ],
    [
      [120, 90, 60],
      [130, 100, 70],
      [150, 130, 110],
      [170, 170, 175],
    ],
    [
      [200, 190, 150],
      [210, 200, 160],
      [225, 220, 200],
      [235, 235, 240],
    ],
    [
      [90, 110, 80],
      [100, 120, 90],
      [120, 130, 110],
      [140, 150, 150],
    ],
  ];
  const wall = walls[race]![era]!;
  const roof: RGB = K;
  const dark: RGB = shade(wall, 0.6);
  const door: RGB = [60, 40, 25];
  switch (type) {
    case 0:
      p.rect(t, 0, 3, 8, 5, wall);
      p.rect(t, 1, 1, 6, 2, roof);
      p.rect(t, 3, 0, 2, 1, roof);
      p.rect(t, 3, 5, 2, 3, door);
      p.set(t, 1, 4, dark);
      p.set(t, 6, 4, dark);
      if (era >= 2) {
        p.set(t, 0, 2, wall);
        p.set(t, 7, 2, wall);
      }
      break;
    case 1:
      p.rect(t, 1, 4, 6, 4, wall);
      for (let y = 0; y < 4; y++) p.rect(t, 3 - y, 1 + y, 2 + y * 2, 1, roof);
      p.rect(t, 3, 6, 2, 2, door);
      if (race === 1) p.rect(t, 1, 3, 6, 1, dark);
      break;
    case 2:
      p.rect(t, 1, 3, 6, 5, shade(wall, 0.85));
      p.rect(t, 1, 2, 6, 1, roof);
      p.rect(t, 2, 4, 4, 1, dark);
      p.rect(t, 2, 6, 4, 1, dark);
      break;
    case 3:
      for (let y = 1; y < 8; y += 2) p.rect(t, 0, y, 8, 1, [150, 120, 60]);
      p.rect(t, 6, 0, 2, 3, wall);
      p.set(t, 6, 0, roof);
      break;
    case 4:
      p.rect(t, 0, 2, 8, 6, shade(wall, 0.8));
      p.rect(t, 0, 1, 8, 1, roof);
      p.rect(t, 2, 4, 1, 3, [160, 160, 170]);
      p.rect(t, 5, 4, 1, 3, [160, 160, 170]);
      break;
    case 5:
      p.rect(t, 2, 2, 4, 6, wall);
      p.rect(t, 3, 0, 2, 2, roof);
      p.set(t, 3, 4, [250, 230, 120]);
      p.set(t, 4, 4, [250, 230, 120]);
      p.rect(t, 3, 6, 2, 2, door);
      break;
    case 6:
      p.rect(t, 1, 3, 6, 5, wall);
      p.rect(t, 0, 2, 8, 1, roof);
      p.rect(t, 2, 4, 1, 1, [180, 220, 255]);
      p.rect(t, 5, 4, 1, 1, [180, 220, 255]);
      break;
    case 7:
      p.rect(t, 1, 3, 6, 5, shade(wall, 0.75));
      p.rect(t, 1, 2, 6, 1, roof);
      p.rect(t, 5, 0, 1, 3, [60, 60, 60]);
      p.set(t, 3, 5, [255, 140, 40]);
      break;
    case 8:
      p.rect(t, 2, 1, 4, 7, shade(wall, 0.9));
      p.rect(t, 1, 0, 6, 1, roof);
      p.set(t, 3, 3, [30, 30, 30]);
      break;
    case 9:
      p.rect(t, 0, 4, 8, 3, [120, 90, 60]);
      p.rect(t, 3, 0, 1, 4, [100, 80, 50]);
      p.rect(t, 4, 1, 3, 2, roof);
      break;
    case 10:
      p.rect(t, 0, 2, 8, 6, shade(wall, 0.8));
      for (let x = 0; x < 8; x += 2) p.set(t, x, 1, shade(wall, 0.8));
      p.rect(t, 0, 2, 8, 1, roof);
      break;
    case 11:
      p.rect(t, 0, 4, 8, 4, wall);
      p.rect(t, 0, 2, 4, 2, roof);
      p.rect(t, 4, 2, 4, 2, [240, 240, 220]);
      p.set(t, 2, 6, [220, 180, 60]);
      p.set(t, 5, 6, [120, 200, 80]);
      break;
  }
}

export function drawObjects(p: AtlasPainter): void {
  for (let type = 0; type < PLANT_TYPES; type++) for (let st = 0; st < STAGES; st++) plant(p, OBJ_TILE_BASE + 1 + type * STAGES + st, type, st);
  const T = (o: number) => (o >= 140 ? MISC_TILE_BASE + o - 140 : OBJ_TILE_BASE + o);
  rock(p, T(60), [130, 128, 124]);
  rock(p, T(61), [120, 110, 105], [190, 120, 90]);
  rock(p, T(62), [125, 118, 100], [250, 210, 60]);
  rock(p, T(63), [110, 105, 120], [120, 230, 240]);
  for (let y = 2; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - 3.5, (y - 6) * 1.1) < 3.6) p.set(T(64), x, y, y > 4 && Math.abs(x - 3.5) < 2 ? [20, 18, 16] : [100, 96, 90]);
  p.rect(T(65), 1, 3, 6, 5, [90, 80, 70]);
  p.rect(T(65), 2, 5, 4, 3, [20, 16, 12]);
  p.rect(T(65), 1, 2, 6, 1, [130, 100, 60]);
  p.rect(T(66), 2, 2, 4, 4, [120, 190, 240]);
  p.set(T(66), 3, 3, [230, 250, 255]);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - 3.5, y - 3.5) < 3.5) p.set(T(67), x, y, Math.hypot(x - 3.5, y - 3.5) < 1.8 ? [255, 140, 30] : [60, 40, 36]);
  p.rect(T(68), 0, 5, 3, 3, [150, 140, 130]);
  p.rect(T(68), 5, 4, 2, 4, [150, 140, 130]);
  p.rect(T(68), 3, 7, 2, 1, [120, 110, 100]);
  p.set(T(69), 2, 4, [230, 225, 210]);
  p.rect(T(69), 3, 4, 3, 1, [230, 225, 210]);
  p.set(T(69), 4, 3, [230, 225, 210]);
  p.set(T(69), 4, 5, [230, 225, 210]);
  for (let f = 0; f < 4; f++) {
    for (let y = 0; y < 8; y += 2) p.rect(T(70 + f), 0, y, 8, 1, [110, 80, 50]);
    if (f >= 1) for (let x = 0; x < 8; x += 2) for (let y = 1; y < 8; y += 2) p.set(T(70 + f), x, y, f === 1 ? [120, 170, 70] : f === 2 ? [100, 160, 50] : [220, 190, 70]);
  }
  p.rect(T(74), 3, 5, 2, 2, [120, 90, 55]);
  p.set(T(74), 3, 5, [170, 140, 100]);
  p.rect(T(75), 3, 3, 2, 5, [40, 32, 28]);
  p.set(T(75), 2, 3, [40, 32, 28]);
  p.set(T(75), 5, 2, [40, 32, 28]);
  for (let i = 0; i < 10; i++) p.set(T(76), (i * 5) % 8, (i * 3) % 8, [70, 66, 64]);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - 3.5, y - 3.5) < 3.8) p.set(T(77), x, y, Math.hypot(x - 3.5, y - 3.5) < 2.5 ? [50, 44, 40] : [90, 80, 72]);
  rock(p, T(78), [70, 60, 70], [255, 120, 40]);
  p.rect(T(79), 3, 0, 2, 8, [30, 28, 40]);
  p.set(T(79), 3, 2, [160, 120, 255]);
  p.set(T(79), 4, 5, [160, 120, 255]);
  p.rect(T(140), 3, 2, 2, 5, [150, 150, 155]);
  p.rect(T(140), 2, 3, 4, 1, [150, 150, 155]);
  p.rect(T(141), 1, 3, 6, 3, [100, 70, 40]);
  p.rect(T(141), 3, 1, 1, 2, [90, 60, 30]);
  p.rect(T(142), 0, 2, 8, 4, [140, 100, 60]);
  for (let x = 0; x < 8; x += 2) p.set(T(142), x, 3, [110, 76, 44]);
  p.rect(T(143), 3, 1, 2, 7, [120, 110, 100]);
  p.rect(T(143), 2, 0, 4, 2, [255, 200, 60]);
  for (let type = 0; type < 12; type++) for (let race = 0; race < 4; race++) for (let era = 0; era < 4; era++) building(p, BUILDING_TILE_BASE + (type * 4 + race) * 4 + era, type, race, era);
}
