export interface Burst {
  x: number;
  y: number;
  n: number;
  color: [number, number, number];
  color2?: [number, number, number];
  speed: number;
  life: number;
  size: number;
  gravity?: number;
  rise?: number;
}

export class Particles {
  readonly cap = 3000;
  readonly data = new Float32Array(this.cap * 8);
  private vx = new Float32Array(this.cap);
  private vy = new Float32Array(this.cap);
  private life = new Float32Array(this.cap);
  private maxLife = new Float32Array(this.cap);
  private grav = new Float32Array(this.cap);
  count = 0;

  burst(b: Burst): void {
    for (let k = 0; k < b.n && this.count < this.cap; k++) {
      const i = this.count++;
      const a = Math.random() * Math.PI * 2;
      const sp = b.speed * (0.3 + Math.random() * 0.7);
      this.vx[i] = Math.cos(a) * sp;
      this.vy[i] = Math.sin(a) * sp - (b.rise ?? 0);
      this.life[i] = this.maxLife[i] = b.life * (0.6 + Math.random() * 0.6);
      this.grav[i] = b.gravity ?? 0;
      const c = b.color2 && Math.random() < 0.5 ? b.color2 : b.color;
      const o = i * 8;
      this.data[o] = b.x + (Math.random() - 0.5) * 0.5;
      this.data[o + 1] = b.y + (Math.random() - 0.5) * 0.5;
      this.data[o + 2] = b.size * (0.6 + Math.random() * 0.8);
      this.data[o + 3] = 0;
      this.data[o + 4] = c[0] / 255;
      this.data[o + 5] = c[1] / 255;
      this.data[o + 6] = c[2] / 255;
      this.data[o + 7] = 1;
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i]! - dt;
      if (l <= 0) continue;
      const o = i * 8;
      const d = n * 8;
      if (d !== o) {
        this.data.copyWithin(d, o, o + 8);
        this.vx[n] = this.vx[i]!;
        this.vy[n] = this.vy[i]!;
        this.maxLife[n] = this.maxLife[i]!;
        this.grav[n] = this.grav[i]!;
      }
      this.life[n] = l;
      this.vy[n] = this.vy[n]! + this.grav[n]! * dt;
      this.vx[n] = this.vx[n]! * (1 - dt * 1.5);
      this.vy[n] = this.vy[n]! * (1 - dt * 1.5);
      this.data[d] = this.data[d]! + this.vx[n]! * dt;
      this.data[d + 1] = this.data[d + 1]! + this.vy[n]! * dt;
      this.data[d + 7] = Math.min(1, (l / this.maxLife[n]!) * 1.6);
      n++;
    }
    this.count = n;
  }
}

export const BURSTS: Record<string, (x: number, y: number) => Burst[]> = {
  explosion: (x, y) => [
    { x, y, n: 90, color: [255, 200, 80], color2: [255, 90, 30], speed: 9, life: 0.9, size: 0.45, gravity: 2 },
    { x, y, n: 40, color: [90, 86, 80], speed: 3, life: 2.2, size: 0.8, rise: 1.5 },
  ],
  nuke: (x, y) => [
    { x, y, n: 400, color: [255, 240, 180], color2: [255, 120, 40], speed: 30, life: 1.6, size: 0.9 },
    { x, y, n: 160, color: [110, 100, 90], speed: 8, life: 4, size: 1.6, rise: 3 },
  ],
  lightning: (x, y) => [{ x, y, n: 30, color: [220, 230, 255], color2: [255, 255, 160], speed: 6, life: 0.4, size: 0.3 }],
  magic: (x, y) => [{ x, y, n: 40, color: [200, 160, 255], color2: [255, 240, 160], speed: 2.5, life: 1.4, size: 0.3, rise: 1.2 }],
  splash: (x, y) => [{ x, y, n: 30, color: [170, 210, 255], speed: 4, life: 0.6, size: 0.3, gravity: 6 }],
  fire: (x, y) => [{ x, y, n: 25, color: [255, 160, 40], color2: [255, 80, 20], speed: 1.5, life: 1, size: 0.35, rise: 2 }],
  smoke: (x, y) => [{ x, y, n: 20, color: [80, 76, 72], speed: 1, life: 2.5, size: 0.9, rise: 1 }],
  blood: (x, y) => [{ x, y, n: 10, color: [180, 30, 30], speed: 2, life: 0.5, size: 0.2, gravity: 4 }],
  coins: (x, y) => [{ x, y, n: 20, color: [255, 210, 60], speed: 3, life: 1, size: 0.25, gravity: 5, rise: 2 }],
};

export const POWER_BURST: Record<string, string> = {
  bomb: 'explosion',
  nuke: 'nuke',
  comet: 'explosion',
  volcano: 'explosion',
  lightning: 'lightning',
  bless: 'magic',
  heal: 'magic',
  prophet: 'magic',
  inspire: 'magic',
  curse: 'smoke',
  water: 'splash',
  rain: 'splash',
  fire: 'fire',
  lava: 'fire',
  smite: 'blood',
  gift: 'coins',
};

export const EVENT_BURST: Record<string, string> = {
  comet: 'explosion',
  volcano: 'explosion',
  earthquake: 'smoke',
  capture: 'fire',
  religion: 'magic',
  hero: 'magic',
  wildfire: 'fire',
  death: 'smoke',
};
