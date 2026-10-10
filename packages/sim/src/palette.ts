import { biomes } from '@sotv/content';

export function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const LUT_KINGDOM = 0;
export const LUT_CULTURE = 1;
export const LUT_RELIGION = 2;
export const LUT_UNIT = 3;
export const LUT_HEAT = 4;
export const LUT_OBJECT = 6;
export const LUT_BIOME = 7;

export function lutSet(lut: Uint8Array, row: number, idx: number, rgb: readonly number[], a = 255): void {
  const o = (row * 256 + idx) * 4;
  lut[o] = rgb[0]!;
  lut[o + 1] = rgb[1]!;
  lut[o + 2] = rgb[2]!;
  lut[o + 3] = a;
}

export function baseLut(): Uint8Array {
  const lut = new Uint8Array(256 * 8 * 4);
  for (const b of biomes) lutSet(lut, LUT_BIOME, b.id, hexRgb(b.color));
  for (let i = 0; i < 256; i++) lutSet(lut, LUT_UNIT, i, [190, 175, 150]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    lutSet(lut, LUT_HEAT, i, [Math.round(40 + 215 * Math.min(1, t * 1.6)), Math.round(30 + 200 * Math.max(0, t - 0.35) * 1.5), Math.round(90 * (1 - t))]);
  }
  const plantCol = [[50, 110, 45], [30, 85, 55], [90, 150, 60], [30, 100, 40], [90, 150, 80], [70, 130, 60], [120, 170, 80], [190, 170, 140], [160, 120, 230]];
  for (let t = 0; t < 9; t++)
    for (let st = 0; st < 6; st++) lutSet(lut, LUT_OBJECT, 1 + t * 6 + st, plantCol[t]!, st < 2 ? 40 : st < 3 ? 120 : 190);
  for (let o = 60; o <= 63; o++) lutSet(lut, LUT_OBJECT, o, [125, 120, 115], 200);
  lutSet(lut, LUT_OBJECT, 64, [40, 36, 32], 230);
  lutSet(lut, LUT_OBJECT, 65, [60, 50, 40], 230);
  lutSet(lut, LUT_OBJECT, 66, [150, 210, 250], 200);
  lutSet(lut, LUT_OBJECT, 67, [240, 120, 30], 255);
  lutSet(lut, LUT_OBJECT, 68, [150, 140, 130], 200);
  for (let o = 70; o <= 73; o++) lutSet(lut, LUT_OBJECT, o, o === 73 ? [210, 180, 70] : [130, 100, 60], 200);
  for (let o = 74; o <= 79; o++) lutSet(lut, LUT_OBJECT, o, [60, 52, 48], 160);
  for (let o = 80; o < 128; o++) lutSet(lut, LUT_OBJECT, o, [150, 100, 70], 255);
  for (let o = 140; o < 150; o++) lutSet(lut, LUT_OBJECT, o, [130, 110, 90], 200);
  return lut;
}
