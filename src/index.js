#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startRecording, stopRecording, interactWithPage, injectDemoOverlay, listSessions, cleanup, setHeadless } from './recorder.js';
import { convertToGif, convertToMp4, convertWithZoomGif, convertWithZoomMp4, convertWithTooltipGif, convertWithTooltipMp4, listRecordings } from './converter.js';
import { isRemotionAvailable, renderCinematic } from './remotion/render.js';

// CLI flags: --headless to run browser without visible window (default: headed)
if (process.argv.includes('--headless')) {
  setHeadless(true);
}

const mcp = new McpServer({
  name: 'pagecast',
  version: '0.2.0'
});

// Platform presets: user says "for Instagram Reels" and we pick the right size + format
const PLATFORM_PRESETS = {
  'github':    { width: 1280, height: 720,  format: 'gif',  label: 'GitHub README (16:9, GIF)' },
  'readme':    { width: 1280, height: 720,  format: 'gif',  label: 'GitHub README (16:9, GIF)' },
  'youtube':   { width: 1280, height: 720,  format: 'mp4',  label: 'YouTube (16:9, MP4)' },
  'reels':     { width: 1080, height: 1920, format: 'mp4',  label: 'Instagram Reels (9:16, MP4)' },
  'instagram': { width: 1080, height: 1080, format: 'mp4',  label: 'Instagram Post (1:1, MP4)' },
  'tiktok':    { width: 1080, height: 1920, format: 'mp4',  label: 'TikTok (9:16, MP4)' },
  'shorts':    { width: 1080, height: 1920, format: 'mp4',  label: 'YouTube Shorts (9:16, MP4)' },
  'linkedin':  { width: 1080, height: 1080, format: 'mp4',  label: 'LinkedIn (1:1, MP4)' },
  'twitter':   { width: 1280, height: 720,  format: 'mp4',  label: 'Twitter/X (16:9, MP4)' },
};

function resolvePlatform(platform, width, height) {
  if (platform && PLATFORM_PRESETS[platform.toLowerCase()]) {
    const preset = PLATFORM_PRESETS[platform.toLowerCase()];
    return { width: width || preset.width, height: height || preset.height, format: preset.format, label: preset.label };
  }
  return { width: width || 1280, height: height || 720, format: null, label: null };
}

// Tool 1: Start recording a page
mcp.tool(
  'record_page',
  `Open a URL in a browser and start recording video. Returns a session ID. Call stop_recording when done.

Instead of specifying width/height, you can use the "platform" parameter:
- "Record my app for GitHub README" → platform: "github" (1280×720, GIF)
- "Record my app for Instagram Reels" → platform: "reels" (1080×1920, MP4)
- "Record my app for TikTok" → platform: "tiktok" (1080×1920, MP4)
- "Record my app for YouTube" → platform: "youtube" (1280×720, MP4)
- "Record my app for YouTube Shorts" → platform: "shorts" (1080×1920, MP4)
- "Record my app for Instagram post" → platform: "instagram" (1080×1080, MP4)
- "Record my app for LinkedIn" → platform: "linkedin" (1080×1080, MP4)
- "Record my app for Twitter" → platform: "twitter" (1280×720, MP4)

Or pass custom width/height for any other size.`,
  {
    url: z.string().describe('URL to open and record'),
    platform: z.string().optional().describe('Target platform: github, readme, youtube, reels, instagram, tiktok, shorts, linkedin, twitter'),
    width: z.number().optional().describe('Viewport width in pixels (auto-set if platform is specified)'),
    height: z.number().optional().describe('Viewport height in pixels (auto-set if platform is specified)')
  },
  async ({ url, platform, width, height }) => {
    try {
      const resolved = resolvePlatform(platform, width, height);
      const result = await startRecording(url, { width: resolved.width, height: resolved.height });
      return {
        content: [{
          type: 'text',
          text: `Recording started!\n\nSession: ${result.sessionId}\nURL: ${result.url}\nViewport: ${resolved.width}×${resolved.height}${resolved.label ? ` (${resolved.label})` : ''}\nRecommended export: ${resolved.format || 'GIF or MP4'}\nStarted: ${result.startedAt}\n\nUse interact_page to scroll/click/hover during recording.\nCall stop_recording with sessionId "${result.sessionId}" when done.${resolved.format === 'gif' ? '\nThen use convert_to_gif for optimized GIF.' : resolved.format === 'mp4' ? '\nThen use convert_to_mp4 for social-ready MP4.' : '\nThen use convert_to_gif or convert_to_mp4.'}`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 2: Interact with a recording session
mcp.tool(
  'interact_page',
  'Perform actions on a recording page (scroll, click, hover, type, press, select, wait, navigate). Actions are performed sequentially and recorded in the video.',
  {
    sessionId: z.string().describe('Session ID from record_page'),
    actions: z.array(z.object({
      type: z.enum(['wait', 'scroll', 'click', 'hover', 'type', 'press', 'select', 'navigate', 'waitForSelector']).describe('Action type'),
      ms: z.number().optional().describe('Wait duration in ms (for wait action)'),
      x: z.number().optional().describe('Scroll X pixels (for scroll) or hover X coordinate (for hover)'),
      y: z.number().optional().describe('Scroll Y pixels (for scroll) or hover Y coordinate (for hover)'),
      selector: z.string().optional().describe('CSS selector (for click/hover/type/select)'),
      url: z.string().optional().describe('URL (for navigate)'),
      text: z.string().optional().describe('Text to type (for type action)'),
      delay: z.number().optional().describe('Typing delay between characters in ms (for type action, default 80)'),
      key: z.string().optional().describe('Key to press, e.g. "Enter", "Tab", "Escape", "Control+a" (for press action)'),
      value: z.string().optional().describe('Option value to select (for select action on <select> elements)')
    })).describe('Array of actions to perform sequentially')
  },
  async ({ sessionId, actions }) => {
    try {
      const results = await interactWithPage(sessionId, actions);
      return {
        content: [{
          type: 'text',
          text: `Actions completed:\n${results.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 3: Stop recording
mcp.tool(
  'stop_recording',
  'Stop a recording session and save the video as .webm file.',
  {
    sessionId: z.string().describe('Session ID from record_page')
  },
  async ({ sessionId }) => {
    try {
      const result = await stopRecording(sessionId);
      return {
        content: [{
          type: 'text',
          text: `Recording stopped!\n\nFile: ${result.webmPath}\nDuration: ${result.durationSeconds}s\n\nUse convert_to_gif to create a GIF from this video.`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 4: Convert WebM to GIF
mcp.tool(
  'convert_to_gif',
  'Convert a .webm video to an optimized GIF using ffmpeg two-pass palette method.',
  {
    webmPath: z.string().describe('Path to the .webm file'),
    fps: z.number().optional().default(10).describe('GIF frame rate (default 10)'),
    width: z.number().optional().default(640).describe('GIF width in pixels (default 640, height auto-scaled)'),
    startTime: z.number().optional().default(0).describe('Skip first N seconds (useful to trim blank loading frames)')
  },
  async ({ webmPath, fps, width, startTime }) => {
    try {
      const result = await convertToGif(webmPath, { fps, width, startTime });
      return {
        content: [{
          type: 'text',
          text: `GIF created!\n\nFile: ${result.gifPath}\nSize: ${result.sizeMB} MB`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 5: Convert WebM to MP4
mcp.tool(
  'convert_to_mp4',
  'Convert a .webm video to MP4 (H.264). Widely compatible for social media, sharing, and embedding.',
  {
    webmPath: z.string().describe('Path to the .webm file'),
    crf: z.number().optional().default(23).describe('Quality (18=high, 23=default, 28=small file)')
  },
  async ({ webmPath, crf }) => {
    try {
      const result = await convertToMp4(webmPath, { crf });
      return {
        content: [{
          type: 'text',
          text: `MP4 created!\n\nFile: ${result.mp4Path}\nSize: ${result.sizeMB} MB`
        }]
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 6: Record and convert in one step
mcp.tool(
  'record_and_export',
  `All-in-one: open URL, wait for specified duration, stop recording, auto-export to the right format.

Use the "platform" parameter and we handle everything:
- "Record a demo for my GitHub README" → platform: "github" → 1280×720 GIF
- "Record my app for Instagram Reels" → platform: "reels" → 1080×1920 MP4
- "Make a TikTok demo" → platform: "tiktok" → 1080×1920 MP4
- "Record for YouTube" → platform: "youtube" → 1280×720 MP4

Or pass custom width/height/outputFormat for full control.`,
  {
    url: z.string().describe('URL to record'),
    platform: z.string().optional().describe('Target platform: github, readme, youtube, reels, instagram, tiktok, shorts, linkedin, twitter — auto-sets size + format'),
    durationSeconds: z.number().optional().default(5).describe('How long to record (default 5 seconds)'),
    width: z.number().optional().describe('Viewport width (auto-set if platform specified)'),
    height: z.number().optional().describe('Viewport height (auto-set if platform specified)'),
    outputFormat: z.enum(['gif', 'mp4']).optional().describe('Output format (auto-set if platform specified)'),
    gifFps: z.number().optional().default(10).describe('GIF frame rate (only for GIF output)'),
    gifWidth: z.number().optional().default(640).describe('GIF width (only for GIF output, height auto-scaled)')
  },
  async ({ url, platform, durationSeconds, width, height, outputFormat, gifFps, gifWidth }) => {
    try {
      const resolved = resolvePlatform(platform, width, height);
      const format = outputFormat || resolved.format || 'gif';
      const rec = await startRecording(url, { width: resolved.width, height: resolved.height });
      await new Promise(r => setTimeout(r, durationSeconds * 1000));
      const stop = await stopRecording(rec.sessionId);

      if (format === 'mp4') {
        const mp4 = await convertToMp4(stop.webmPath);
        return {
          content: [{
            type: 'text',
            text: `Recording complete!${resolved.label ? ` (${resolved.label})` : ''}\n\nVideo: ${stop.webmPath} (${stop.durationSeconds}s)\nMP4: ${mp4.mp4Path} (${mp4.sizeMB} MB)\n\nReady to upload to ${platform || 'your platform'}.`
          }]
        };
      } else {
        const gif = await convertToGif(stop.webmPath, { fps: gifFps, width: gifWidth });
        return {
          content: [{
            type: 'text',
            text: `Recording complete!${resolved.label ? ` (${resolved.label})` : ''}\n\nVideo: ${stop.webmPath} (${stop.durationSeconds}s)\nGIF: ${gif.gifPath} (${gif.sizeMB} MB)\n\nReady to use in README or documentation.`
          }]
        };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 7: List recordings
mcp.tool(
  'list_recordings',
  'List all .webm and .gif recordings in the output directory.',
  {
    directory: z.string().optional().describe('Directory to list (default: ./recordings)')
  },
  async ({ directory }) => {
    try {
      const dir = directory || process.env.RECORDING_OUTPUT_DIR || './recordings';
      const recordings = await listRecordings(dir);
      if (recordings.length === 0) {
        return { content: [{ type: 'text', text: `No recordings found in ${dir}` }] };
      }
      const list = recordings.map(r => `${r.name} (${r.type}, ${r.sizeMB} MB, ${r.createdAt})`).join('\n');
      return { content: [{ type: 'text', text: `Recordings in ${dir}:\n\n${list}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 8: Cinematic export with crop-pan zoom
mcp.tool(
  'cinematic_export',
  `Convert a recorded .webm to GIF or MP4 with cinematic crop-pan effects.

Crops the entire frame to focus on the interaction area, then pans smoothly between targets.
Think of it as a virtual cameraman that follows the action.

Two rendering modes:
- "quick" (default): FFmpeg-based crop with smoothstep easing. Fast, no extra dependencies.
- "cinematic": Remotion-based rendering with spring animations. Requires remotion + react installed.

Example workflow:
1. record_page → interact_page (clicks, typing, etc.) → stop_recording
2. cinematic_export with the webmPath and timelinePath from stop_recording
3. Get a polished GIF/MP4 where the camera follows the action`,
  {
    webmPath: z.string().describe('Path to the .webm file from stop_recording'),
    timelinePath: z.string().describe('Path to the -timeline.json file from stop_recording'),
    format: z.enum(['gif', 'mp4']).optional().default('gif').describe('Output format (default: gif)'),
    mode: z.enum(['quick', 'cinematic']).optional().default('quick').describe('Rendering mode: "quick" (FFmpeg) or "cinematic" (Remotion)'),
    zoomLevel: z.number().optional().default(2.5).describe('Zoom multiplier (default 2.5 = 2.5x zoom into interaction area)'),
    transitionDuration: z.number().optional().default(0.35).describe('Zoom ease-in/out duration in seconds'),
    holdPerTarget: z.number().optional().default(0.8).describe('How long to hold zoom on each interaction (seconds)'),
    fps: z.number().optional().describe('Frame rate (default: 12 for GIF, 30 for cinematic MP4)'),
    width: z.number().optional().default(800).describe('Output width for GIF (height auto-scaled)'),
  },
  async ({ webmPath, timelinePath, format, mode, zoomLevel, transitionDuration, holdPerTarget, fps, width }) => {
    try {
      let result;
      const zoomOpts = { zoomLevel, transitionDuration, holdPerTarget };

      if (mode === 'cinematic') {
        // Remotion pipeline — smooth spring animations
        const remotionReady = await isRemotionAvailable();
        if (!remotionReady) {
          return {
            content: [{
              type: 'text',
              text: 'Remotion not installed. Install with:\n  npm i -D remotion @remotion/cli @remotion/media-utils react react-dom\n\nOr use mode="quick" for FFmpeg-based zoom (no extra deps needed).'
            }],
            isError: true
          };
        }
        result = await renderCinematic(webmPath, timelinePath, {
          format, ...zoomOpts, fps,
        });
        const ext = format === 'gif' ? 'GIF' : 'MP4';
        return {
          content: [{
            type: 'text',
            text: `Cinematic ${ext} created with Remotion!\n\nFile: ${result.outputPath}\nSize: ${result.sizeMB} MB\nZoom events: ${result.zoomEvents} interactions auto-zoomed\nRenderer: Remotion (spring animations)\n\nPro tip: Adjust zoomLevel (1.5-3.0) and transitionDuration (0.2-0.6) to fine-tune the look.`
          }]
        };
      } else {
        // FFmpeg pipeline — fast crop-based zoom
        if (format === 'gif') {
          result = await convertWithZoomGif(webmPath, timelinePath, {
            ...zoomOpts, fps: fps || 12, width,
          });
          return {
            content: [{
              type: 'text',
              text: `Zoom GIF created!\n\nFile: ${result.gifPath}\nSize: ${result.sizeMB} MB\nZoom events: ${result.zoomEvents} interactions auto-zoomed\nRenderer: FFmpeg (smoothstep easing)\n\nWant smoother animations? Try mode="cinematic" (requires Remotion).`
            }]
          };
        } else {
          result = await convertWithZoomMp4(webmPath, timelinePath, zoomOpts);
          return {
            content: [{
              type: 'text',
              text: `Zoom MP4 created!\n\nFile: ${result.mp4Path}\nSize: ${result.sizeMB} MB\nZoom events: ${result.zoomEvents} interactions auto-zoomed\nRenderer: FFmpeg (smoothstep easing)\n\nWant smoother animations? Try mode="cinematic" (requires Remotion).`
            }]
          };
        }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 9: Smart export with tooltip overlay
mcp.tool(
  'smart_export',
  `Convert a recorded .webm to GIF or MP4 with tooltip overlays on interactions.

The full viewport stays visible. When an interaction happens (click, type, hover),
a clean tooltip inset appears showing a magnified close-up of that area with a small
arrow pointing toward the interaction. Modern, minimal design (Linear/Figma style).

The tooltip positions itself on the opposite side of the screen from the interaction.

Perfect for product demos where viewers need to see both the full UI context AND the detail.

Example workflow:
1. record_page → interact_page (clicks, typing, etc.) → stop_recording
2. smart_export with the webmPath and timelinePath from stop_recording
3. Get a polished GIF/MP4 with tooltip overlays on every interaction

Compare with cinematic_export which crops the entire frame to follow the action.`,
  {
    webmPath: z.string().describe('Path to the .webm file from stop_recording'),
    timelinePath: z.string().describe('Path to the -timeline.json file from stop_recording'),
    format: z.enum(['gif', 'mp4']).optional().default('gif').describe('Output format (default: gif)'),
    magnifyScale: z.number().optional().default(1.6).describe('How much to magnify inside the tooltip (default 1.6x)'),
    tooltipSize: z.number().optional().default(380).describe('Size of the tooltip inset in pixels (default 380)'),
    holdPerTarget: z.number().optional().default(1.2).describe('How long to show each tooltip (seconds)'),
    fps: z.number().optional().default(12).describe('Frame rate for GIF output'),
    width: z.number().optional().default(800).describe('Output width for GIF (height auto-scaled)'),
  },
  async ({ webmPath, timelinePath, format, magnifyScale, tooltipSize, holdPerTarget, fps, width }) => {
    try {
      const opts = { magnifyScale, tooltipSize, holdPerTarget };
      let result;

      if (format === 'gif') {
        result = await convertWithTooltipGif(webmPath, timelinePath, { ...opts, fps, width });
        return {
          content: [{
            type: 'text',
            text: `Tooltip GIF created!\n\nFile: ${result.gifPath}\nSize: ${result.sizeMB} MB\nTooltip events: ${result.tooltipEvents} interactions with tooltip overlay\n\nFull viewport visible + tooltip close-ups on each interaction.`
          }]
        };
      } else {
        result = await convertWithTooltipMp4(webmPath, timelinePath, opts);
        return {
          content: [{
            type: 'text',
            text: `Tooltip MP4 created!\n\nFile: ${result.mp4Path}\nSize: ${result.sizeMB} MB\nTooltip events: ${result.tooltipEvents} interactions with tooltip overlay\n\nFull viewport visible + tooltip close-ups on each interaction.`
          }]
        };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Cleanup on exit
process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });

// Start MCP server
const transport = new StdioServerTransport();
await mcp.connect(transport);
