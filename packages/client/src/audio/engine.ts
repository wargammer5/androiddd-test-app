import { makeLoops, makeSfx, type LoopName, type SfxName } from './synth.ts';
import { Music, type Mood } from './music.ts';
import { MusicTracks } from './tracks.ts';
import { settings, type Settings } from '../settings.ts';

const MAX_VOICES = 32;
const BASE = './assets/audio/';

export type SoundName = SfxName | 'ui_open' | 'ui_close' | 'ui_toggle' | 'ui_select' | 'ui_confirm' | 'ui_error' | 'ui_back' | 'footstep' | 'mining' | 'jingle_good' | 'jingle_bad' | 'jingle_era';

const FALLBACK: Record<string, SfxName> = {
  ui_open: 'click',
  ui_close: 'click',
  ui_toggle: 'click',
  ui_select: 'click',
  ui_confirm: 'chime',
  ui_error: 'click',
  ui_back: 'click',
  footstep: 'build',
  mining: 'build',
  jingle_good: 'bell',
  jingle_bad: 'horn',
  jingle_era: 'chime',
};

interface Manifest {
  sfx: Record<string, string[]>;
  loops: Record<string, string>;
  music: Record<string, string[]>;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private sfx: Partial<Record<SfxName, AudioBuffer>> = {};
  private files = new Map<string, AudioBuffer[]>();
  private tracks: MusicTracks | null = null;
  private mood: Mood = 'silent';
  loadedFiles = 0;
  private loops: Partial<Record<LoopName, { src: AudioBufferSourceNode; gain: GainNode }>> = {};
  private voices = 0;
  private music: Music | null = null;
  private lastPlay = new Map<string, number>();
  started = false;

  constructor() {
    let mode = settings.get().musicMode;
    settings.subscribe((s) => {
      this.applyVolumes(s);
      if (s.musicMode !== mode) {
        mode = s.musicMode;
        if (this.started) this.refreshMusic();
      }
    });
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
    void this.loadFiles();
  }

  private async decode(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const r = await fetch(BASE + file);
      if (!r.ok) return null;
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }

  private async loadFiles(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    let m: Manifest;
    try {
      const r = await fetch(BASE + 'manifest.json');
      if (!r.ok) return;
      m = (await r.json()) as Manifest;
    } catch {
      return;
    }
    this.tracks = new MusicTracks(ctx, this.musicBus, m.music ?? {}, BASE);
    this.tracks.onFail = () => this.refreshMusic();
    const mood = this.mood;
    this.mood = 'silent';
    this.setMood(mood);
    for (const [name, file] of Object.entries(m.loops ?? {})) {
      const loop = this.loops[name as LoopName];
      const buf = await this.decode(file);
      if (!loop || !buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(loop.gain);
      loop.src.stop();
      loop.src.disconnect();
      src.start();
      loop.src = src;
      this.loadedFiles++;
    }
    const entries = Object.entries(m.sfx ?? {});
    const queue = entries.flatMap(([name, files]) => files.map((f) => [name, f] as const));
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const buf = await this.decode(job[1]);
        if (!buf) continue;
        const list = this.files.get(job[0]) ?? [];
        list.push(buf);
        this.files.set(job[0], list);
        this.loadedFiles++;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  private buffer(name: SoundName): AudioBuffer | undefined {
    const list = this.files.get(name);
    if (list && list.length) return list[Math.floor(Math.random() * list.length)];
    return this.sfx[(FALLBACK[name] ?? name) as SfxName];
  }

  hasFiles(name: SoundName): boolean {
    return (this.files.get(name)?.length ?? 0) > 0;
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
    this.tracks?.pause();
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    this.tracks?.resume();
  }

  play(name: SoundName, opts: { volume?: number; pan?: number; rate?: number; throttleMs?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !settings.get().soundOn) return;
    const b = this.buffer(name);
    if (!b) return;
    const real = this.hasFiles(name);
    const now = performance.now();
    const th = opts.throttleMs ?? 40;
    if (now - (this.lastPlay.get(name) ?? 0) < th) return;
    this.lastPlay.set(name, now);
    if (this.voices >= MAX_VOICES) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = opts.rate ?? (real ? 0.96 + Math.random() * 0.08 : 0.92 + Math.random() * 0.16);
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
    this.mood = m;
    const useTracks = settings.get().musicMode === 'tracks' && !!this.tracks && this.tracks.has(m);
    this.music?.setMood(useTracks ? 'silent' : m);
    this.tracks?.setMood(useTracks ? m : 'silent');
  }

  refreshMusic(): void {
    const m = this.mood;
    this.mood = 'silent';
    this.setMood(m);
  }

  get musicTrack(): string | null {
    return this.tracks?.playing ?? null;
  }

  get activeVoices(): number {
    return this.voices;
  }
}

export const audio = new AudioEngine();
(window as unknown as { __sotvAudio: AudioEngine }).__sotvAudio = audio;
