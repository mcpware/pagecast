/**
 * Remotion renderer — shells out to `npx remotion render` for cinematic zoom exports.
 *
 * This is the "production quality" pipeline:
 *   raw .webm + timeline.json → Remotion composition → polished MP4/GIF
 *
 * Requires: remotion, @remotion/cli, react, react-dom installed.
 * These are optional dependencies — if not installed, falls back to FFmpeg.
 */

import { execFile } from 'node:child_process';
import { access, stat, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRemotionTimeline } from '../zoom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_FILE = resolve(__dirname, 'Root.jsx');

function run(cmd, args, timeout = 300_000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * Check if Remotion is available.
 * @returns {boolean}
 */
export async function isRemotionAvailable() {
  try {
    await run('npx', ['remotion', '--version'], 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Render a cinematic zoom video using Remotion.
 *
 * @param {string} webmPath - path to raw .webm recording
 * @param {string} timelinePath - path to timeline JSON
 * @param {object} options
 * @param {string} options.format - 'mp4' or 'gif' (default 'mp4')
 * @param {number} options.fps - output frame rate (default 30 for mp4, 12 for gif)
 * @param {number} options.zoomLevel - zoom multiplier (default 2.0)
 * @param {number} options.transitionDuration - ease in/out seconds (default 0.4)
 * @param {number} options.holdAfter - hold zoom seconds (default 1.2)
 * @param {string} options.outputPath - custom output path
 * @returns {{ outputPath: string, sizeMB: string, zoomEvents: number }}
 */
export async function renderCinematic(webmPath, timelinePath, options = {}) {
  const available = await isRemotionAvailable();
  if (!available) {
    throw new Error(
      'Remotion not installed. Install with: npm i -D remotion @remotion/cli @remotion/media-utils react react-dom\n' +
      'Or use the FFmpeg pipeline (smart_export with mode="quick").'
    );
  }

  await access(webmPath);
  const rawTimeline = JSON.parse(await readFile(timelinePath, 'utf-8'));

  const format = options.format || 'mp4';
  const fps = options.fps || (format === 'gif' ? 12 : 30);
  const ext = format === 'gif' ? '.gif' : '.mp4';
  const outputPath = options.outputPath || webmPath.replace(/\.webm$/, `-cinematic${ext}`);

  // Build Remotion-compatible timeline
  const remotionTimeline = buildRemotionTimeline(rawTimeline, {
    zoomLevel: options.zoomLevel || 2.0,
    transitionDuration: options.transitionDuration || 0.4,
    holdAfter: options.holdAfter || 1.2,
    preLead: options.preLead || 0.4,
  });

  const durationInFrames = Math.ceil(rawTimeline.duration * fps);

  // Write props to a temp file (avoids shell escaping issues with large JSON)
  const propsPath = webmPath.replace(/\.webm$/, '-remotion-props.json');
  const props = {
    videoSrc: resolve(webmPath),
    timeline: remotionTimeline,
  };
  await writeFile(propsPath, JSON.stringify(props));

  try {
    // Render with Remotion CLI
    const renderArgs = [
      'remotion', 'render',
      ROOT_FILE,
      'ZoomVideo',
      outputPath,
      '--props', propsPath,
      '--fps', String(fps),
      '--width', String(rawTimeline.viewport.width),
      '--height', String(rawTimeline.viewport.height),
      '--frames', `0-${durationInFrames - 1}`,
    ];

    if (format === 'gif') {
      renderArgs.push('--image-format', 'png');
    } else {
      renderArgs.push('--codec', 'h264');
    }

    await run('npx', renderArgs, 600_000); // 10 min timeout for large videos

    const outputStat = await stat(outputPath);
    return {
      outputPath,
      sizeBytes: outputStat.size,
      sizeMB: (outputStat.size / 1024 / 1024).toFixed(2),
      zoomEvents: rawTimeline.events.filter(e => e.boundingBox).length,
      renderer: 'remotion',
    };
  } finally {
    // Clean up temp props file
    await unlink(propsPath).catch(() => {});
  }
}
