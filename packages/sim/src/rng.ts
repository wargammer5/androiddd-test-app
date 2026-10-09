export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private s = new Uint32Array(4);

  constructor(seed: number | string = 1) {
    this.seed(typeof seed === 'string' ? hashString(seed) : seed >>> 0);
  }

  seed(seed: number): void {
    const s = this.s;
    s[0] = 0x9e3779b9;
    s[1] = 0x243f6a88;
    s[2] = 0xb7e15162;
    s[3] = seed >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const s = this.s;
    const t = (((s[0]! + s[1]!) >>> 0) + s[3]!) >>> 0;
    s[3] = (s[3]! + 1) >>> 0;
    s[0] = s[1]! ^ (s[1]! >>> 9);
    s[1] = (s[2]! + (s[2]! << 3)) >>> 0;
    s[2] = ((s[2]! << 21) | (s[2]! >>> 11)) >>> 0;
    s[2] = (s[2]! + t) >>> 0;
    return t;
  }

  float(): number {
    return this.nextU32() / 4294967296;
  }

  int(n: number): number {
    return n <= 0 ? 0 : Math.floor(this.float() * n);
  }

  range(a: number, b: number): number {
    return a + this.float() * (b - a);
  }

  irange(a: number, b: number): number {
    return a + this.int(b - a + 1);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }

  weighted(weights: readonly number[]): number {
    let sum = 0;
    for (const w of weights) sum += Math.max(0, w);
    if (sum <= 0) return this.int(weights.length);
    let r = this.float() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]!);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  }

  fork(salt: number): Rng {
    const r = new Rng(0);
    r.s[0] = this.s[0]! ^ salt;
    r.s[1] = this.s[1]!;
    r.s[2] = this.s[2]! ^ Math.imul(salt, 0x85ebca6b);
    r.s[3] = this.s[3]!;
    for (let i = 0; i < 8; i++) r.nextU32();
    return r;
  }

  getState(): Uint32Array {
    return this.s.slice();
  }

  setState(st: ArrayLike<number>): void {
    for (let i = 0; i < 4; i++) this.s[i] = st[i]! >>> 0;
  }
}
