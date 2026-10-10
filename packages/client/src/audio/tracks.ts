import type { Mood } from './music.ts';

type Group = 'menu' | 'peace' | 'war' | 'disaster';

const GROUP: Record<Exclude<Mood, 'silent'>, Group> = { menu: 'menu', calm: 'peace', night: 'peace', war: 'war', disaster: 'disaster' };
const SETTLE_MS = 6000;
const FADE_S = 2.5;

interface Slot {
  el: HTMLAudioElement;
  gain: GainNode;
  list: string[];
  idx: number;
}

export class MusicTracks {
  private slots = new Map<Group, Slot>();
  private current: Group | null = null;
  private wanted: Group | null = null;
  private since = 0;
  private timer: ReturnType<typeof setInterval>;
  failed = false;
  onFail: (() => void) | null = null;

  constructor(
    private ctx: AudioContext,
    private dest: AudioNode,
    private lists: Partial<Record<string, string[]>>,
    private base: string,
  ) {
    this.timer = setInterval(() => this.tick(), 500);
  }

  has(m: Mood): boolean {
    if (this.failed) return false;
    if (m === 'silent') return true;
    return this.listFor(GROUP[m]).length > 0;
  }

  private listFor(g: Group): string[] {
    if (g === 'peace') return [...(this.lists.calm ?? []), ...(this.lists.night ?? [])];
    return this.lists[g] ?? [];
  }

  setMood(m: Mood): void {
    const g = m === 'silent' ? null : GROUP[m];
    if (g === this.wanted) return;
    this.wanted = g;
    this.since = performance.now();
    if (this.current === null || g === null || g === 'menu' || this.current === 'menu' || g === 'disaster') this.apply();
  }

  private tick(): void {
    if (this.wanted !== this.current && performance.now() - this.since > SETTLE_MS) this.apply();
  }

  private slot(g: Group): Slot | null {
    let s = this.slots.get(g);
    if (s) return s;
    const list = this.listFor(g);
    if (!list.length) return null;
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.dest);
    s = { el, gain, list, idx: Math.floor(Math.random() * list.length) };
    el.src = this.base + list[s.idx]!;
    const slot = s;
    el.addEventListener('ended', () => {
      slot.idx = (slot.idx + 1) % slot.list.length;
      slot.el.src = this.base + slot.list[slot.idx]!;
      void slot.el.play().catch(() => undefined);
    });
    el.addEventListener('error', () => this.fail());
    this.slots.set(g, s);
    return s;
  }

  private apply(): void {
    const t = this.ctx.currentTime;
    const next = this.wanted;
    for (const [g, s] of this.slots) {
      if (g === next) continue;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setTargetAtTime(0, t, FADE_S / 3);
      const el = s.el;
      setTimeout(() => {
        if (this.current !== g) el.pause();
      }, FADE_S * 1000 + 200);
    }
    this.current = next;
    if (!next) return;
    const s = this.slot(next);
    if (!s) return;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setTargetAtTime(1, t, FADE_S / 3);
    void s.el.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      this.fail();
    });
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    for (const s of this.slots.values()) s.el.pause();
    this.onFail?.();
  }

  get playing(): string | null {
    const s = this.current ? this.slots.get(this.current) : undefined;
    return s && !s.el.paused ? s.list[s.idx]! : null;
  }

  pause(): void {
    for (const s of this.slots.values()) s.el.pause();
  }

  resume(): void {
    if (this.current) void this.slots.get(this.current)?.el.play().catch(() => undefined);
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const s of this.slots.values()) {
      s.el.pause();
      s.el.src = '';
    }
    this.slots.clear();
    this.current = null;
  }
}
