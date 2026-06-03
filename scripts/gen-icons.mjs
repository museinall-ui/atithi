// Generate the PWA PNG app icons (192 + 512) from scratch — no native deps.
//
// Chrome's "Add to Home Screen" / install heuristic historically requires at
// least one PNG icon >=192px (SVG-only manifests sometimes don't trigger the
// install prompt). We already ship icons/icon-192.svg + icon-512.svg; this
// script renders matching PNGs (brand gradient + white "A" + underline bar)
// so the manifest can offer both formats.
//
// Pure Node: hand-rolled RGBA -> PNG encoder (zlib for IDAT). Run with:
//   node scripts/gen-icons.mjs
// Re-run any time the brand mark changes. Output: public/icons/icon-{192,512}.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// Brand gradient (matches icon-512.svg): #C8553D -> #8E2D1A, top-left to
// bottom-right.
const C0 = [0xc8, 0x55, 0x3d];
const C1 = [0x8e, 0x2d, 0x1a];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Distance from point p to segment a-b.
function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function render(N) {
  const buf = Buffer.alloc(N * N * 4);
  const cx = N / 2;
  const apex = [cx, N * 0.22];
  const baseY = N * 0.74;
  const leftFoot = [N * 0.30, baseY];
  const rightFoot = [N * 0.70, baseY];
  const stroke = N * 0.085;           // leg thickness
  const crossY = N * 0.56;
  // x of each leg at the crossbar height (for a clean crossbar)
  const tCross = (crossY - apex[1]) / (baseY - apex[1]);
  const xL = lerp(apex[0], leftFoot[0], tCross);
  const xR = lerp(apex[0], rightFoot[0], tCross);
  // underline bar (matches the SVG rect, ~85% white)
  const barX0 = N * 0.29, barX1 = N * 0.71, barY0 = N * 0.795, barY1 = N * 0.815;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5, py = y + 0.5;
      // gradient background (diagonal t)
      const t = clamp01((px + py) / (2 * N));
      let r = lerp(C0[0], C1[0], t);
      let g = lerp(C0[1], C1[1], t);
      let b = lerp(C0[2], C1[2], t);
      // white "A": two legs + crossbar, with ~1px anti-aliased edge
      const dLeg = Math.min(
        distToSeg(px, py, apex[0], apex[1], leftFoot[0], leftFoot[1]),
        distToSeg(px, py, apex[0], apex[1], rightFoot[0], rightFoot[1]),
      );
      const dCross = distToSeg(px, py, xL, crossY, xR, crossY);
      const dGlyph = Math.min(dLeg, dCross * 1.0);
      const halfW = stroke / 2;
      let aGlyph = clamp01(halfW + 0.5 - dGlyph); // 1 inside, 0 outside, AA at edge
      // crossbar is a touch thinner so the A reads well
      if (dCross < dLeg) aGlyph = clamp01(stroke * 0.42 + 0.5 - dCross);
      // underline bar coverage (soft vertical edges)
      let aBar = 0;
      if (px >= barX0 && px <= barX1) {
        aBar = clamp01(Math.min(py - (barY0 - 0.5), (barY1 + 0.5) - py)) * 0.85;
      }
      const a = Math.max(aGlyph, aBar);
      if (a > 0) {
        r = lerp(r, 255, a);
        g = lerp(g, 255, a);
        b = lerp(b, 255, a);
      }
      const i = (y * N + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(rgba, N) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // scanlines with filter byte 0
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const N of [192, 512]) {
  const png = encodePng(render(N), N);
  const file = join(OUT_DIR, `icon-${N}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
