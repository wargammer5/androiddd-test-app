import type { Camera } from './render/camera.ts';

export interface InputHandlers {
  hasTool(): boolean;
  onApply(wx: number, wy: number, stroke: number, first: boolean): void;
  onStrokeEnd(stroke: number): void;
  onInspect(wx: number, wy: number): void;
  onHover(wx: number, wy: number): void;
  onCameraMoved(): void;
  onLongPress(wx: number, wy: number): void;
}

interface Ptr {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  type: string;
  button: number;
  t: number;
}

export class Input {
  private ptrs = new Map<number, Ptr>();
  private mode: 'none' | 'tool' | 'pan' | 'pinch' = 'none';
  private stroke = 0;
  private pinchDist = 0;
  private pinchCx = 0;
  private pinchCy = 0;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private moved = false;
  private lastApply: [number, number] | null = null;
  private dpr = 1;
  readonly keys = new Set<string>();

  constructor(private el: HTMLElement, private cam: Camera, private h: InputHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('pointerleave', this.leave);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
  }

  setDpr(d: number): void {
    this.dpr = d;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.up);
    this.el.removeEventListener('pointerleave', this.leave);
    this.el.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
  }

  private pos(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr];
  }

  private clearLong(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    this.longTimer = null;
  }

  private down = (e: PointerEvent): void => {
    this.el.setPointerCapture?.(e.pointerId);
    const [x, y] = this.pos(e);
    this.ptrs.set(e.pointerId, { id: e.pointerId, x, y, sx: x, sy: y, type: e.pointerType, button: e.button, t: performance.now() });
    this.moved = false;
    if (this.ptrs.size === 2) {
      if (this.mode === 'tool') this.h.onStrokeEnd(this.stroke);
      this.clearLong();
      this.mode = 'pinch';
      this.startPinch();
      return;
    }
    if (this.ptrs.size > 2) return;
    const mouse = e.pointerType === 'mouse';
    if (mouse && (e.button === 1 || e.button === 2)) {
      this.mode = 'pan';
      return;
    }
    if (!mouse) {
      this.longTimer = setTimeout(() => {
        if (!this.moved && this.ptrs.size === 1) {
          const [wx, wy] = this.cam.toWorld(x, y);
          this.mode = 'none';
          this.h.onLongPress(wx, wy);
        }
      }, 550);
    }
    if (this.h.hasTool() && !(mouse && this.keys.has(' '))) {
      this.mode = 'tool';
      this.stroke++;
      const [wx, wy] = this.cam.toWorld(x, y);
      this.lastApply = [wx, wy];
      this.h.onApply(wx, wy, this.stroke, true);
    } else {
      this.mode = 'pan';
    }
  };

  private startPinch(): void {
    const [a, b] = [...this.ptrs.values()];
    this.pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    this.pinchCx = (a!.x + b!.x) / 2;
    this.pinchCy = (a!.y + b!.y) / 2;
  }

  private move = (e: PointerEvent): void => {
    const [x, y] = this.pos(e);
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        const [wx, wy] = this.cam.toWorld(x, y);
        this.h.onHover(wx, wy);
      }
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 10 * this.dpr) {
      this.moved = true;
      this.clearLong();
    }
    if (this.mode === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const cx = (a!.x + b!.x) / 2;
      const cy = (a!.y + b!.y) / 2;
      this.cam.pan(cx - this.pinchCx, cy - this.pinchCy);
      if (this.pinchDist > 0) this.cam.zoomAt(d / this.pinchDist, cx, cy);
      this.pinchDist = d;
      this.pinchCx = cx;
      this.pinchCy = cy;
      this.h.onCameraMoved();
      return;
    }
    if (this.mode === 'pan') {
      this.cam.pan(dx, dy);
      this.h.onCameraMoved();
      return;
    }
    if (this.mode === 'tool') {
      const [wx, wy] = this.cam.toWorld(x, y);
      this.h.onHover(wx, wy);
      const last = this.lastApply;
      const dist = last ? Math.hypot(wx - last[0], wy - last[1]) : 99;
      if (dist >= 0.75) {
        const steps = Math.min(16, Math.floor(dist / 0.75));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          this.h.onApply(last![0] + (wx - last![0]) * t, last![1] + (wy - last![1]) * t, this.stroke, false);
        }
        this.lastApply = [wx, wy];
      }
    }
  };

  private up = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    this.clearLong();
    if (!p) return;
    if (this.mode === 'tool' && this.ptrs.size === 0) {
      this.h.onStrokeEnd(this.stroke);
    }
    if (this.mode === 'pan' && !this.moved && this.ptrs.size === 0 && p.button === 0 && performance.now() - p.t < 500) {
      const [wx, wy] = this.cam.toWorld(p.x, p.y);
      this.h.onInspect(wx, wy);
    }
    if (this.ptrs.size === 0) this.mode = 'none';
    else if (this.ptrs.size === 1 && this.mode === 'pinch') this.mode = 'pan';
  };

  private leave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !this.ptrs.has(e.pointerId)) this.h.onHover(-1e9, -1e9);
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const [x, y] = this.pos(e);
    this.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y);
    this.h.onCameraMoved();
  };

  private keydown = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    this.keys.add(e.key);
  };

  private keyup = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };

  update(dtSec: number): void {
    const k = this.keys;
    const sp = 600 * dtSec * this.dpr;
    let dx = 0;
    let dy = 0;
    if (k.has('a') || k.has('ArrowLeft') || k.has('ф')) dx += sp;
    if (k.has('d') || k.has('ArrowRight') || k.has('в')) dx -= sp;
    if (k.has('w') || k.has('ArrowUp') || k.has('ц')) dy += sp;
    if (k.has('s') || k.has('ArrowDown') || k.has('ы')) dy -= sp;
    if (dx || dy) {
      this.cam.pan(dx, dy);
      this.h.onCameraMoved();
    }
  }
}
