/**
 * Modern tooltip PNG generator for video overlays.
 *
 * Generates clean, professional tooltip shapes with a small arrow
 * pointing toward the interaction. Matches modern SaaS UI aesthetics
 * (Linear, Figma, Vercel style).
 *
 * Design rules (from industry research):
 *   - Corner radius: 10-12px
 *   - Shadow: soft, low opacity (0.08-0.12)
 *   - Arrow: small (8-10px), subtle
 *   - Border: 1px at ~15% opacity, or none
 *   - Background: solid white or dark, 97-100% opacity
 *   - Entrance: scale(0.95→1) + opacity(0→1) over 150ms
 */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';

/**
 * Generate a modern tooltip mask PNG.
 *
 * @param {string} outputPath
 * @param {object} options
 * @param {number} options.width - total canvas width
 * @param {number} options.height - total canvas height
 * @param {number} options.cornerRadius - rounded corner radius (default 10)
 * @param {number} options.arrowSize - arrow triangle height (default 10)
 * @param {number} options.arrowWidth - arrow base width (default 18)
 * @param {'bottom-left'|'bottom-right'|'top-left'|'top-right'} options.arrowDirection
 *   Direction the arrow points TO (where the interaction is)
 * @param {number[]} options.fillColor - [R,G,B,A] (default white 97% opacity)
 * @param {number[]} options.borderColor - [R,G,B,A] (default black at 12%)
 * @param {number} options.borderWidth - (default 1)
 * @param {number} options.shadowBlur - shadow softness radius (default 10)
 * @param {number} options.shadowOpacity - shadow max alpha 0-255 (default 25)
 */
export async function generateTooltipPng(outputPath, options = {}) {
  const {
    width = 410,
    height = 420,
    cornerRadius = 10,
    arrowSize = 10,
    arrowWidth = 18,
    arrowDirection = 'bottom-left',
    fillColor = [255, 255, 255, 248],
    borderColor = [0, 0, 0, 30],
    borderWidth = 1,
    shadowBlur = 10,
    shadowOpacity = 25,
  } = options;

  const pixels = new Uint8Array(width * height * 4);

  // Body rect (inset for shadow + arrow)
  const margin = shadowBlur;
  const isTop = arrowDirection.startsWith('top');
  const isLeft = arrowDirection.endsWith('left');

  const bx0 = margin;
  const bx1 = width - margin - 1;
  const by0 = isTop ? margin + arrowSize : margin;
  const by1 = isTop ? height - margin - 1 : height - margin - arrowSize - 1;

  // Arrow tip and base
  let arrowTipX, arrowTipY, arrowBase1X, arrowBase1Y, arrowBase2X, arrowBase2Y;
  if (isTop && isLeft) {
    arrowTipX = bx0 + cornerRadius + 8;
    arrowTipY = by0 - arrowSize;
    arrowBase1X = arrowTipX - 2;
    arrowBase1Y = by0;
    arrowBase2X = arrowTipX + arrowWidth;
    arrowBase2Y = by0;
  } else if (isTop && !isLeft) {
    arrowTipX = bx1 - cornerRadius - 8;
    arrowTipY = by0 - arrowSize;
    arrowBase1X = arrowTipX - arrowWidth;
    arrowBase1Y = by0;
    arrowBase2X = arrowTipX + 2;
    arrowBase2Y = by0;
  } else if (!isTop && isLeft) {
    arrowTipX = bx0 + cornerRadius + 8;
    arrowTipY = by1 + arrowSize;
    arrowBase1X = arrowTipX - 2;
    arrowBase1Y = by1;
    arrowBase2X = arrowTipX + arrowWidth;
    arrowBase2Y = by1;
  } else {
    arrowTipX = bx1 - cornerRadius - 8;
    arrowTipY = by1 + arrowSize;
    arrowBase1X = arrowTipX - arrowWidth;
    arrowBase1Y = by1;
    arrowBase2X = arrowTipX + 2;
    arrowBase2Y = by1;
  }

  const r = cornerRadius;

  function inRoundedRect(x, y) {
    if (x >= bx0 + r && x <= bx1 - r && y >= by0 && y <= by1) return true;
    if (x >= bx0 && x <= bx1 && y >= by0 + r && y <= by1 - r) return true;
    if (dist(x, y, bx0 + r, by0 + r) <= r) return true;
    if (dist(x, y, bx1 - r, by0 + r) <= r) return true;
    if (dist(x, y, bx0 + r, by1 - r) <= r) return true;
    if (dist(x, y, bx1 - r, by1 - r) <= r) return true;
    return false;
  }

  function inArrow(x, y) {
    return pointInTriangle(x, y, arrowBase1X, arrowBase1Y, arrowBase2X, arrowBase2Y, arrowTipX, arrowTipY);
  }

  // Distance to rounded rect edge (for border rendering)
  function distToEdge(x, y) {
    // Simple: distance to nearest edge of the bounding rect
    const dL = x - bx0; const dR = bx1 - x;
    const dT = y - by0; const dB = by1 - y;
    let minD = Math.min(dL, dR, dT, dB);
    // Corner distance correction
    if (x < bx0 + r && y < by0 + r) minD = r - dist(x, y, bx0 + r, by0 + r);
    if (x > bx1 - r && y < by0 + r) minD = r - dist(x, y, bx1 - r, by0 + r);
    if (x < bx0 + r && y > by1 - r) minD = r - dist(x, y, bx0 + r, by1 - r);
    if (x > bx1 - r && y > by1 - r) minD = r - dist(x, y, bx1 - r, by1 - r);
    return minD;
  }

  // Precompute: for shadow, find distance to shape for each pixel
  // Use a simple approach: distance to nearest shape pixel, approximated
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const insideBody = inRoundedRect(x, y);
      const insideArrow = inArrow(x, y);

      if (insideBody || insideArrow) {
        const edgeDist = insideBody ? distToEdge(x, y) : -1;

        // Border: thin line at the edge of the body
        if (insideBody && edgeDist >= 0 && edgeDist < borderWidth) {
          setPixel(pixels, idx, borderColor);
        } else if (insideArrow && !insideBody) {
          // Arrow body — check if near edge
          const aDist = distToTriangleEdge(x, y, arrowBase1X, arrowBase1Y, arrowBase2X, arrowBase2Y, arrowTipX, arrowTipY);
          if (aDist < borderWidth) {
            setPixel(pixels, idx, borderColor);
          } else {
            setPixel(pixels, idx, fillColor);
          }
        } else {
          setPixel(pixels, idx, fillColor);
        }
      } else {
        // Shadow: soft gaussian-like falloff
        let minDist = shadowBlur + 1;
        // Sample nearby pixels for distance to shape (approximate with grid)
        for (let sy = -shadowBlur; sy <= shadowBlur; sy += 2) {
          for (let sx = -shadowBlur; sx <= shadowBlur; sx += 2) {
            if (inRoundedRect(x + sx, y + sy) || inArrow(x + sx, y + sy)) {
              const d = Math.sqrt(sx * sx + sy * sy);
              if (d < minDist) minDist = d;
            }
          }
        }
        if (minDist <= shadowBlur) {
          // Smooth falloff (gaussian-ish)
          const t = minDist / shadowBlur;
          const alpha = Math.round(shadowOpacity * (1 - t * t));
          if (alpha > 0) {
            pixels[idx] = 0;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = alpha;
          }
        }
      }
    }
  }

  const png = encodePng(width, height, pixels);
  await writeFile(outputPath, png);
}

function setPixel(buf, idx, c) { buf[idx] = c[0]; buf[idx+1] = c[1]; buf[idx+2] = c[2]; buf[idx+3] = c[3]; }
function dist(x1,y1,x2,y2) { return Math.sqrt((x1-x2)**2+(y1-y2)**2); }

function pointInTriangle(px,py,x1,y1,x2,y2,x3,y3) {
  const d1 = (px-x2)*(y1-y2)-(x1-x2)*(py-y2);
  const d2 = (px-x3)*(y2-y3)-(x2-x3)*(py-y3);
  const d3 = (px-x1)*(y3-y1)-(x3-x1)*(py-y1);
  return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));
}

function distToTriangleEdge(px,py,x1,y1,x2,y2,x3,y3) {
  return Math.min(
    distToSeg(px,py,x1,y1,x2,y2),
    distToSeg(px,py,x2,y2,x3,y3),
    distToSeg(px,py,x3,y3,x1,y1)
  );
}

function distToSeg(px,py,x1,y1,x2,y2) {
  const dx=x2-x1,dy=y2-y1,lenSq=dx*dx+dy*dy;
  if(lenSq===0)return dist(px,py,x1,y1);
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/lenSq));
  return dist(px,py,x1+t*dx,y1+t*dy);
}

// PNG encoder (same as bubble.js)
function encodePng(w,h,rgba) {
  const rowSize=w*4+1;
  const raw=Buffer.alloc(h*rowSize);
  for(let y=0;y<h;y++){
    const ro=y*rowSize;
    raw[ro]=0;
    const so=y*w*4;
    for(let i=0;i<w*4;i++) raw[ro+1+i]=rgba[so+i];
  }
  const compressed=deflateSync(raw);
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
  ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([sig,pngChunk('IHDR',ihdr),pngChunk('IDAT',compressed),pngChunk('IEND',Buffer.alloc(0))]);
}

function pngChunk(type,data) {
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const td=Buffer.concat([Buffer.from(type,'ascii'),data]);
  const c=crc32(td);const cb=Buffer.alloc(4);cb.writeUInt32BE(c>>>0,0);
  return Buffer.concat([len,td,cb]);
}

const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c;}return t;})();
function crc32(buf){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=crcTable[(c^buf[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
