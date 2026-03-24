/**
 * Speech bubble PNG generator.
 *
 * Generates rounded-rectangle speech bubbles with a triangular tail
 * pointing toward the interaction area. Pure Node.js — no external deps.
 *
 * Uses manual PNG encoding with Node's built-in zlib.
 */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

/**
 * Generate a speech bubble mask PNG.
 *
 * @param {string} outputPath - where to save the PNG
 * @param {object} options
 * @param {number} options.width - bubble width (including tail area)
 * @param {number} options.height - bubble height (including tail area)
 * @param {number} options.cornerRadius - rounded corner radius (default 16)
 * @param {number} options.tailSize - tail triangle size (default 24)
 * @param {'bottom-left'|'bottom-right'|'top-left'|'top-right'} options.tailDirection
 *   Where the tail points TO (the interaction is in this direction)
 * @param {number[]} options.fillColor - [R, G, B, A] bubble fill (default white)
 * @param {number[]} options.borderColor - [R, G, B, A] border (default dark gray)
 * @param {number} options.borderWidth - border thickness (default 3)
 * @param {number[]} options.shadowColor - [R, G, B, A] outer shadow (default black@0.3)
 * @param {number} options.shadowSize - shadow spread (default 4)
 */
export async function generateBubblePng(outputPath, options = {}) {
  const {
    width = 420,
    height = 420,
    cornerRadius = 16,
    tailSize = 28,
    tailDirection = 'bottom-left',
    fillColor = [255, 255, 255, 245],
    borderColor = [60, 60, 60, 230],
    borderWidth = 3,
    shadowColor = [0, 0, 0, 80],
    shadowSize = 5,
  } = options;

  // The bubble body occupies most of the canvas.
  // The tail extends from one edge toward a corner.
  const pixels = new Uint8Array(width * height * 4); // RGBA

  // Define bubble body rect (inset from edges to leave room for tail + shadow)
  const bodyLeft = shadowSize;
  const bodyTop = shadowSize;
  const bodyRight = width - shadowSize - 1;
  const bodyBottom = height - shadowSize - tailSize - 1;

  // Adjust body position based on tail direction
  let bx0, by0, bx1, by1;
  let tailTipX, tailTipY, tailBaseX1, tailBaseY1, tailBaseX2, tailBaseY2;

  if (tailDirection === 'bottom-left' || tailDirection === 'bottom-right') {
    bx0 = bodyLeft;
    by0 = bodyTop;
    bx1 = bodyRight;
    by1 = bodyBottom;

    if (tailDirection === 'bottom-left') {
      tailBaseX1 = bx0 + cornerRadius + 10;
      tailBaseX2 = tailBaseX1 + tailSize;
      tailBaseY1 = by1;
      tailBaseY2 = by1;
      tailTipX = bx0 + cornerRadius;
      tailTipY = by1 + tailSize;
    } else {
      tailBaseX1 = bx1 - cornerRadius - tailSize - 10;
      tailBaseX2 = tailBaseX1 + tailSize;
      tailBaseY1 = by1;
      tailBaseY2 = by1;
      tailTipX = bx1 - cornerRadius;
      tailTipY = by1 + tailSize;
    }
  } else {
    // top-left or top-right: tail goes up
    bx0 = bodyLeft;
    by0 = bodyTop + tailSize;
    bx1 = bodyRight;
    by1 = height - shadowSize - 1;

    if (tailDirection === 'top-left') {
      tailBaseX1 = bx0 + cornerRadius + 10;
      tailBaseX2 = tailBaseX1 + tailSize;
      tailBaseY1 = by0;
      tailBaseY2 = by0;
      tailTipX = bx0 + cornerRadius;
      tailTipY = by0 - tailSize;
    } else {
      tailBaseX1 = bx1 - cornerRadius - tailSize - 10;
      tailBaseX2 = tailBaseX1 + tailSize;
      tailBaseY1 = by0;
      tailBaseY2 = by0;
      tailTipX = bx1 - cornerRadius;
      tailTipY = by0 - tailSize;
    }
  }

  const r = cornerRadius;

  // Helper: check if point is inside the rounded rect body
  function inRoundedRect(x, y) {
    // Check main body (without corners)
    if (x >= bx0 + r && x <= bx1 - r && y >= by0 && y <= by1) return true;
    if (x >= bx0 && x <= bx1 && y >= by0 + r && y <= by1 - r) return true;
    // Check corners (circles)
    if (dist(x, y, bx0 + r, by0 + r) <= r) return true; // top-left
    if (dist(x, y, bx1 - r, by0 + r) <= r) return true; // top-right
    if (dist(x, y, bx0 + r, by1 - r) <= r) return true; // bottom-left
    if (dist(x, y, bx1 - r, by1 - r) <= r) return true; // bottom-right
    return false;
  }

  // Helper: check if point is inside the tail triangle
  function inTail(x, y) {
    return pointInTriangle(x, y, tailBaseX1, tailBaseY1, tailBaseX2, tailBaseY2, tailTipX, tailTipY);
  }

  // Helper: distance from rounded rect border (for border/shadow rendering)
  function distToRoundedRectEdge(x, y) {
    if (inRoundedRect(x, y)) {
      // Inside: distance to nearest edge (positive = inside)
      const dLeft = x - bx0;
      const dRight = bx1 - x;
      const dTop = y - by0;
      const dBottom = by1 - y;
      return Math.min(dLeft, dRight, dTop, dBottom);
    }
    return -1;
  }

  // Render each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const insideBody = inRoundedRect(x, y);
      const insideTail = inTail(x, y);
      const inside = insideBody || insideTail;

      if (inside) {
        // Check if this pixel is near the edge (border zone)
        const edgeDist = distToRoundedRectEdge(x, y);
        const isBorder = (edgeDist >= 0 && edgeDist < borderWidth) ||
                         (insideTail && !insideBody);

        if (insideTail && !insideBody) {
          // Tail area — use border color for the outline, fill for inside
          const tailEdgeDist = distToTriangleEdge(x, y, tailBaseX1, tailBaseY1, tailBaseX2, tailBaseY2, tailTipX, tailTipY);
          if (tailEdgeDist < borderWidth) {
            setPixel(pixels, idx, borderColor);
          } else {
            setPixel(pixels, idx, fillColor);
          }
        } else if (edgeDist >= 0 && edgeDist < borderWidth) {
          setPixel(pixels, idx, borderColor);
        } else {
          setPixel(pixels, idx, fillColor);
        }
      } else {
        // Outside — check shadow zone
        let shadowDist = Infinity;
        // Distance to nearest point on rounded rect
        for (let dy = -shadowSize; dy <= shadowSize; dy++) {
          for (let dx = -shadowSize; dx <= shadowSize; dx++) {
            if (inRoundedRect(x + dx, y + dy) || inTail(x + dx, y + dy)) {
              shadowDist = Math.min(shadowDist, Math.sqrt(dx * dx + dy * dy));
            }
          }
        }
        if (shadowDist <= shadowSize) {
          const alpha = Math.round(shadowColor[3] * (1 - shadowDist / shadowSize));
          pixels[idx] = shadowColor[0];
          pixels[idx + 1] = shadowColor[1];
          pixels[idx + 2] = shadowColor[2];
          pixels[idx + 3] = alpha;
        }
        // else: transparent (already 0)
      }
    }
  }

  // Encode as PNG
  const png = encodePng(width, height, pixels);
  await writeFile(outputPath, png);
}

function setPixel(pixels, idx, color) {
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
  pixels[idx + 3] = color[3];
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// Barycentric method for point-in-triangle
function pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = sign(px, py, x1, y1, x2, y2);
  const d2 = sign(px, py, x2, y2, x3, y3);
  const d3 = sign(px, py, x3, y3, x1, y1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function sign(px, py, x1, y1, x2, y2) {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

// Distance from point to nearest edge of triangle (approximate)
function distToTriangleEdge(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = distToSegment(px, py, x1, y1, x2, y2);
  const d2 = distToSegment(px, py, x2, y2, x3, y3);
  const d3 = distToSegment(px, py, x3, y3, x1, y1);
  return Math.min(d1, d2, d3);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

// ============================================================
// Minimal PNG encoder (no dependencies)
// ============================================================

function encodePng(width, height, rgbaPixels) {
  // Build raw scanlines (filter byte 0 = None for each row)
  const rowSize = width * 4 + 1; // +1 for filter byte
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowSize;
    raw[rowOff] = 0; // filter: None
    rgbaPixels.copyWithin
    const srcOff = y * width * 4;
    for (let i = 0; i < width * 4; i++) {
      raw[rowOff + 1 + i] = rgbaPixels[srcOff + i];
    }
  }

  const compressed = deflateSync(raw);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = pngChunk('IHDR', ihdr);
  const idatChunk = pngChunk('IDAT', compressed);
  const iendChunk = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(typeAndData);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([len, typeAndData, crcBuf]);
}

// CRC32 for PNG
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
