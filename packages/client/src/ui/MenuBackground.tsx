import { useEffect, useRef } from 'preact/hooks';

export function MenuBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 160;
    const h = 100;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const grid = new Float32Array(17 * 12).map(() => rnd());
    const val = (x: number, y: number) => {
      const gx = (x / w) * 16;
      const gy = (y / h) * 11;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const g = (a: number, b: number) => grid[b * 17 + a]!;
      const a = g(ix, iy) * (1 - fx) + g(ix + 1, iy) * fx;
      const b = g(ix, iy + 1) * (1 - fx) + g(ix + 1, iy + 1) * fx;
      return a * (1 - fy) + b * fy;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = val(x, y) * 0.8 + rnd() * 0.08;
        const o = (y * w + x) * 4;
        const col = v < 0.45 ? [30, 70, 120] : v < 0.5 ? [200, 190, 130] : v < 0.68 ? [90, 150, 70] : v < 0.78 ? [60, 110, 55] : [130, 128, 120];
        img.data[o] = col[0]!;
        img.data[o + 1] = col[1]!;
        img.data[o + 2] = col[2]!;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, []);
  return <canvas class="menu-bg" ref={ref} />;
}
