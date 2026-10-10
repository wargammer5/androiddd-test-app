import { TICK_HZ, type FromWorker, type ToWorker, type NewWorldParams, type FrameStats, type SimEvent, type Query, type Command } from '@sotv/sim';
import { Renderer } from './render/renderer.ts';
import { Camera } from './render/camera.ts';
import { Input } from './input.ts';
import { buildAtlas } from './assets/atlas.ts';
import { Store } from './store.ts';
import { settings } from './settings.ts';
import { platform } from './platform/index.ts';
import { Timelapse } from './timelapse.ts';
import { Particles, BURSTS, POWER_BURST, EVENT_BURST } from './render/particles.ts';

export interface ToolState {
  power: string | null;
  size: number;
  shape: 'circle' | 'square';
  arg?: string | number;
}

export const SPEEDS = [0, 1, 2, 4, 8] as const;

export class GameSession {
  readonly worker: Worker;
  readonly cam = new Camera();
  renderer: Renderer | null = null;
  input: Input | null = null;
  readonly stats = new Store<FrameStats | null>(null);
  readonly events = new Store<SimEvent[]>([]);
  readonly speed = new Store<number>(1);
  readonly tool = new Store<ToolState>({ power: null, size: 2, shape: 'circle' });
  readonly overlay = new Store<number>(0);
  readonly ready = new Store<boolean>(false);
  readonly hover = new Store<[number, number] | null>(null);
  readonly inspect = new Store<{ x: number; y: number; at: number } | null>(null);
  readonly errors = new Store<string[]>([]);
  readonly follow = new Store<{ id: number; x: number; y: number } | null>(null);
  info: { w: number; h: number; seed: string; size: string } = { w: 0, h: 0, seed: '', size: 'small' };
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastFrameAt = 0;
  private lastRender = 0;
  private reqId = 1;
  private pending = new Map<number, (v: unknown) => void>();
  private cw = 1;
  private viewSent = 0;
  private hidden = false;
  private savedSpeed = 1;
  private frameTimes: number[] = [];
  readonly fps = new Store<number>(0);
  private startTime = performance.now();
  private onFrameHooks: ((s: FrameStats) => void)[] = [];
  private lastFollow: { id: number; x: number; y: number } | null = null;
  followCam = false;
  minimapData: { w: number; h: number; data: Uint8Array } | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.errors.update((l) => [...l, String(e.message)]);
    this.overlay.subscribe((mode) => this.send({ t: 'layer', mode }));
    platform.onPause(() => {
      this.hidden = true;
      this.savedSpeed = this.speed.get();
      this.setSpeed(0);
    });
    platform.onResume(() => {
      if (!this.hidden) return;
      this.hidden = false;
      this.setSpeed(this.savedSpeed);
    });
  }

  send(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer);
  }

  newWorld(params: NewWorldParams): void {
    this.ready.set(false);
    this.send({ t: 'new', params });
  }

  load(bytes: Uint8Array): void {
    this.ready.set(false);
    const copy = bytes.slice();
    this.send({ t: 'load', bytes: copy.buffer }, [copy.buffer]);
  }

  save(): Promise<Uint8Array> {
    const id = this.reqId++;
    return new Promise((res) => {
      this.pending.set(id, (v) => res(new Uint8Array(v as ArrayBuffer)));
      this.send({ t: 'save', reqId: id });
    });
  }

  query<T = unknown>(q: Query): Promise<T> {
    const id = this.reqId++;
    return new Promise((res) => {
      this.pending.set(id, (v) => res(v as T));
      this.send({ t: 'query', reqId: id, q });
    });
  }

  cmd(c: Command): void {
    this.send({ t: 'cmd', cmd: c });
  }

  setSpeed(s: number): void {
    this.speed.set(s);
    this.send({ t: 'speed', speed: s });
  }

  onFrame(h: (s: FrameStats) => void): () => void {
    this.onFrameHooks.push(h);
    return () => {
      this.onFrameHooks = this.onFrameHooks.filter((x) => x !== h);
    };
  }

  private onMessage(m: FromWorker): void {
    switch (m.t) {
      case 'ready': {
        this.info = { w: m.w, h: m.h, seed: m.seed, size: m.size };
        this.cw = Math.ceil(m.w / 32);
        this.cam.setWorld(m.w, m.h);
        this.renderer?.setWorld(m.w, m.h, m.t0, m.t1);
        this.renderer?.setLut(m.lut);
        this.pendingWorld = this.renderer ? null : m;
        this.ready.set(true);
        this.sendView(true);
        this.send({ t: 'speed', speed: this.speed.get() });
        break;
      }
      case 'frame': {
        this.lastFrameAt = performance.now();
        if (this.renderer) {
          if (m.patches.length) this.renderer.applyPatches(m.patches, this.cw);
          if (m.lut) this.renderer.setLut(m.lut);
          this.renderer.setEntities(new Float32Array(m.buf), new Uint32Array(m.meta), m.count);
        }
        this.send({ t: 'ret', buf: m.buf, meta: m.meta }, [m.buf, m.meta]);
        this.stats.set(m.stats);
        if (m.events.length) {
          this.events.update((l) => [...l, ...m.events].slice(-300));
          for (const ev of m.events) {
            const fx = EVENT_BURST[ev.kind];
            if (fx && ev.x !== undefined && ev.y !== undefined) this.fx(fx, ev.x, ev.y);
          }
        }
        if (m.minimap) this.minimapData = m.minimap;
        this.lastFollow = m.follow ?? null;
        this.follow.set(m.follow ?? null);
        for (const h of this.onFrameHooks) h(m.stats);
        break;
      }
      case 'saved':
      case 'answer': {
        const cb = this.pending.get(m.reqId);
        this.pending.delete(m.reqId);
        cb?.(m.t === 'saved' ? m.bytes : m.data);
        break;
      }
      case 'error':
        console.error(m.message);
        this.errors.update((l) => [...l, m.message].slice(-20));
        break;
    }
  }

  private pendingWorld: Extract<FromWorker, { t: 'ready' }> | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, buildAtlas());
    if (this.pendingWorld) {
      const m = this.pendingWorld;
      this.renderer.setWorld(m.w, m.h, m.t0, m.t1);
      this.renderer.setLut(m.lut);
      this.pendingWorld = null;
    }
    this.input = new Input(canvas, this.cam, {
      hasTool: () => this.tool.get().power !== null,
      onApply: (wx, wy, stroke, first) => this.applyTool(wx, wy, stroke, first),
      onStrokeEnd: () => {
        if (this.tool.get().power === 'magnet') this.cmd({ t: 'power', power: 'magnet_drop', x: 0, y: 0, radius: 0, shape: 'circle', stroke: 0 });
      },
      onInspect: (wx, wy) => this.inspect.set({ x: Math.floor(wx), y: Math.floor(wy), at: performance.now() }),
      onLongPress: (wx, wy) => {
        if (settings.get().vibration) platform.vibrate(20);
        this.inspect.set({ x: Math.floor(wx), y: Math.floor(wy), at: performance.now() });
      },
      onHover: (wx, wy) => this.hover.set(wx < -1e8 ? null : [wx, wy]),
      onCameraMoved: () => {
        this.followCam = false;
        this.sendView();
      },
    });
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach(): void {
    this.timelapse.stop();
    cancelAnimationFrame(this.raf);
    this.input?.dispose();
    this.input = null;
    this.renderer = null;
    this.canvas = null;
  }

  dispose(): void {
    this.detach();
    this.worker.terminate();
  }

  readonly timelapse = new Timelapse(() => this.canvas);
  readonly particles = new Particles();

  fx(kind: string, x: number, y: number): void {
    const b = BURSTS[kind];
    if (!b || this.qualityLevel() === 0) return;
    for (const burst of b(x, y)) this.particles.burst(burst);
  }
  onPowerUsed: ((power: string, x: number, y: number) => void) | null = null;
  private lastPowerSound = 0;

  get canvasEl(): HTMLCanvasElement | null {
    return this.canvas;
  }

  readonly measure = new Store<{ a: [number, number] | null; b: [number, number] | null }>({ a: null, b: null });

  applyTool(wx: number, wy: number, stroke: number, first: boolean): void {
    const t = this.tool.get();
    if (!t.power) return;
    if (t.power === 'measure') {
      if (!first) return;
      const m = this.measure.get();
      if (!m.a || m.b) this.measure.set({ a: [wx, wy], b: null });
      else this.measure.set({ a: m.a, b: [wx, wy] });
      return;
    }
    if (t.power === 'titancrab') this.followCam = true;
    const now = performance.now();
    if (first || now - this.lastPowerSound > 220) {
      this.lastPowerSound = now;
      this.onPowerUsed?.(t.power, wx, wy);
      const fx = POWER_BURST[t.power];
      if (fx) this.fx(fx, wx, wy);
    }
    this.cmd({ t: 'power', power: t.power, x: wx, y: wy, radius: t.size, shape: t.shape, stroke, arg: t.arg });
  }

  sendView(force = false): void {
    const now = performance.now();
    if (!force && now - this.viewSent < 200) return;
    this.viewSent = now;
    this.send({ t: 'view', rect: this.cam.visible() });
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.cam.x = x;
    this.cam.y = y;
    if (zoom) this.cam.zoom = zoom;
    this.cam.clamp();
    this.sendView(true);
  }

  qualityLevel(): number {
    const q = settings.get().quality;
    if (q === 'low') return 0;
    if (q === 'medium') return 1;
    if (q === 'high') return 2;
    const dc = platform.deviceClass();
    return dc === 'low' ? 0 : dc === 'mid' ? 1 : 2;
  }

  private frame(now: number): void {
    const canvas = this.canvas;
    const r = this.renderer;
    if (!canvas || !r) return;
    const st = settings.get();
    const limit = st.batterySaver ? 30 : st.fpsLimit;
    if (limit < 60 && now - this.lastRender < 1000 / limit - 2) return;
    const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
    this.lastRender = now;
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0]! > 1000) this.frameTimes.shift();
    if (this.frameTimes.length % 10 === 0) this.fps.set(this.frameTimes.length);
    const q = this.qualityLevel();
    const dprMax = q === 0 ? 1 : q === 1 ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    r.resize(w, h);
    if (this.cam.viewW !== w || this.cam.viewH !== h) {
      const first = this.cam.viewW <= 1;
      this.cam.resize(w, h);
      if (first) this.cam.fit();
      this.sendView(true);
    }
    this.input?.setDpr(dpr);
    this.input?.update(dt);
    if (this.followCam && this.lastFollow) {
      this.cam.x += (this.lastFollow.x - this.cam.x) * Math.min(1, dt * 5);
      this.cam.y += (this.lastFollow.y - this.cam.y) * Math.min(1, dt * 5);
      this.sendView();
    }
    const s = this.stats.get();
    const sp = this.speed.get();
    const tickDur = sp > 0 ? 1000 / (TICK_HZ * sp) : Infinity;
    const alpha = sp > 0 ? Math.min(1, (now - this.lastFrameAt) / tickDur) : 1;
    const t = this.tool.get();
    const hv = this.hover.get();
    const brush: [number, number, number, number] = t.power && hv ? [hv[0], hv[1], t.size, t.shape === 'square' ? 1 : 0] : [0, 0, 0, 0];
    const dayPhase = s?.dayPhase ?? 0.5;
    const day = dayLight(dayPhase) * (s?.light ?? 1);
    this.particles.update(dt);
    r.setParticles(this.particles.data, this.particles.count);
    r.draw(this.cam, {
      time: (now - this.startTime) / 1000,
      day,
      overlay: this.overlay.get(),
      quality: q,
      clouds: st.clouds && q > 0 ? 1 : 0,
      alpha,
      brush,
      seasonTint: s ? seasonTint(s.season) : 0,
      cloudList: s?.clouds ?? [],
      flash: s?.flash ?? 0,
      bloom: st.bloom && q > 0,
    });
  }

  screenshot(): string | null {
    return this.canvas ? this.canvas.toDataURL('image/png') : null;
  }
}

export function dayLight(phase: number): number {
  const s = Math.sin(phase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
  return Math.min(1, 0.3 + s * 1.1);
}

function seasonTint(season: number): number {
  return season === 2 ? 0.6 : season === 3 ? -0.2 : 0;
}
