import { useEffect, useRef } from 'preact/hooks';
import type { GameSession } from '../game.ts';

export function Minimap({ session }: { session: GameSession }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useRef<ImageData | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const draw = () => {
      const m = session.minimapData;
      if (!m) return;
      if (c.width !== m.w || c.height !== m.h) {
        c.width = m.w;
        c.height = m.h;
      }
      if (!img.current || img.current.width !== m.w) img.current = ctx.createImageData(m.w, m.h);
      img.current.data.set(m.data);
      ctx.putImageData(img.current, 0, 0);
      const v = session.cam.visible();
      const sx = m.w / session.info.w;
      const sy = m.h / session.info.h;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(v.x0 * sx + 0.5, v.y0 * sy + 0.5, (v.x1 - v.x0) * sx, (v.y1 - v.y0) * sy);
    };
    const id = setInterval(draw, 250);
    draw();
    return () => clearInterval(id);
  }, [session]);
  const jump = (e: PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * session.info.w;
    const y = ((e.clientY - r.top) / r.height) * session.info.h;
    session.followCam = false;
    session.centerOn(x, y);
  };
  return (
    <canvas
      class="minimap"
      ref={ref}
      data-testid="minimap"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons) jump(e);
      }}
    />
  );
}
