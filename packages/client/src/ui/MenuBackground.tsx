import { useEffect, useRef } from 'preact/hooks';

const PX = 4;
const WORLD = 480;
const TILE = 8;

const TREES: [number, number][] = [
  [4, 5],
  [5, 5],
  [6, 5],
];
const HOUSES: [number, number][] = [
  [5, 7],
  [6, 7],
  [7, 7],
];
const WALKERS: [number, number][] = [
  [4, 0],
  [5, 0],
  [6, 0],
  [7, 0],
  [9, 0],
  [8, 1],
  [4, 1],
];

interface Walker {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sprite: [number, number];
  phase: number;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function MenuBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = Math.max(80, Math.min(360, Math.round((c.clientWidth || 640) / PX)));
    const H = Math.max(80, Math.min(260, Math.round((c.clientHeight || 400) / PX)));
    c.width = w;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const rnd = makeRng(7);
    const GX = 32;
    const GY = 9;
    const grid = new Float32Array(GX * GY).map(() => rnd());
    const val = (x: number, y: number) => {
      const gx = (((x % WORLD) + WORLD) % WORLD) / (WORLD / GX);
      const gy = (y / H) * (GY - 1);
      const ix = Math.floor(gx);
      const iy = Math.min(GY - 2, Math.floor(gy));
      const fx = gx - ix;
      const fy = gy - iy;
      const g = (a: number, b: number) => grid[b * GX + (a % GX)]!;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx;
      const b = g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
    const height = new Float32Array(WORLD * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < WORLD; x++) height[y * WORLD + x] = val(x, y) * 0.85 + rnd() * 0.06;
    const at = (x: number, y: number) => height[Math.max(0, Math.min(H - 1, Math.floor(y))) * WORLD + ((Math.floor(x) % WORLD) + WORLD) % WORLD]!;
    const land = (x: number, y: number) => at(x, y) >= 0.5;

    const props: { x: number; y: number; s: [number, number] }[] = [];
    for (let y = 4; y < H - 4; y += 6)
      for (let x = 0; x < WORLD; x += 6) {
        const v = at(x, y);
        const r = rnd();
        if (v > 0.58 && v < 0.76 && r < 0.22) props.push({ x: x + Math.floor(rnd() * 3), y, s: TREES[Math.floor(rnd() * TREES.length)]! });
        else if (v > 0.52 && v < 0.6 && r < 0.035) props.push({ x, y, s: HOUSES[Math.floor(rnd() * HOUSES.length)]! });
      }
    const walkers: Walker[] = [];
    for (let k = 0, guard = 0; k < 14 && guard < 5000; guard++) {
      const x = rnd() * WORLD;
      const y = 8 + rnd() * (H - 16);
      if (!land(x, y) || at(x, y) > 0.75) continue;
      const ang = rnd() * Math.PI * 2;
      walkers.push({ x, y, vx: Math.cos(ang) * 4, vy: Math.sin(ang) * 2, sprite: WALKERS[k % WALKERS.length]!, phase: rnd() * 10 });
      k++;
    }
    const clouds = Array.from({ length: 6 }, () => ({ x: rnd() * WORLD, y: rnd() * H, r: 10 + rnd() * 18 }));

    const sheet = new Image();
    let sheetOk = false;
    sheet.onload = () => (sheetOk = true);
    sheet.src = './assets/sprites/micro-roguelike.png';

    const img = ctx.createImageData(w, H);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let time = 0;
    const draw = () => {
      const cam = time * 3;
      const t = time;
      for (let y = 0; y < H; y++)
        for (let sx = 0; sx < w; sx++) {
          const wx = sx + cam;
          const v = at(wx, y);
          let col: [number, number, number];
          if (v < 0.45) {
            const wave = Math.sin(wx * 0.35 + y * 0.6 + t * 2.2) * Math.sin(y * 0.9 - t * 1.3);
            const k = v < 0.38 ? 0 : 12;
            col = wave > 0.86 ? [90, 140, 190] : [28 + k, 66 + k, 116 + k];
          } else if (v < 0.5) {
            const foam = Math.sin(t * 3 + wx * 0.5) > 0.7 && v < 0.47;
            col = foam ? [225, 225, 210] : [200, 190, 130];
          } else if (v < 0.68) col = [90, 150, 70];
          else if (v < 0.78) col = [60, 110, 55];
          else col = v > 0.84 ? [215, 215, 225] : [130, 128, 120];
          let shade = 1;
          for (const cl of clouds) {
            const dx = (((wx - cl.x - t * 6) % WORLD) + WORLD) % WORLD;
            const ddx = dx > WORLD / 2 ? dx - WORLD : dx;
            const d = (ddx * ddx) / (cl.r * cl.r * 2.2) + ((y - cl.y) * (y - cl.y)) / (cl.r * cl.r * 0.5);
            if (d < 1) shade = Math.min(shade, 0.78 + 0.22 * d);
          }
          const o = (y * w + sx) * 4;
          img.data[o] = col[0] * shade;
          img.data[o + 1] = col[1] * shade;
          img.data[o + 2] = col[2] * shade;
          img.data[o + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      if (!sheetOk) return;
      const scr = (x: number) => ((((x - cam) % WORLD) + WORLD) % WORLD);
      const items: { x: number; y: number; s: [number, number]; bob: number }[] = [];
      for (const p of props) {
        const x = scr(p.x);
        if (x < w + TILE) items.push({ x, y: p.y, s: p.s, bob: 0 });
      }
      for (const m of walkers) {
        const x = scr(m.x);
        if (x < w + TILE) items.push({ x, y: m.y, s: m.sprite, bob: Math.floor((t * 4 + m.phase) % 2) });
      }
      items.sort((a, b) => a.y - b.y);
      for (const it of items) ctx.drawImage(sheet, it.s[0] * TILE, it.s[1] * TILE, TILE, TILE, Math.round(it.x - TILE / 2), Math.round(it.y - TILE) - it.bob, TILE, TILE);
    };
    const step = (dt: number) => {
      time += dt;
      for (const m of walkers) {
        m.phase += dt;
        const nx = m.x + m.vx * dt;
        const ny = m.y + m.vy * dt;
        if (!land(nx, ny) || at(nx, ny) > 0.78 || ny < 6 || ny > H - 4 || Math.random() < dt * 0.15) {
          const ang = Math.random() * Math.PI * 2;
          m.vx = Math.cos(ang) * 4;
          m.vy = Math.sin(ang) * 2;
        } else {
          m.x = nx;
          m.y = ny;
        }
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      if (acc < 1 / 24) return;
      step(acc);
      acc = 0;
      draw();
    };
    draw();
    if (!reduce) raf = requestAnimationFrame(frame);
    else sheet.addEventListener('load', draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas class="menu-bg" ref={ref} data-testid="menu-bg" />;
}
