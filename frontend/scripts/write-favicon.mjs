import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 32;

function sdRoundRect(px, py, w, h, r) {
  const x = Math.abs(px - w / 2);
  const y = Math.abs(py - h / 2);
  const qx = x - (w / 2 - r);
  const qy = y - (h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function coverage(px, py) {
  let bg = 0;
  let red = 0;
  let white = 0;
  const n = 4;
  for (let oy = 0; oy < n; oy++) {
    for (let ox = 0; ox < n; ox++) {
      const x = px + (ox + 0.5) / n;
      const y = py + (oy + 0.5) / n;
      if (sdRoundRect(x, y, SIZE, SIZE, 8) > 0) continue;
      bg += 1;
      const dx = x - 16;
      const dy = y - 12;
      if (dx * dx + dy * dy <= 4.5 * 4.5) red += 1;
      const line = Math.abs(y - 22.5);
      if (x >= 8 && x <= 24 && line <= 1.25) white += 1;
    }
  }
  const samples = n * n;
  if (bg === 0) return [0, 0, 0, 0];
  const a = bg / samples;
  if (white > 0) return [248, 250, 252, Math.round(255 * (white / samples))];
  if (red > 0) return [220, 0, 0, Math.round(255 * Math.max(a, red / samples))];
  return [15, 23, 42, Math.round(255 * a)];
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = coverage(x, y);
    const i = (y * SIZE + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const xor = Buffer.alloc(SIZE * SIZE * 4);
const andMask = Buffer.alloc(SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const src = ((SIZE - 1 - y) * SIZE + x) * 4;
    const dst = (y * SIZE + x) * 4;
    const a = rgba[src + 3];
    xor[dst] = rgba[src + 2];
    xor[dst + 1] = rgba[src + 1];
    xor[dst + 2] = rgba[src];
    xor[dst + 3] = a;
    if (a < 128) andMask[y * 4 + (x >> 3)] |= 0x80 >> (x & 7);
  }
}

const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0);
header.writeInt32LE(SIZE, 4);
header.writeInt32LE(SIZE * 2, 8);
header.writeUInt16LE(1, 12);
header.writeUInt16LE(32, 14);
header.writeUInt32LE(xor.length + andMask.length, 20);

const image = Buffer.concat([header, xor, andMask]);
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = SIZE;
ico[7] = SIZE;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(image.length, 14);
ico.writeUInt32LE(22, 18);

writeFileSync(new URL('../assets/images/favicon.png', import.meta.url), png);
writeFileSync(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([ico, image]));
console.log('wrote favicon png', png.length, 'ico', ico.length + image.length);
