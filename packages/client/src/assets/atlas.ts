import { biomes } from '@sotv/content';
import { drawObjects } from './objects.ts';
import { drawCreatures } from './creatures.ts';

export const TILE = 8;
export const ATLAS_SIZE = 512;
export const COLS = ATLAS_SIZE / TILE;

export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function shade(c: RGB, k: number): RGB {
  return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export class AtlasPainter {
  readonly px = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  private seed = 12345;

  rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  set(tileIndex: number, x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const tx = (tileIndex % COLS) * TILE + x;
    const ty = Math.floor(tileIndex / COLS) * TILE + y;
    const o = (ty * ATLAS_SIZE + tx) * 4;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
    this.px[o + 3] = a;
  }

  fill(tileIndex: number, c: RGB, a = 255): void {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(tileIndex, x, y, c, a);
  }

  rect(t: number, x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(t, x, y, c);
  }

  pattern(t: number, rows: string[], pal: Record<string, RGB>): void {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.set(t, x, y, c);
      }
    });
  }
}

function groundTile(p: AtlasPainter, t: number, key: string, base: RGB, variant: number): void {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const r = p.rand();
      p.set(t, x, y, shade(base, 0.92 + r * 0.16));
    }
  const dots = 3 + variant;
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(p.rand() * TILE);
    const y = Math.floor(p.rand() * TILE);
    switch (key) {
      case 'plains':
      case 'savanna':
      case 'jungle':
      case 'forest':
      case 'swamp':
      case 'magic':
        p.set(t, x, y, shade(base, 1.25));
        p.set(t, x, y + 1, shade(base, 0.8));
        break;
      case 'desert':
      case 'beach':
        p.set(t, x, y, shade(base, 0.85));
        p.set(t, x + 1, y, shade(base, 1.08));
        break;
      case 'mountain':
        p.set(t, x, y, shade(base, 1.3));
        p.set(t, x + 1, y + 1, shade(base, 0.7));
        break;
      case 'snow':
        p.set(t, x, y, shade(base, 0.93));
        break;
      case 'volcanic':
        p.set(t, x, y, i % 3 === 0 ? [140, 50, 20] : shade(base, 0.7));
        break;
      case 'acid':
        p.set(t, x, y, [180, 220, 60]);
        break;
      default:
        p.set(t, x, y, shade(base, 0.9));
    }
  }
  if (key === 'magic' && variant === 0) p.set(t, 3, 3, [230, 200, 255]);
}

export function buildAtlas(): Uint8Array {
  const p = new AtlasPainter();
  for (const b of biomes) {
    for (let v = 0; v < 4; v++) groundTile(p, b.id * 4 + v, b.key, hex(b.color), v);
  }
  drawObjects(p);
  drawCreatures(p);
  return p.px;
}
