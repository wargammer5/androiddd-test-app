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
  url: string | null;
  ready: Promise<void> | null;
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
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.dest);
    s = { el, gain, list, idx: Math.floor(Math.random() * list.length), url: null, ready: null };
    const slot = s;
    slot.ready = this.load(slot);
    el.addEventListener('ended', () => {
      slot.idx = (slot.idx + 1) % slot.list.length;
      slot.ready = this.load(slot).then(() => {
        if (this.current === g) return this.start(slot);
      });
    });
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
    void s.ready?.then(() => {
      if (this.current === next) return this.start(s);
    });
  }

  private async load(s: Slot): Promise<void> {
    try {
      const r = await fetch(this.base + s.list[s.idx]!);
      if (!r.ok) throw new Error('music ' + r.status);
      const blob = await r.blob();
      if (s.url) URL.revokeObjectURL(s.url);
      s.url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'audio/ogg' }));
      s.el.src = s.url;
    } catch {
      this.fail();
    }
  }

  private async start(s: Slot): Promise<void> {
    if (this.failed) return;
    try {
      await s.el.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      this.fail();
    }
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
    const s = this.current ? this.slots.get(this.current) : undefined;
    if (s && s.el.paused) void s.ready?.then(() => this.start(s));
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const s of this.slots.values()) {
      s.el.pause();
      if (s.url) URL.revokeObjectURL(s.url);
    }
    this.slots.clear();
    this.current = null;
  }
}
