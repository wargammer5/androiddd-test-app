export type Mood = 'calm' | 'night' | 'war' | 'disaster' | 'menu' | 'silent';

interface MoodDef {
  bpm: number;
  scale: number[];
  root: number;
  chords: number[][];
  arp: number;
  drums: boolean;
  pad: number;
}

const MOODS: Record<Exclude<Mood, 'silent'>, MoodDef> = {
  calm: { bpm: 76, scale: [0, 2, 4, 7, 9], root: 57, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [-3, 0, 4]], arp: 0.55, drums: false, pad: 0.22 },
  night: { bpm: 60, scale: [0, 3, 5, 7, 10], root: 52, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]], arp: 0.3, drums: false, pad: 0.18 },
  war: { bpm: 112, scale: [0, 2, 3, 5, 7, 8], root: 50, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], arp: 0.8, drums: true, pad: 0.16 },
  disaster: { bpm: 92, scale: [0, 1, 4, 6, 7], root: 48, chords: [[0, 1, 6], [-1, 3, 6], [0, 4, 6], [1, 4, 8]], arp: 0.6, drums: true, pad: 0.2 },
  menu: { bpm: 70, scale: [0, 2, 4, 7, 9], root: 60, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], arp: 0.45, drums: false, pad: 0.24 },
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private mood: Mood = 'silent';
  private next = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval>;
  private out: GainNode;
  private noise: AudioBuffer;
  private seed = 1;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(dest);
    const n = ctx.sampleRate * 0.3;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.tick(), 100);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  setMood(m: Mood): void {
    if (m === this.mood) return;
    this.mood = m;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(m === 'silent' ? 0.0001 : 1, t, 1.5);
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private drum(t: number, kind: 'kick' | 'hat'): void {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.3);
    } else {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f).connect(g).connect(this.out);
      s.start(t);
      s.stop(t + 0.06);
    }
  }

  private tick(): void {
    if (this.mood === 'silent' || this.ctx.state !== 'running') return;
    const def = MOODS[this.mood];
    const ctx = this.ctx;
    const beat = 60 / def.bpm / 2;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.35) {
      const t = this.next;
      const bar = Math.floor(this.step / 16);
      const pos = this.step % 16;
      const chord = def.chords[bar % def.chords.length]!;
      if (pos === 0) for (const n of chord) this.tone(hz(def.root + n - 12), t, beat * 16, 'triangle', def.pad * 0.35, 0.8);
      if (pos % 2 === 0 && this.rand() < def.arp) {
        const deg = def.scale[Math.floor(this.rand() * def.scale.length)]!;
        const oct = this.rand() < 0.3 ? 12 : 0;
        this.tone(hz(def.root + deg + oct + 12), t, beat * 2.5, 'sine', 0.08, 0.01);
      }
      if (pos === 8 && this.rand() < 0.4) this.tone(hz(def.root + chord[0]! - 24), t, beat * 6, 'sine', 0.12, 0.05);
      if (def.drums) {
        if (pos % 4 === 0) this.drum(t, 'kick');
        if (pos % 2 === 1) this.drum(t, 'hat');
      }
      this.step++;
      this.next += beat;
    }
  }
}
