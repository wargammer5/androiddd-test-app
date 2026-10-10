import { useEffect, useRef } from 'preact/hooks';

export interface FlagSpec {
  color: [number, number, number];
  color2: [number, number, number];
  symbol: number;
  pattern: number;
}

const SYMBOLS: string[][] = [
  ['..#..', '.###.', '#####', '.###.', '..#..'],
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ['..#..', '..#..', '#####', '..#..', '..#..'],
  ['.###.', '#...#', '#...#', '#...#', '.###.'],
  ['#.#.#', '#####', '.###.', '.###.', '.###.'],
  ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  ['.#.#.', '#####', '#####', '.###.', '..#..'],
  ['..#..', '.###.', '..#..', '.###.', '#.#.#'],
  ['#####', '#...#', '#.#.#', '#...#', '#####'],
  ['..#..', '.##..', '###..', '.##..', '..#..'],
  ['.###.', '##.##', '#####', '.#.#.', '.#.#.'],
  ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
  ['.....', '#####', '.....', '#####', '.....'],
  ['#..##', '#.#..', '##...', '#.#..', '#..##'],
  ['.##..', '#..#.', '.##.#', '...#.', '..#..'],
];

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function drawFlag(ctx: CanvasRenderingContext2D, f: FlagSpec, w: number, h: number): void {
  ctx.fillStyle = rgb(f.color);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgb(f.color2);
  switch (f.pattern) {
    case 1:
      ctx.fillRect(0, h / 3, w, h / 3);
      break;
    case 2:
      ctx.fillRect(0, 0, w / 3, h);
      break;
    case 3:
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(0, h);
      ctx.fill();
      break;
  }
  const sym = SYMBOLS[f.symbol % SYMBOLS.length]!;
  const px = Math.floor(Math.min(w, h) / 8);
  const ox = Math.floor(w / 2 - (5 * px) / 2);
  const oy = Math.floor(h / 2 - (5 * px) / 2);
  ctx.fillStyle = f.pattern === 0 ? rgb(f.color2) : '#f4f0e0';
  sym.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ctx.fillRect(ox + x * px, oy + y * px, px, px)));
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

export function Flag({ spec, w = 36, h = 24 }: { spec: FlagSpec; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d');
    if (ctx) drawFlag(ctx, spec, w * 2, h * 2);
  }, [spec.color.join(), spec.symbol, spec.pattern]);
  return <canvas ref={ref} style={{ width: `${w}px`, height: `${h}px`, imageRendering: 'pixelated' }} />;
}
