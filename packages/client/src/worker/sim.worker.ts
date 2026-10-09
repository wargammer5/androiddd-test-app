import { Simulation, TICK_HZ, type ToWorker, type FromWorker, type ChunkPatch, CHUNK } from '@sotv/sim';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let speed = 1;
let acc = 0;
let last = performance.now();
let tickMs = 0;
const spare: { buf: ArrayBuffer; meta: ArrayBuffer }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let forceMini = true;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function buildLut(s: Simulation): Uint8Array {
  return s.paletteLut();
}

function start(s: Simulation): void {
  sim = s;
  acc = 0;
  last = performance.now();
  const { t0, t1 } = s.world.packAll();
  s.world.dirty.fill(0);
  post({ t: 'ready', w: s.world.w, h: s.world.h, seed: s.seed, size: s.size, t0, t1, lut: buildLut(s) }, [t0.buffer, t1.buffer]);
  spare.length = 0;
  forceMini = true;
  for (let i = 0; i < 2; i++) spare.push({ buf: new ArrayBuffer(s.entCapacityBytes()), meta: new ArrayBuffer(s.metaCapacityBytes()) });
  if (!timer) loop();
}

function collectPatches(s: Simulation): ChunkPatch[] {
  const w = s.world;
  const out: ChunkPatch[] = [];
  for (let c = 0; c < w.dirty.length; c++) {
    if (!w.dirty[c]) continue;
    w.dirty[c] = 0;
    const t0 = new Uint8Array(CHUNK * CHUNK * 4);
    const t1 = new Uint8Array(CHUNK * CHUNK * 4);
    w.packChunk(c, t0, t1);
    out.push({ c, t0, t1 });
  }
  return out;
}

function loop(): void {
  timer = setTimeout(loop, 8);
  const s = sim;
  if (!s) return;
  const now = performance.now();
  const dt = Math.min(250, now - last);
  last = now;
  if (speed > 0) acc += (dt / 1000) * TICK_HZ * speed;
  const budget = 40;
  const t0 = performance.now();
  let n = 0;
  while (acc >= 1) {
    const ts = performance.now();
    s.step();
    tickMs = tickMs * 0.9 + (performance.now() - ts) * 0.1;
    acc -= 1;
    n++;
    if (performance.now() - t0 > budget) {
      acc = Math.min(acc, 2);
      break;
    }
  }
  if (n === 0 && !s.hasPendingVisual() && !forceMini) return;
  const bufs = spare.pop();
  if (!bufs) return;
  const count = s.writeEntities(new Float32Array(bufs.buf), new Uint32Array(bufs.meta));
  const patches = collectPatches(s);
  const transfer: Transferable[] = [bufs.buf, bufs.meta];
  for (const p of patches) transfer.push(p.t0.buffer, p.t1.buffer);
  const lut = s.lutDirty ? buildLut(s) : undefined;
  s.lutDirty = false;
  const minimap = s.minimap(forceMini);
  forceMini = false;
  if (minimap) transfer.push(minimap.data.buffer);
  post({ t: 'frame', tick: s.tick, count, buf: bufs.buf, meta: bufs.meta, patches, events: s.drainEvents(), stats: s.stats(tickMs), lut, follow: s.followInfo(), minimap }, transfer);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'new':
        start(new Simulation(m.params));
        break;
      case 'load':
        start(Simulation.load(new Uint8Array(m.bytes)));
        break;
      case 'save': {
        if (!sim) break;
        const bytes = sim.save();
        post({ t: 'saved', reqId: m.reqId, bytes: bytes.buffer as ArrayBuffer }, [bytes.buffer as ArrayBuffer]);
        break;
      }
      case 'speed':
        speed = m.speed;
        break;
      case 'cmd':
        sim?.enqueue(m.cmd);
        break;
      case 'view':
        sim?.setView(m.rect);
        break;
      case 'query':
        post({ t: 'answer', reqId: m.reqId, data: sim ? sim.query(m.q) : null });
        break;
      case 'ret':
        if (sim && m.buf.byteLength === sim.entCapacityBytes()) spare.push({ buf: m.buf, meta: m.meta });
        break;
      case 'full':
        sim?.world.markAllDirty();
        break;
    }
  } catch (err) {
    post({ t: 'error', message: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
};
