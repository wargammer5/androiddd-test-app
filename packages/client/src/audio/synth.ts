export type SfxName =
  | 'click'
  | 'place'
  | 'explosion'
  | 'thunder'
  | 'splash'
  | 'fire'
  | 'clash'
  | 'death'
  | 'build'
  | 'bell'
  | 'horn'
  | 'chime'
  | 'whoosh'
  | 'quake'
  | 'growl'
  | 'coin';

export type LoopName = 'rain' | 'wind' | 'birds' | 'night' | 'sea' | 'crackle';

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buffer(ctx: BaseAudioContext, seconds: number, fn: (t: number, i: number, r: () => number) => number, seed = 1): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(seconds * sr));
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const r = rnd(seed);
  for (let i = 0; i < n; i++) d[i] = fn(i / sr, i, r);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak > 0) for (let i = 0; i < n; i++) d[i] = (d[i]! / peak) * 0.9;
  return b;
}

const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));

function lowpass(seed: number, k: number): (r: () => number) => number {
  let y = 0;
  void seed;
  return (r) => {
    y += (r() * 2 - 1 - y) * k;
    return y;
  };
}

export function makeSfx(ctx: BaseAudioContext): Record<SfxName, AudioBuffer> {
  const lp1 = lowpass(1, 0.08);
  const lp2 = lowpass(2, 0.03);
  const lp3 = lowpass(3, 0.2);
  const lp4 = lowpass(4, 0.02);
  const lp5 = lowpass(5, 0.12);
  const lp6 = lowpass(6, 0.05);
  return {
    click: buffer(ctx, 0.05, (t) => Math.sin(t * 2 * Math.PI * 1200) * env(t, 0.002, 0.012)),
    place: buffer(ctx, 0.18, (t, _i, r) => (Math.sin(t * 2 * Math.PI * (300 - t * 600)) * 0.7 + (r() - 0.5) * 0.3) * env(t, 0.005, 0.05)),
    explosion: buffer(ctx, 1.6, (t, _i, r) => lp1(r) * env(t, 0.01, 0.35) + Math.sin(t * 2 * Math.PI * 45) * env(t, 0.01, 0.3) * 0.6, 7),
    thunder: buffer(ctx, 2.4, (t, _i, r) => lp2(r) * env(t, 0.05, 0.7) * (1 + 0.5 * Math.sin(t * 13)), 11),
    splash: buffer(ctx, 0.5, (t, _i, r) => lp3(r) * env(t, 0.01, 0.12), 3),
    fire: buffer(ctx, 0.8, (t, _i, r) => (r() < 0.004 ? r() * 2 - 1 : 0) * 3 + lp5(r) * 0.4 * env(t, 0.1, 0.5), 5),
    clash: buffer(ctx, 0.35, (t, _i, r) => (Math.sin(t * 2 * Math.PI * 2100) * 0.5 + Math.sin(t * 2 * Math.PI * 3170) * 0.4 + (r() - 0.5) * 0.4) * env(t, 0.001, 0.07), 9),
    death: buffer(ctx, 0.6, (t) => Math.sin(t * 2 * Math.PI * (220 - t * 160)) * env(t, 0.01, 0.2)),
    build: buffer(ctx, 0.25, (t, _i, r) => (Math.sin(t * 2 * Math.PI * 180) + (r() - 0.5) * 0.6) * env(t, 0.002, 0.04), 13),
    bell: buffer(ctx, 2.2, (t) => (Math.sin(t * 2 * Math.PI * 660) + 0.5 * Math.sin(t * 2 * Math.PI * 1320 * 1.01) + 0.25 * Math.sin(t * 2 * Math.PI * 1980)) * env(t, 0.005, 0.6)),
    horn: buffer(ctx, 1.6, (t) => {
      const f = 146.8;
      let s = 0;
      for (let h = 1; h <= 6; h++) s += Math.sin(t * 2 * Math.PI * f * h) / h;
      return s * Math.min(1, t * 6) * Math.max(0, 1 - (t - 1.1) * 2) * (1 + 0.04 * Math.sin(t * 30));
    }),
    chime: buffer(ctx, 1.4, (t) => [1, 1.25, 1.5, 2].reduce((a, m, k) => a + Math.sin(t * 2 * Math.PI * 880 * m) * env(Math.max(0, t - k * 0.08), 0.002, 0.35), 0)),
    whoosh: buffer(ctx, 1.2, (t, _i, r) => lp4(r) * Math.sin(Math.min(1, t / 1.2) * Math.PI) * 2, 17),
    quake: buffer(ctx, 2.5, (t, _i, r) => (lp2(r) * 1.5 + Math.sin(t * 2 * Math.PI * 30) * 0.5) * env(t, 0.3, 0.9), 19),
    growl: buffer(ctx, 1.0, (t, _i, r) => (Math.sin(t * 2 * Math.PI * (80 + Math.sin(t * 40) * 15)) + lp6(r) * 0.5) * env(t, 0.05, 0.4), 23),
    coin: buffer(ctx, 0.3, (t) => (Math.sin(t * 2 * Math.PI * 1568) + Math.sin(t * 2 * Math.PI * 2093) * (t > 0.08 ? 1 : 0)) * env(t, 0.002, 0.09)),
  };
}

export function makeLoops(ctx: BaseAudioContext): Record<LoopName, AudioBuffer> {
  const lpRain = lowpass(31, 0.5);
  const lpWind = lowpass(32, 0.01);
  const lpSea = lowpass(33, 0.02);
  const lpCr = lowpass(34, 0.3);
  return {
    rain: buffer(ctx, 4, (_t, _i, r) => lpRain(r) * 0.6 + (r() < 0.002 ? 0.8 : 0), 41),
    wind: buffer(ctx, 6, (t, _i, r) => lpWind(r) * (0.6 + 0.4 * Math.sin((t / 6) * Math.PI * 2)), 42),
    birds: buffer(ctx, 6, (t) => {
      let s = 0;
      for (const [start, f] of [
        [0.4, 3200],
        [0.55, 3600],
        [2.1, 2800],
        [2.25, 3300],
        [2.4, 3000],
        [4.3, 3900],
        [4.45, 3500],
      ] as const) {
        const d = t - start;
        if (d > 0 && d < 0.12) s += Math.sin(d * 2 * Math.PI * (f + Math.sin(d * 80) * 400)) * Math.sin((d / 0.12) * Math.PI);
      }
      return s;
    }),
    night: buffer(ctx, 3, (t) => {
      const ph = (t * 3.1) % 1;
      return ph < 0.35 ? Math.sin(t * 2 * Math.PI * 4400) * Math.sin((ph / 0.35) * Math.PI) * (Math.sin(t * 2 * Math.PI * 30) > 0 ? 1 : 0.2) : 0;
    }),
    sea: buffer(ctx, 8, (t, _i, r) => lpSea(r) * (0.4 + 0.6 * Math.pow(Math.sin((t / 8) * Math.PI * 2 * 1.5) * 0.5 + 0.5, 2)), 43),
    crackle: buffer(ctx, 3, (_t, _i, r) => (r() < 0.006 ? (r() * 2 - 1) * 1.5 : 0) + lpCr(r) * 0.15, 44),
  };
}
