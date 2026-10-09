import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 16;
  const put = (x, y, c) => {
    for (let yy = Math.floor(y * s); yy < Math.floor((y + 1) * s); yy++)
      for (let xx = Math.floor(x * s); xx < Math.floor((x + 1) * s); xx++) {
        const o = (yy * size + xx) * 4;
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = 255;
      }
  };
  const map = [
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSBBGGBSSSSSS',
    'SSSSBGGGGGBSSSSS',
    'SSSBGGTGGGGBSSSS',
    'SSBGGTTTGGGGBSSS',
    'SSBGGGTGGMMGBSSS',
    'SSBGGGGGMMMMBSSS',
    'SSSBGGGGGGMGBSSS',
    'SSSBGGHGGGGBSSSS',
    'SSSSBGGGGGBSSSSS',
    'SSSSSBBGGBSSSSSS',
    'SSSSSSSBBSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
  ];
  const pal = { S: [36, 82, 140], B: [222, 205, 140], G: [104, 168, 72], T: [44, 104, 50], M: [140, 136, 128], H: [232, 184, 74] };
  map.forEach((row, y) => [...row].forEach((ch, x) => put(x, y, pal[ch])));
  for (let x = 0; x < 16; x++) {
    put(x, 0, [16, 40, 80]);
    put(x, 15, [16, 40, 80]);
    put(0, x, [16, 40, 80]);
    put(15, x, [16, 40, 80]);
  }
  return px;
}
