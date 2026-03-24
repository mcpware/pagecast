import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
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

  // Inject cursor highlight + click ripple for demo visibility
  if (options.cursorOverlay !== false) {
    await injectDemoOverlay(page);
  }

  const startedAt = new Date().toISOString();
  const timeline = {
    viewport: { width, height },
    startedAt,
    events: [],
  };
  sessions.set(sessionId, { context, page, url, startedAt, outputDir, width, height, timeline });

  return { sessionId, url, startedAt };
}

/**
 * Interact with a recording session's page.
 * Allows scrolling, clicking, waiting — so the recording captures real interactions.
 */
export async function interactWithPage(sessionId, actions) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found. Active sessions: ${[...sessions.keys()].join(', ') || 'none'}`);

  const { page, timeline } = session;
  const recordingStartMs = new Date(session.startedAt).getTime();
  const results = [];

  for (const action of actions) {
    // Capture timestamp relative to recording start (in seconds)
    const timestamp = (Date.now() - recordingStartMs) / 1000;

    // Try to get bounding box for zoomable actions
    let boundingBox = null;

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
        boundingBox = await safeBoundingBox(page, action.selector);
        await page.click(action.selector, { timeout: 5000 });
        results.push(`Clicked ${action.selector}`);
        break;
      case 'hover':
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.move(action.x, action.y, { steps: 10 });
          // Synthesize a small bounding box around cursor position
          boundingBox = { x: action.x - 20, y: action.y - 20, width: 40, height: 40 };
          results.push(`Hovered at (${action.x}, ${action.y})`);
        } else {
          boundingBox = await safeBoundingBox(page, action.selector);
          await page.hover(action.selector, { timeout: 5000 });
          results.push(`Hovered ${action.selector}`);
        }
        break;
      case 'type':
        if (action.selector) {
          boundingBox = await safeBoundingBox(page, action.selector);
          await page.click(action.selector, { timeout: 5000 });
        } else {
          // No selector — get bounding box of the currently focused element
          boundingBox = await activeElementBoundingBox(page);
        }
        await page.keyboard.type(action.text || '', { delay: action.delay || 80 });
        results.push(`Typed "${action.text}" ${action.selector ? 'in ' + action.selector : ''}`);
        break;
      case 'press':
        await page.keyboard.press(action.key || 'Enter');
        results.push(`Pressed ${action.key || 'Enter'}`);
        break;
      case 'select':
        boundingBox = await safeBoundingBox(page, action.selector);
        await page.selectOption(action.selector, action.value, { timeout: 5000 });
        results.push(`Selected "${action.value}" in ${action.selector}`);
        break;
      case 'navigate':
        await page.goto(action.url, { waitUntil: 'load', timeout: 30_000 });
        results.push(`Navigated to ${action.url}`);
        break;
      case 'waitForSelector':
        await page.waitForSelector(action.selector, { timeout: action.timeout || 15_000, state: action.state || 'visible' });
        results.push(`Waited for ${action.selector}`);
        break;
      default:
        results.push(`Unknown action: ${action.type}`);
    }

    // Record event in timeline
    timeline.events.push({
      timestamp,
      type: action.type,
      selector: action.selector || null,
      text: action.text || null,
      delay: action.delay || null,
      boundingBox,
    });
  }

  return results;
}

/** Safely get bounding box for a selector. Returns null if element not found or not visible. */
async function safeBoundingBox(page, selector) {
  if (!selector) return null;
  try {
    const locator = page.locator(selector).first();
    const box = await locator.boundingBox({ timeout: 2000 });
    return box; // { x, y, width, height } or null
  } catch {
    return null;
  }
}

/** Get bounding box of the currently focused (active) element. */
async function activeElementBoundingBox(page) {
  try {
    return await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  } catch {
    return null;
  }
}

/**
 * Inject cursor highlight + click ripple CSS/JS into the page.
 * This makes the cursor and clicks visible in the recording —
 * critical for demo GIFs where there's no real mouse cursor captured.
 */
export async function injectDemoOverlay(page) {
  await page.evaluate(() => {
    // Skip if already injected
    if (document.getElementById('pagecast-overlay')) return;

    const style = document.createElement('style');
    style.id = 'pagecast-overlay';
    style.textContent = `
      #pagecast-cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(255, 82, 82, 0.7);
        border: 2px solid rgba(255, 255, 255, 0.9);
        pointer-events: none;
        z-index: 999999;
        transform: translate(-50%, -50%);
        transition: transform 0.1s ease, opacity 0.15s ease;
        box-shadow: 0 0 8px rgba(255, 82, 82, 0.4);
      }
      #pagecast-cursor.clicking {
        transform: translate(-50%, -50%) scale(0.7);
      }
      .pagecast-ripple {
        position: fixed;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid rgba(255, 82, 82, 0.8);
        pointer-events: none;
        z-index: 999998;
        transform: translate(-50%, -50%) scale(1);
        animation: pagecast-ripple-expand 0.6s ease-out forwards;
      }
      @keyframes pagecast-ripple-expand {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    // Cursor dot
    const cursor = document.createElement('div');
    cursor.id = 'pagecast-cursor';
    document.body.appendChild(cursor);

    // Track mouse movement
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    }, true);

    // Click ripple + cursor squish
    document.addEventListener('mousedown', (e) => {
      cursor.classList.add('clicking');
      const ripple = document.createElement('div');
      ripple.className = 'pagecast-ripple';
      ripple.style.left = e.clientX + 'px';
      ripple.style.top = e.clientY + 'px';
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);

    document.addEventListener('mouseup', () => {
      cursor.classList.remove('clicking');
    }, true);
  });
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

  // Save event timeline as JSON (used by zoom pipelines)
  const timeline = session.timeline;
  timeline.duration = parseFloat(duration);
  const timelinePath = finalPath.replace(/\.webm$/, '-timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2));

  sessions.delete(sessionId);

  return { webmPath: finalPath, timelinePath, durationSeconds: parseFloat(duration) };
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
