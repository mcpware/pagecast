import { execFile } from 'node:child_process';
import { access, unlink, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

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
 * List all recordings (.webm and .gif) in a directory.
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
    if (file.endsWith('.webm') || file.endsWith('.gif')) {
      const filePath = join(dir, file);
      const fileStat = await stat(filePath);
      recordings.push({
        name: file,
        path: filePath,
        type: file.endsWith('.gif') ? 'gif' : 'webm',
        sizeBytes: fileStat.size,
        sizeMB: (fileStat.size / 1024 / 1024).toFixed(2),
        createdAt: fileStat.mtime.toISOString()
      });
    }
  }

  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
