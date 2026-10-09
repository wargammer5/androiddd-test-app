export class Camera {
  x = 0;
  y = 0;
  zoom = 4;
  minZoom = 0.5;
  maxZoom = 48;
  viewW = 1;
  viewH = 1;
  worldW = 1;
  worldH = 1;

  setWorld(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
    this.x = w / 2;
    this.y = h / 2;
    this.fit();
  }

  fit(): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.viewW / this.worldW, this.viewH / this.worldH) * 0.95);
    this.minZoom = Math.min(1, this.zoom * 0.8);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [this.x + (sx - this.viewW / 2) / this.zoom, this.y + (sy - this.viewH / 2) / this.zoom];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.viewW / 2, (wy - this.y) * this.zoom + this.viewH / 2];
  }

  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clamp();
  }

  clamp(): void {
    this.x = Math.max(0, Math.min(this.worldW, this.x));
    this.y = Math.max(0, Math.min(this.worldH, this.y));
  }

  visible(): { x0: number; y0: number; x1: number; y1: number } {
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.viewW, this.viewH);
    return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
  }
}
