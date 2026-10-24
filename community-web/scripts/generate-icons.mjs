/**
 * Generates icon-192.png and icon-512.png in public/.
 * Pure Node.js — no external image deps.
 * Design: black and Bitcoin orange with a geometric 21 monogram.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
mkdirSync(publicDir, { recursive: true });

// ── PNG helpers ───────────────────────────────────────────────────────────────

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const crc32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

const chunk = (type, data) => {
  const t = Buffer.from(type, "ascii");
  const len = u32(data.length);
  const crc = u32(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

const buildPNG = (pixels, w, h) => {
  // pixels: Uint8Array of RGBA, row-major
  const scanlines = [];
  for (let y = 0; y < h; y++) {
    scanlines.push(0); // filter type: None
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      scanlines.push(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
    }
  }
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])]);
  const idat = deflateSync(Buffer.from(scanlines));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

// ── Pixel drawing ─────────────────────────────────────────────────────────────

const setPixel = (buf, w, x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  // Alpha blend over existing pixel
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[i]     = Math.round((r * sa + buf[i]     * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
};

const fillRect = (buf, w, x0, y0, x1, y1, r, g, b, a = 255) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      setPixel(buf, w, x, y, r, g, b, a);
};

// Anti-aliased circle fill
const fillCircle = (buf, w, cx, cy, radius, r, g, b) => {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2) setPixel(buf, w, x, y, r, g, b, 255);
    }
  }
};

// Anti-aliased rounded rect
const fillRoundedRect = (buf, w, x0, y0, x1, y1, rad, r, g, b) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Corner check
      const inCorner =
        (x < x0 + rad && y < y0 + rad) ||
        (x > x1 - rad && y < y0 + rad) ||
        (x < x0 + rad && y > y1 - rad) ||
        (x > x1 - rad && y > y1 - rad);
      if (!inCorner) { setPixel(buf, w, x, y, r, g, b); continue; }
      // Round corner
      let cx, cy;
      if (x < x0 + rad && y < y0 + rad) { cx = x0 + rad; cy = y0 + rad; }
      else if (x > x1 - rad && y < y0 + rad) { cx = x1 - rad; cy = y0 + rad; }
      else if (x < x0 + rad && y > y1 - rad) { cx = x0 + rad; cy = y1 - rad; }
      else { cx = x1 - rad; cy = y1 - rad; }
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) setPixel(buf, w, x, y, r, g, b);
    }
  }
};

// Draw a thick horizontal rectangle (for ₿ symbol strokes)
const hline = (buf, w, x0, x1, y, thick, r, g, b) => {
  fillRect(buf, w, x0, y - thick, x1, y + thick, r, g, b);
};
const vline = (buf, w, x, y0, y1, thick, r, g, b) => {
  fillRect(buf, w, x - thick, y0, x + thick, y1, r, g, b);
};

// ── Render icon ───────────────────────────────────────────────────────────────

const renderIcon = (size) => {
  const buf = new Uint8Array(size * size * 4);
  const dark = [8, 9, 11], orange = [247, 147, 26];
  fillRect(buf, size, 0, 0, size - 1, size - 1, ...dark);
  const scale = size / 96;
  fillRoundedRect(buf, size, Math.round(14 * scale), Math.round(14 * scale), Math.round(82 * scale), Math.round(82 * scale), Math.round(12 * scale), ...orange);
  const line = (x0, y0, x1, y1) => fillRect(buf, size,
    Math.round((Math.min(x0, x1) - 2.5) * scale), Math.round((Math.min(y0, y1) - 2.5) * scale),
    Math.round((Math.max(x0, x1) + 2.5) * scale), Math.round((Math.max(y0, y1) + 2.5) * scale), ...dark);
  line(27, 37, 27, 32); line(27, 32, 49, 32); line(49, 32, 49, 45);
  line(29, 45, 49, 45); line(29, 45, 29, 64); line(29, 64, 51, 64);
  line(62, 32, 68, 32); line(68, 32, 68, 64);
  return buildPNG(buf, size, size);
};

writeFileSync(join(publicDir, "icon-192.png"), renderIcon(192));
writeFileSync(join(publicDir, "icon-512.png"), renderIcon(512));
console.log("Icons generated: public/icon-192.png, public/icon-512.png");
