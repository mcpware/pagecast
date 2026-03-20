import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';

let browser = null;
let browserHeadless = false; // default: headed (visible browser window)
const sessions = new Map();

const DEFAULT_OUTPUT_DIR = process.env.RECORDING_OUTPUT_DIR || './recordings';

/** Set headless mode. Call before first recording. */
export function setHeadless(headless) {
  browserHeadless = headless;
}

/** Launch browser lazily on first recording. */
async function ensureBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: browserHeadless });
  }
  return browser;
}

/**
 * Start recording a page.
 * Creates a new BrowserContext with recordVideo enabled,
 * navigates to the URL, and stores the session.
 */
export async function startRecording(url, options = {}) {
  const b = await ensureBrowser();

  const width = options.width || 1280;
  const height = options.height || 720;
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const sessionId = randomUUID().slice(0, 8);

  await mkdir(outputDir, { recursive: true });

  // Each context gets its own video recording
  const context = await b.newContext({
    recordVideo: {
      dir: outputDir,
      size: { width, height }
    },
    viewport: { width, height }
  });

  const page = await context.newPage();

  // Use 'load' instead of 'networkidle' — some pages never idle (WebSocket, polling)
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

  const startedAt = new Date().toISOString();
  sessions.set(sessionId, { context, page, url, startedAt, outputDir });

  return { sessionId, url, startedAt };
}

/**
 * Interact with a recording session's page.
 * Allows scrolling, clicking, waiting — so the recording captures real interactions.
 */
export async function interactWithPage(sessionId, actions) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found. Active sessions: ${[...sessions.keys()].join(', ') || 'none'}`);

  const { page } = session;
  const results = [];

  for (const action of actions) {
    switch (action.type) {
      case 'wait':
        await new Promise(r => setTimeout(r, (action.ms || 1000)));
        results.push(`Waited ${action.ms || 1000}ms`);
        break;
      case 'scroll':
        await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: action.x || 0, y: action.y || 300 });
        results.push(`Scrolled by (${action.x || 0}, ${action.y || 300})`);
        break;
      case 'click':
        await page.click(action.selector, { timeout: 5000 });
        results.push(`Clicked ${action.selector}`);
        break;
      case 'hover':
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.move(action.x, action.y, { steps: 10 });
          results.push(`Hovered at (${action.x}, ${action.y})`);
        } else {
          await page.hover(action.selector, { timeout: 5000 });
          results.push(`Hovered ${action.selector}`);
        }
        break;
      case 'type':
        if (action.selector) {
          await page.click(action.selector, { timeout: 5000 });
        }
        await page.keyboard.type(action.text || '', { delay: action.delay || 80 });
        results.push(`Typed "${action.text}" ${action.selector ? 'in ' + action.selector : ''}`);
        break;
      case 'press':
        await page.keyboard.press(action.key || 'Enter');
        results.push(`Pressed ${action.key || 'Enter'}`);
        break;
      case 'select':
        await page.selectOption(action.selector, action.value, { timeout: 5000 });
        results.push(`Selected "${action.value}" in ${action.selector}`);
        break;
      case 'navigate':
        await page.goto(action.url, { waitUntil: 'load', timeout: 30_000 });
        results.push(`Navigated to ${action.url}`);
        break;
      default:
        results.push(`Unknown action: ${action.type}`);
    }
  }

  return results;
}

/**
 * Stop recording.
 * Closes the context (which flushes the video to disk),
 * renames the auto-generated file to a predictable name.
 */
export async function stopRecording(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found. Active sessions: ${[...sessions.keys()].join(', ') || 'none'}`);

  // Get the auto-generated video path before closing
  const videoPath = await session.page.video().path();

  // Close context — this finalizes the video file
  await session.context.close();

  // Rename to predictable name
  const finalPath = join(session.outputDir, `recording-${sessionId}.webm`);
  await rename(videoPath, finalPath);

  const duration = ((Date.now() - new Date(session.startedAt).getTime()) / 1000).toFixed(1);
  sessions.delete(sessionId);

  return { webmPath: finalPath, durationSeconds: parseFloat(duration) };
}

/** List active recording sessions. */
export function listSessions() {
  return [...sessions.entries()].map(([id, s]) => ({
    sessionId: id,
    url: s.url,
    startedAt: s.startedAt
  }));
}

/** Clean up: close all sessions and browser. */
export async function cleanup() {
  for (const [id, session] of sessions) {
    try { await session.context.close(); } catch {}
    sessions.delete(id);
  }
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}
