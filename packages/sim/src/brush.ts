import type { World } from './world.ts';

export function forBrush(w: World, cx: number, cy: number, r: number, shape: 'circle' | 'square', fn: (i: number, x: number, y: number, falloff: number) => void): void {
  const rr = Math.max(0.5, r);
  const x0 = Math.max(0, Math.floor(cx - rr));
  const x1 = Math.min(w.w - 1, Math.floor(cx + rr));
  const y0 = Math.max(0, Math.floor(cy - rr));
  const y1 = Math.min(w.h - 1, Math.floor(cy + rr));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
      if (d > rr) continue;
      fn(y * w.w + x, x, y, 1 - d / (rr + 0.001));
    }
}
