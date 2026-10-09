import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

export const SAVE_MAGIC = 0x56544f53;
export const SAVE_VERSION = 1;

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

export function crc32(buf: Uint8Array, start = 0): number {
  let c = -1;
  for (let i = start; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 255]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export type Section = { tag: string; data: Uint8Array };

export class SaveError extends Error {
  constructor(
    message: string,
    readonly code: 'magic' | 'crc' | 'version' | 'truncated' | 'format',
  ) {
    super(message);
  }
}

export class SaveWriter {
  private sections: Section[] = [];

  json(tag: string, v: unknown): void {
    this.sections.push({ tag, data: strToU8(JSON.stringify(v)) });
  }

  array(tag: string, a: ArrayBufferView): void {
    this.sections.push({ tag, data: new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice() });
  }

  finish(): Uint8Array {
    const parts: Uint8Array[] = [];
    let total = 12;
    for (const s of this.sections) {
      const comp = deflateSync(s.data, { level: 6 });
      const tagB = strToU8(s.tag);
      const head = new Uint8Array(2 + tagB.length + 8);
      const dv = new DataView(head.buffer);
      dv.setUint16(0, tagB.length, true);
      head.set(tagB, 2);
      dv.setUint32(2 + tagB.length, s.data.length, true);
      dv.setUint32(6 + tagB.length, comp.length, true);
      parts.push(head, comp);
      total += head.length + comp.length;
    }
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, SAVE_MAGIC, true);
    dv.setUint16(4, SAVE_VERSION, true);
    let o = 12;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    dv.setUint32(8, crc32(out, 12), true);
    return out;
  }
}

export class SaveReader {
  readonly version: number;
  readonly sections = new Map<string, Uint8Array>();

  constructor(bytes: Uint8Array) {
    if (bytes.length < 12) throw new SaveError('file too short', 'truncated');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== SAVE_MAGIC) throw new SaveError('not a Sotvorenie save', 'magic');
    this.version = dv.getUint16(4, true);
    if (this.version > SAVE_VERSION) throw new SaveError(`save version ${this.version} is newer than supported ${SAVE_VERSION}`, 'version');
    const crc = dv.getUint32(8, true);
    if (crc32(bytes, 12) !== crc) throw new SaveError('save is corrupted (checksum mismatch)', 'crc');
    let o = 12;
    while (o < bytes.length) {
      if (o + 2 > bytes.length) throw new SaveError('truncated header', 'truncated');
      const tl = dv.getUint16(o, true);
      const tag = strFromU8(bytes.subarray(o + 2, o + 2 + tl));
      const rawLen = dv.getUint32(o + 2 + tl, true);
      const compLen = dv.getUint32(o + 6 + tl, true);
      o += 10 + tl;
      if (o + compLen > bytes.length) throw new SaveError('truncated section ' + tag, 'truncated');
      const data = inflateSync(bytes.subarray(o, o + compLen));
      if (data.length !== rawLen) throw new SaveError('section size mismatch ' + tag, 'format');
      this.sections.set(tag, data);
      o += compLen;
    }
  }

  has(tag: string): boolean {
    return this.sections.has(tag);
  }

  json<T>(tag: string): T {
    const d = this.sections.get(tag);
    if (!d) throw new SaveError('missing section ' + tag, 'format');
    return JSON.parse(strFromU8(d)) as T;
  }

  jsonOr<T>(tag: string, fallback: T): T {
    return this.sections.has(tag) ? this.json<T>(tag) : fallback;
  }

  into(tag: string, target: ArrayBufferView): boolean {
    const d = this.sections.get(tag);
    if (!d) return false;
    const dst = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    if (d.length !== dst.length) throw new SaveError('array size mismatch ' + tag, 'format');
    dst.set(d);
    return true;
  }

  raw(tag: string): Uint8Array | undefined {
    return this.sections.get(tag);
  }
}

export type Migration = (r: SaveReader) => void;

export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(r: SaveReader): void {
  for (let v = r.version; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (m) m(r);
  }
}
