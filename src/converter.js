import { execFile } from 'node:child_process';
import { access, unlink, readdir, stat, readFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { buildFFmpegZoomFilter, buildMagnifyFilter, buildBubbleEvents, buildBubbleFilter } from './zoom.js';
import { generateBubblePng } from './bubble.js';
import { generateTooltipPng } from './tooltip.js';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function checkFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
  } catch {
    throw new Error('ffmpeg not found. Install it: sudo apt install ffmpeg (Linux) / brew install ffmpeg (macOS)');
  }
}

/**
 * Convert WebM to optimized GIF using two-pass palette method.
 * Pass 1: generate optimal 256-color palette from all frames
 * Pass 2: encode GIF using that palette for best quality
 */
export async function convertToGif(webmPath, options = {}) {
  await checkFfmpeg();
  await access(webmPath); // throws if file doesn't exist

  const fps = options.fps || 10;
  const width = options.width || 640;
  const startTime = options.startTime || 0; // skip blank loading frames
  const gifPath = options.outputPath || webmPath.replace(/\.webm$/, '.gif');
  const palettePath = webmPath.replace(/\.webm$/, '-palette.png');

  const scaleFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const inputArgs = startTime > 0 ? ['-ss', String(startTime), '-i', webmPath] : ['-i', webmPath];

  // Pass 1: generate palette
  await run('ffmpeg', [
    ...inputArgs,
    '-vf', `${scaleFilter},palettegen=stats_mode=diff`,
    '-y', palettePath
  ]);

  // Pass 2: encode GIF with palette
  await run('ffmpeg', [
    ...inputArgs,
    '-i', palettePath,
    '-lavfi', `${scaleFilter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-y', gifPath
  ]);

  // Clean up palette
  await unlink(palettePath).catch(() => {});

  const gifStat = await stat(gifPath);
  return {
    gifPath,
    sizeBytes: gifStat.size,
    sizeMB: (gifStat.size / 1024 / 1024).toFixed(2)
  };
}

/**
 * Convert WebM to MP4 using H.264 encoding.
 * Produces a widely-compatible MP4 suitable for social media, sharing, and embedding.
 */
export async function convertToMp4(webmPath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const mp4Path = options.outputPath || webmPath.replace(/\.webm$/, '.mp4');
  const crf = options.crf || 23; // quality: lower = better, 18-28 is reasonable

  await run('ffmpeg', [
    '-i', webmPath,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', mp4Path
  ]);

  const mp4Stat = await stat(mp4Path);
  return {
    mp4Path,
    sizeBytes: mp4Stat.size,
    sizeMB: (mp4Stat.size / 1024 / 1024).toFixed(2)
  };
}

/**
 * Load and parse a timeline JSON file.
 */
async function loadTimeline(timelinePath) {
  await access(timelinePath);
  const raw = await readFile(timelinePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Convert WebM to zoom-enhanced GIF using FFmpeg crop expressions.
 * Reads the event timeline to know where and when to zoom.
 *
 * Pipeline: input → [zoom crop+scale] → fps+resize → two-pass palette GIF
 */
export async function convertWithZoomGif(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const timeline = await loadTimeline(timelinePath);
  const zoomFilter = buildFFmpegZoomFilter(timeline, {
    zoomLevel: options.zoomLevel || 2.5,
    transitionDuration: options.transitionDuration || 0.35,
    holdPerTarget: options.holdPerTarget || 0.8,
    preLead: options.preLead || 0.25,
    panDuration: options.panDuration || 0.25,
    chainGap: options.chainGap || 2.5,
  });

  const fps = options.fps || 12;
  const width = options.width || 800;
  const startTime = options.startTime || 0;
  const gifPath = options.outputPath || webmPath.replace(/\.webm$/, '-zoom.gif');
  const palettePath = webmPath.replace(/\.webm$/, '-zoom-palette.png');

  // Build filter chain: zoom → fps/scale → palette
  const zoomPart = zoomFilter ? `${zoomFilter},` : '';
  const scaleFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const inputArgs = startTime > 0 ? ['-ss', String(startTime), '-i', webmPath] : ['-i', webmPath];

  // -threads 1: crop filter expressions are not thread-safe in FFmpeg
  const threadArgs = zoomFilter ? ['-threads', '1'] : [];

  // Pass 1: generate palette (with zoom applied)
  await run('ffmpeg', [
    ...inputArgs,
    ...threadArgs,
    '-vf', `${zoomPart}${scaleFilter},palettegen=stats_mode=diff`,
    '-y', palettePath
  ]);

  // Pass 2: encode GIF with palette (with zoom applied)
  await run('ffmpeg', [
    ...inputArgs,
    ...threadArgs,
    '-i', palettePath,
    '-lavfi', `${zoomPart}${scaleFilter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-y', gifPath
  ]);

  await unlink(palettePath).catch(() => {});

  const gifStat = await stat(gifPath);
  return {
    gifPath,
    sizeBytes: gifStat.size,
    sizeMB: (gifStat.size / 1024 / 1024).toFixed(2),
    zoomEvents: timeline.events.filter(e => e.boundingBox).length,
  };
}

/**
 * Convert WebM to zoom-enhanced MP4 using FFmpeg crop expressions.
 */
export async function convertWithZoomMp4(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const timeline = await loadTimeline(timelinePath);
  const zoomFilter = buildFFmpegZoomFilter(timeline, {
    zoomLevel: options.zoomLevel || 2.5,
    transitionDuration: options.transitionDuration || 0.35,
    holdPerTarget: options.holdPerTarget || 0.8,
    preLead: options.preLead || 0.25,
    panDuration: options.panDuration || 0.25,
    chainGap: options.chainGap || 2.5,
  });

  const mp4Path = options.outputPath || webmPath.replace(/\.webm$/, '-zoom.mp4');
  const crf = options.crf || 23;

  const filterArgs = zoomFilter ? ['-vf', zoomFilter] : [];

  await run('ffmpeg', [
    '-i', webmPath,
    // -threads 1: crop filter expressions are not thread-safe in FFmpeg.
    // Multi-threaded mode silently ignores time-based expressions.
    // This is fine for short demo videos (8-15 seconds).
    '-threads', '1',
    ...filterArgs,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', mp4Path
  ]);

  const mp4Stat = await stat(mp4Path);
  return {
    mp4Path,
    sizeBytes: mp4Stat.size,
    sizeMB: (mp4Stat.size / 1024 / 1024).toFixed(2),
    zoomEvents: timeline.events.filter(e => e.boundingBox).length,
  };
}

// ============================================================
// MAGNIFYING GLASS — overlay approach
// Full viewport stays visible + magnified inset appears near interactions
// ============================================================

/**
 * Convert WebM to GIF with magnifying glass overlays on interactions.
 * The full viewport stays visible. A zoomed-in lens appears near each interaction.
 */
export async function convertWithMagnifyGif(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const timeline = await loadTimeline(timelinePath);
  const magnify = buildMagnifyFilter(timeline, {
    magnifyScale: options.magnifyScale || 1.6,
    lensSize: options.lensSize || 400,
    fadeDuration: options.fadeDuration || 0.25,
    holdPerTarget: options.holdPerTarget || 1.2,
    padding: options.padding || 16,
    borderWidth: options.borderWidth || 3,
  });

  const fps = options.fps || 12;
  const width = options.width || 800;
  const gifPath = options.outputPath || webmPath.replace(/\.webm$/, '-magnify.gif');
  const palettePath = webmPath.replace(/\.webm$/, '-magnify-palette.png');
  const scaleFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;

  if (!magnify) {
    // No magnify events — fall back to regular GIF
    return convertToGif(webmPath, { fps, width, outputPath: gifPath });
  }

  // With magnifying glass, we use -filter_complex instead of -vf
  // Pipeline: input → magnify overlays → scale → palette

  // Pass 1: generate palette
  const pass1Filter = `${magnify.filterComplex};[${magnify.outputLabel}]${scaleFilter},palettegen=stats_mode=diff[pal]`;
  await run('ffmpeg', [
    '-i', webmPath,
    '-threads', '1',
    '-filter_complex', pass1Filter,
    '-map', '[pal]',
    '-y', palettePath
  ]);

  // Pass 2: encode GIF with palette
  const pass2Filter = `${magnify.filterComplex};[${magnify.outputLabel}]${scaleFilter}[scaled];[scaled][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[final]`;
  await run('ffmpeg', [
    '-i', webmPath,
    '-i', palettePath,
    '-threads', '1',
    '-filter_complex', pass2Filter,
    '-map', '[final]',
    '-y', gifPath
  ]);

  await unlink(palettePath).catch(() => {});

  const gifStat = await stat(gifPath);
  return {
    gifPath,
    sizeBytes: gifStat.size,
    sizeMB: (gifStat.size / 1024 / 1024).toFixed(2),
    magnifyEvents: timeline.events.filter(e => e.boundingBox).length,
  };
}

/**
 * Convert WebM to MP4 with magnifying glass overlays on interactions.
 */
export async function convertWithMagnifyMp4(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const timeline = await loadTimeline(timelinePath);
  const magnify = buildMagnifyFilter(timeline, {
    magnifyScale: options.magnifyScale || 1.6,
    lensSize: options.lensSize || 400,
    fadeDuration: options.fadeDuration || 0.25,
    holdPerTarget: options.holdPerTarget || 1.2,
    padding: options.padding || 16,
    borderWidth: options.borderWidth || 3,
  });

  const mp4Path = options.outputPath || webmPath.replace(/\.webm$/, '-magnify.mp4');
  const crf = options.crf || 23;

  if (!magnify) {
    return convertToMp4(webmPath, { crf, outputPath: mp4Path });
  }

  await run('ffmpeg', [
    '-i', webmPath,
    '-threads', '1',
    '-filter_complex', `${magnify.filterComplex}`,
    '-map', `[${magnify.outputLabel}]`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', mp4Path
  ]);

  const mp4Stat = await stat(mp4Path);
  return {
    mp4Path,
    sizeBytes: mp4Stat.size,
    sizeMB: (mp4Stat.size / 1024 / 1024).toFixed(2),
    magnifyEvents: timeline.events.filter(e => e.boundingBox).length,
  };
}

// ============================================================
// SPEECH BUBBLE — bubble overlay with tail pointing to interaction
// ============================================================

/**
 * Generate bubble mask PNGs for each event and run FFmpeg with bubble overlay.
 * Shared logic for GIF and MP4 bubble exports.
 */
async function buildBubblePipeline(webmPath, timelinePath, options = {}) {
  const timeline = await loadTimeline(timelinePath);
  const events = buildBubbleEvents(timeline, {
    magnifyScale: options.magnifyScale || 1.6,
    bubbleSize: options.bubbleSize || 380,
    tailSize: options.tailSize || 28,
    fadeDuration: options.fadeDuration || 0.25,
    holdPerTarget: options.holdPerTarget || 1.2,
    padding: options.padding || 24,
  });

  if (events.length === 0) return { events: [], inputArgs: [], filter: null, timeline };

  // Generate bubble mask PNGs (one per event, different tail direction)
  const bubblePaths = [];
  const tmpDir = webmPath.replace(/\.webm$/, '-bubbles');
  await mkdir(tmpDir, { recursive: true });

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const isTopTail = ev.tailDirection.startsWith('top');
    const pngW = ev.bubbleSize + 10; // + shadow
    const pngH = ev.bubbleSize + ev.tailSize + 10; // + tail + shadow

    const pngPath = join(tmpDir, `bubble-${i}.png`);
    await generateBubblePng(pngPath, {
      width: pngW,
      height: pngH,
      cornerRadius: 14,
      tailSize: ev.tailSize,
      tailDirection: ev.tailDirection,
      fillColor: [255, 255, 255, 245],
      borderColor: [50, 50, 50, 220],
      borderWidth: 3,
      shadowColor: [0, 0, 0, 90],
      shadowSize: 5,
    });
    bubblePaths.push(pngPath);
  }

  // Build FFmpeg input args for bubble PNGs
  const inputArgs = [];
  for (const p of bubblePaths) {
    inputArgs.push('-i', p);
  }

  const filter = buildBubbleFilter(events);

  return { events, inputArgs, filter, timeline, bubblePaths, tmpDir };
}

/**
 * Convert WebM to GIF with speech bubble overlays.
 */
export async function convertWithBubbleGif(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const { events, inputArgs, filter, timeline, tmpDir } = await buildBubblePipeline(webmPath, timelinePath, options);
  const fps = options.fps || 12;
  const width = options.width || 800;
  const gifPath = options.outputPath || webmPath.replace(/\.webm$/, '-bubble.gif');

  if (!filter) {
    return convertToGif(webmPath, { fps, width, outputPath: gifPath });
  }

  const palettePath = webmPath.replace(/\.webm$/, '-bubble-palette.png');
  const scaleFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;

  // Pass 1: palette
  await run('ffmpeg', [
    '-i', webmPath,
    ...inputArgs,
    '-threads', '1',
    '-filter_complex', `${filter.filterComplex};[${filter.outputLabel}]${scaleFilter},palettegen=stats_mode=diff[pal]`,
    '-map', '[pal]',
    '-y', palettePath
  ]);

  // Pass 2: GIF
  await run('ffmpeg', [
    '-i', webmPath,
    ...inputArgs,
    '-i', palettePath,
    '-threads', '1',
    '-filter_complex', `${filter.filterComplex};[${filter.outputLabel}]${scaleFilter}[sc];[sc][${events.length + 1}:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[final]`,
    '-map', '[final]',
    '-y', gifPath
  ]);

  // Cleanup
  await unlink(palettePath).catch(() => {});
  if (tmpDir) {
    const { rm } = await import('node:fs/promises');
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const gifStat = await stat(gifPath);
  return {
    gifPath,
    sizeBytes: gifStat.size,
    sizeMB: (gifStat.size / 1024 / 1024).toFixed(2),
    bubbleEvents: events.length,
  };
}

/**
 * Convert WebM to MP4 with speech bubble overlays.
 */
export async function convertWithBubbleMp4(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const { events, inputArgs, filter, timeline, tmpDir } = await buildBubblePipeline(webmPath, timelinePath, options);
  const mp4Path = options.outputPath || webmPath.replace(/\.webm$/, '-bubble.mp4');
  const crf = options.crf || 23;

  if (!filter) {
    return convertToMp4(webmPath, { crf, outputPath: mp4Path });
  }

  await run('ffmpeg', [
    '-i', webmPath,
    ...inputArgs,
    '-threads', '1',
    '-filter_complex', filter.filterComplex,
    '-map', `[${filter.outputLabel}]`,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', mp4Path
  ]);

  if (tmpDir) {
    const { rm } = await import('node:fs/promises');
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const mp4Stat = await stat(mp4Path);
  return {
    mp4Path,
    sizeBytes: mp4Stat.size,
    sizeMB: (mp4Stat.size / 1024 / 1024).toFixed(2),
    bubbleEvents: events.length,
  };
}

// ============================================================
// TOOLTIP — modern tooltip overlay (Linear/Figma style)
// ============================================================

/**
 * Build tooltip pipeline: generate tooltip PNGs + FFmpeg filter.
 * Reuses buildBubbleEvents for positioning logic (same math, different visuals).
 */
async function buildTooltipPipeline(webmPath, timelinePath, options = {}) {
  const timeline = await loadTimeline(timelinePath);

  // Use bubble event builder for positioning (same logic)
  const events = buildBubbleEvents(timeline, {
    magnifyScale: options.magnifyScale || 1.6,
    bubbleSize: options.tooltipSize || 380,
    tailSize: options.arrowSize || 10,
    fadeDuration: options.fadeDuration || 0.2,
    holdPerTarget: options.holdPerTarget || 1.2,
    padding: options.padding || 24,
  });

  if (events.length === 0) return { events: [], inputArgs: [], filter: null, timeline };

  const tmpDir = webmPath.replace(/\.webm$/, '-tooltips');
  await mkdir(tmpDir, { recursive: true });

  const tooltipPaths = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const arrowSize = ev.tailSize;
    const pngW = ev.bubbleSize + 20; // + shadow blur margin
    const pngH = ev.bubbleSize + arrowSize + 20;

    const pngPath = join(tmpDir, `tooltip-${i}.png`);
    await generateTooltipPng(pngPath, {
      width: pngW,
      height: pngH,
      cornerRadius: 10,
      arrowSize,
      arrowWidth: 18,
      arrowDirection: ev.tailDirection,
      fillColor: [255, 255, 255, 248],
      borderColor: [0, 0, 0, 30],
      borderWidth: 1,
      shadowBlur: 10,
      shadowOpacity: 25,
    });
    tooltipPaths.push(pngPath);
  }

  const inputArgs = [];
  for (const p of tooltipPaths) {
    inputArgs.push('-i', p);
  }

  const filter = buildBubbleFilter(events);

  return { events, inputArgs, filter, timeline, tmpDir };
}

/**
 * Convert WebM to MP4 with modern tooltip overlays.
 */
export async function convertWithTooltipMp4(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const { events, inputArgs, filter, tmpDir } = await buildTooltipPipeline(webmPath, timelinePath, options);
  const mp4Path = options.outputPath || webmPath.replace(/\.webm$/, '-tooltip.mp4');
  const crf = options.crf || 23;

  if (!filter) {
    return convertToMp4(webmPath, { crf, outputPath: mp4Path });
  }

  await run('ffmpeg', [
    '-i', webmPath,
    ...inputArgs,
    '-threads', '1',
    '-filter_complex', filter.filterComplex,
    '-map', `[${filter.outputLabel}]`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-y', mp4Path
  ]);

  if (tmpDir) {
    const { rm } = await import('node:fs/promises');
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const mp4Stat = await stat(mp4Path);
  return {
    mp4Path,
    sizeBytes: mp4Stat.size,
    sizeMB: (mp4Stat.size / 1024 / 1024).toFixed(2),
    tooltipEvents: events.length,
  };
}

/**
 * Convert WebM to GIF with modern tooltip overlays.
 */
export async function convertWithTooltipGif(webmPath, timelinePath, options = {}) {
  await checkFfmpeg();
  await access(webmPath);

  const { events, inputArgs, filter, tmpDir } = await buildTooltipPipeline(webmPath, timelinePath, options);
  const fps = options.fps || 12;
  const width = options.width || 800;
  const gifPath = options.outputPath || webmPath.replace(/\.webm$/, '-tooltip.gif');

  if (!filter) {
    return convertToGif(webmPath, { fps, width, outputPath: gifPath });
  }

  const palettePath = webmPath.replace(/\.webm$/, '-tooltip-palette.png');
  const scaleFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;

  await run('ffmpeg', [
    '-i', webmPath, ...inputArgs,
    '-threads', '1',
    '-filter_complex', `${filter.filterComplex};[${filter.outputLabel}]${scaleFilter},palettegen=stats_mode=diff[pal]`,
    '-map', '[pal]', '-y', palettePath
  ]);

  await run('ffmpeg', [
    '-i', webmPath, ...inputArgs, '-i', palettePath,
    '-threads', '1',
    '-filter_complex', `${filter.filterComplex};[${filter.outputLabel}]${scaleFilter}[sc];[sc][${events.length + 1}:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[final]`,
    '-map', '[final]', '-y', gifPath
  ]);

  await unlink(palettePath).catch(() => {});
  if (tmpDir) {
    const { rm } = await import('node:fs/promises');
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const gifStat = await stat(gifPath);
  return {
    gifPath, sizeBytes: gifStat.size,
    sizeMB: (gifStat.size / 1024 / 1024).toFixed(2),
    tooltipEvents: events.length,
  };
}

/**
 * List all recordings (.webm, .gif, .mp4) in a directory.
 */
export async function listRecordings(dir) {
  try {
    await access(dir);
  } catch {
    return [];
  }

  const files = await readdir(dir);
  const recordings = [];

  for (const file of files) {
    if (file.endsWith('.webm') || file.endsWith('.gif') || file.endsWith('.mp4')) {
      const filePath = join(dir, file);
      const fileStat = await stat(filePath);
      recordings.push({
        name: file,
        path: filePath,
        type: file.endsWith('.gif') ? 'gif' : file.endsWith('.mp4') ? 'mp4' : 'webm',
        sizeBytes: fileStat.size,
        sizeMB: (fileStat.size / 1024 / 1024).toFixed(2),
        createdAt: fileStat.mtime.toISOString()
      });
    }
  }

  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
