import { makeLoops, makeSfx, type LoopName, type SfxName } from './synth.ts';
import { Music, type Mood } from './music.ts';
import { settings, type Settings } from '../settings.ts';

const MAX_VOICES = 32;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private sfx: Partial<Record<SfxName, AudioBuffer>> = {};
  private loops: Partial<Record<LoopName, { src: AudioBufferSourceNode; gain: GainNode }>> = {};
  private voices = 0;
  private music: Music | null = null;
  private lastPlay = new Map<string, number>();
  started = false;

  constructor() {
    settings.subscribe((s) => this.applyVolumes(s));
  }

  unlock(): void {
    if (this.started) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.sfx = makeSfx(ctx);
    const loops = makeLoops(ctx);
    for (const name of Object.keys(loops) as LoopName[]) {
      const src = ctx.createBufferSource();
      src.buffer = loops[name];
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.ambBus);
      src.start();
      this.loops[name] = { src, gain };
    }
    this.music = new Music(ctx, this.musicBus);
    this.started = true;
    this.applyVolumes(settings.get());
    void this.loadOverrides();
  }

  private async loadOverrides(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const names = Object.keys(this.sfx) as SfxName[];
    await Promise.all(
      names.map(async (n) => {
        try {
          const r = await fetch(`./assets/sfx/${n}.ogg`);
          if (!r.ok || !(r.headers.get('content-type') ?? '').includes('audio')) return;
          this.sfx[n] = await ctx.decodeAudioData(await r.arrayBuffer());
        } catch {
          return;
        }
      }),
    );
  }

  applyVolumes(s: Settings): void {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.soundOn ? 1 : 0, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVol, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVol * 0.5, t, 0.2);
    this.ambBus.gain.setTargetAtTime(s.ambientVol * 0.6, t, 0.2);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName, opts: { volume?: number; pan?: number; rate?: number; throttleMs?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !settings.get().soundOn) return;
    const b = this.sfx[name];
    if (!b) return;
    const now = performance.now();
    const th = opts.throttleMs ?? 40;
    if (now - (this.lastPlay.get(name) ?? 0) < th) return;
    this.lastPlay.set(name, now);
    if (this.voices >= MAX_VOICES) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = opts.rate ?? 0.92 + Math.random() * 0.16;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1.5, opts.volume ?? 1));
    let node: AudioNode = src.connect(g);
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.sfxBus);
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
    };
    src.start();
  }

  ambient(levels: Partial<Record<LoopName, number>>): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    for (const name of Object.keys(this.loops) as LoopName[]) this.loops[name]!.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, levels[name] ?? 0)), t, 1.2);
  }

  setMood(m: Mood): void {
    this.music?.setMood(m);
  }

  get activeVoices(): number {
    return this.voices;
  }
}

export const audio = new AudioEngine();
(window as unknown as { __sotvAudio: AudioEngine }).__sotvAudio = audio;
