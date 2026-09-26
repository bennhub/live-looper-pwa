// One-off dev-time script: generates placeholder PWA icons (no dependencies).
// Draws a simple "loop" mark (a ring with a gap, like a loop pedal indicator)
// on a dark rounded square. Replace with real branding later.
//
// Run with: node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";

const OUT_DIR = new URL("../public/icons/", import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const BG = [0x11, 0x14, 0x1a]; // near-black
const RING = [0xff, 0x6a, 0x1a]; // orange accent (matches "overdubbing" state color)

/** @param {number} size @param {boolean} maskable */
function renderIcon(size, maskable) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons need extra safe-area padding (content within the inner ~80%).
  const radius = size * (maskable ? 0.30 : 0.36);
  const thickness = size * (maskable ? 0.075 : 0.09);
  const gapAngle = Math.PI / 4; // opening in the ring, suggesting a loop/arrow

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx); // -PI..PI

      let r = BG[0], g = BG[1], b = BG[2];
      const onRing = dist > radius - thickness / 2 && dist < radius + thickness / 2;
      const inGap = angle > Math.PI / 2 - gapAngle / 2 && angle < Math.PI / 2 + gapAngle / 2;
      if (onRing && !inGap) {
        r = RING[0]; g = RING[1]; b = RING[2];
      }
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // raw scanlines, each prefixed with filter type 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, x) => {
      raw[y * (size * 4 + 1) + 1 + x] = v;
    });
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
];

for (const t of targets) {
  const png = encodePng(t.size, renderIcon(t.size, t.maskable));
  writeFileSync(new URL(t.name, OUT_DIR), png);
  console.log(`wrote public/icons/${t.name} (${t.size}x${t.size})`);
}
