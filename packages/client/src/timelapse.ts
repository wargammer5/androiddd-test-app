import { zipSync } from 'fflate';
import { Store } from './store.ts';

export class Timelapse {
  readonly frames: Uint8Array[] = [];
  readonly state = new Store<{ recording: boolean; count: number }>({ recording: false, count: 0 });
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly max = 180;

  constructor(private grab: () => HTMLCanvasElement | null) {}

  start(intervalMs = 1500): void {
    if (this.timer) return;
    this.frames.length = 0;
    this.state.set({ recording: true, count: 0 });
    this.timer = setInterval(() => void this.capture(), intervalMs);
    void this.capture();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.set({ recording: false, count: this.frames.length });
  }

  private async capture(): Promise<void> {
    const src = this.grab();
    if (!src) return;
    const w = 480;
    const h = Math.max(1, Math.round((src.height / Math.max(1, src.width)) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    this.frames.push(new Uint8Array(await blob.arrayBuffer()));
    if (this.frames.length > this.max) this.frames.shift();
    this.state.set({ recording: this.timer !== null, count: this.frames.length });
  }

  zip(): Uint8Array {
    const files: Record<string, Uint8Array> = {};
    this.frames.forEach((f, k) => (files[`frame_${String(k).padStart(4, '0')}.png`] = f));
    return zipSync(files, { level: 0 });
  }

  urls(): string[] {
    return this.frames.map((f) => URL.createObjectURL(new Blob([f as BlobPart], { type: 'image/png' })));
  }
}

export async function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
