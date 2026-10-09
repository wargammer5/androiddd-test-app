import { biomes } from '@sotv/content';

export function hexRgb(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const LUT_KINGDOM = 0;
export const LUT_CULTURE = 1;
export const LUT_RELIGION = 2;
export const LUT_UNIT = 3;
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
  for (let i = 0; i < 256; i++) lutSet(lut, LUT_UNIT, i, [230, 230, 230]);
  return lut;
}
