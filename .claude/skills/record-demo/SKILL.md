---
name: record-demo
description: Record a polished product demo GIF/MP4 with auto-zoom. Reads the product README, plans a storytelling flow, records with Pagecast, auto-zooms key interactions, reviews and iterates until GitHub-README quality. Use when you need a demo GIF for a README or product page.
argument-hint: "<product-path-or-url> [--reel] [--mp4] [--no-zoom]"
---

# Record Demo — Storytelling Product Demo with Auto-Zoom

Record a polished, story-driven product demo using Pagecast's auto-zoom pipeline.

**This is NOT random clicking.** You are a demo director — you plan the story, choreograph the interactions, and iterate until the output is GitHub-README quality.

## Phase 1: Understand the Product

Before touching the browser, understand what you're demoing.

### 1a. Read the product

```
Read: <product-path>/README.md
Read: <product-path>/package.json
```

Extract:
- **One-liner**: What does this product do? (1 sentence)
- **Pain point**: What problem does it solve?
- **Key features**: List 3-5 demo-worthy features, ranked by wow-factor
- **Target audience**: Who is this README for? (developers, designers, managers)

### 1a.1. Sandbox mode (if available)

If the product has E2E tests with a sandbox/fixture setup, use that to create fake demo data instead of exposing real user data. Look for test fixtures that create temp directories with realistic content. Start the app pointing to the sandbox (e.g., `HOME=/tmp/sandbox node app.js`). This lets you safely demo ALL features including destructive ones like delete and move.

### 1b. Read the frontend (if web app)

Find the actual CSS selectors you'll need:
```
Read: <product-path>/src/ui/index.html   (or equivalent)
Read: <product-path>/src/ui/app.js       (or equivalent)
```

Extract:
- Search input selector
- Main list/card selectors
- Button/action selectors
- Navigation elements
- Loading indicator (to know when page is ready)
- Any `data-*` attributes useful for targeting

### 1c. Check existing demos

```bash
ls <product-path>/docs/demo* <product-path>/docs/screenshot* 2>/dev/null
```

If demos exist, review them to understand what was shown before and what can be improved.

## Phase 2: Plan the Demo Story

A good demo tells a story: **Problem → Discovery → Solution → Wow moment**

### Story structure (8-15 seconds total)

| Beat | Time | What happens | Why |
|------|------|-------------|-----|
| 1. Context | 0-1s | Show the full UI, let viewer orient | First frame must work as static screenshot |
| 2. Pain point | 1-3s | Show the problem the product solves | "Look how messy/hard this is" |
| 3. Feature A | 3-6s | First key interaction | The primary use case |
| 4. Feature B | 6-9s | Second interaction | Shows breadth |
| 5. Wow moment | 9-12s | The "aha" feature | Most impressive capability |
| 6. Result | 12-15s | Pause on the outcome | Let viewer see what happened |

### Planning rules

- **Show, don't tell** — no text overlays needed, the interactions speak for themselves
- **One feature per beat** — don't rush multiple actions into one moment
- **Wait after each action** — give the viewer 0.8-1.5s to process what happened
- **End on value** — the last frame should show the product working, not a loading state
- **Hide sensitive data** — never show company names, personal info, API keys in demos

### Write the plan

Before recording, write your demo plan as a comment:

```
// Demo plan for [Product Name]:
// Beat 1 (0-1s): Full UI loads, show 3-panel layout
// Beat 2 (1-3s): Search for "memory" — shows search works
// Beat 3 (3-6s): Click filter pill — shows categorization
// Beat 4 (6-9s): Click item — shows detail panel with preview
// Beat 5 (9-12s): Drag item to new scope — the wow moment
// Beat 6 (12-14s): Pause on result with undo toast
```

## Phase 2.5: Align with User

**STOP HERE.** Present your demo plan to the user and ask:

```
我準備錄呢個 demo，以下係我嘅 plan：

[Show the beat-by-beat plan from Phase 2]

幾個問題：
1. 有冇邊個功能你特別想重點 showcase？
2. 有冇啲功能唔應該出現喺 demo 入面？
3. 你想 demo 嘅 tone 係咩？(quick/snappy vs detailed/educational)
4. 有冇特定嘅 data 或 scenario 你想用？
```

Wait for user response. Adjust your demo plan based on their feedback before proceeding.

**Do NOT skip this step.** The user knows their product's selling points better than you.

## Phase 3: Record

### 3a. Start the target app

If localhost, ensure it's running:
```bash
cd <product-path> && npm start &
sleep 3  # wait for server
curl -s http://localhost:<port> | head -1  # verify
```

### 3b. Write and run the recording script

```javascript
import { startRecording, interactWithPage, stopRecording, cleanup } from '<pagecast>/src/recorder.js';
import { convertWithZoomGif, convertWithZoomMp4 } from '<pagecast>/src/converter.js';

// Pagecast path: ~/MyGithub/pagecast

const rec = await startRecording(url, {
  width: 1280,    // 16:9 for GitHub README
  height: 720,
  outputDir: '<product-path>/docs',
});

// Wait for page to fully load
await interactWithPage(rec.sessionId, [
  { type: 'waitForSelector', selector: '<loading-done-selector>', state: 'attached' },
  { type: 'waitForSelector', selector: '<main-content-selector>', state: 'visible' },
  { type: 'wait', ms: 800 },  // let render settle — first frame matters!
]);

// Beat 1: Context — let viewer see the full UI
await interactWithPage(rec.sessionId, [
  { type: 'wait', ms: 1000 },
]);

// Beat 2-5: Interactions (one feature per beat)
await interactWithPage(rec.sessionId, [
  { type: 'click', selector: '#searchInput' },
  { type: 'wait', ms: 300 },
  { type: 'type', text: 'memory', delay: 80 },
  { type: 'wait', ms: 1200 },  // hold for viewer to read
  // ... more interactions
]);

// Beat 6: Result — pause on outcome
await interactWithPage(rec.sessionId, [
  { type: 'wait', ms: 1500 },
]);

const stop = await stopRecording(rec.sessionId);

// Export with auto-zoom
const gif = await convertWithZoomGif(stop.webmPath, stop.timelinePath, {
  zoomLevel: 2.5,          // 2.5x zoom on interactions
  transitionDuration: 0.35, // smooth zoom ease
  holdPerTarget: 0.8,       // hold each zoom target
  fps: 12,
  width: 800,               // 800px wide for README
});

console.log(`Demo GIF: ${gif.gifPath} (${gif.sizeMB} MB)`);
await cleanup();
```

### Viewport presets

| Format | Width | Height | Use case |
|--------|-------|--------|----------|
| `--readme` (default) | 1280 | 720 | GitHub README, YouTube |
| `--reel` | 1080 | 1920 | IG Reels, TikTok, Shorts |
| `--square` | 1080 | 1080 | Instagram, LinkedIn |

### Interaction timing guidelines

| Action | Wait after | Why |
|--------|-----------|-----|
| Page load | 800ms | Let CSS animations finish |
| Click navigation | 800-1000ms | Show the result of navigation |
| Click to reveal content | 1200-1500ms | Let viewer read the revealed content |
| Type text | 80ms per char + 1000ms | Natural typing speed + read time |
| Drag and drop | 1500-2000ms | Complex action needs more processing time |
| Final result | 1500ms | End frame must be clear |

## Phase 4: Review

### 4a. Extract and review key frames

```bash
# Extract frames at each beat timestamp
for t in 0 1 3 5 8 12; do
  ffmpeg -i <webm-path> -ss $t -frames:v 1 /tmp/frame-$t.png 2>/dev/null
done
```

Read each frame and check:
- [ ] Frame 0: Is the UI loaded? No blank/white screen?
- [ ] Frame 1: Is the full UI visible and oriented?
- [ ] Interaction frames: Is the zoom targeting the right element?
- [ ] Can you read the text in zoomed areas?
- [ ] Final frame: Does it show a satisfying result?
- [ ] No sensitive data visible?

### 4b. Check file size

| Target | Max size |
|--------|----------|
| GitHub README GIF | < 3 MB (ideal), < 5 MB (acceptable) |
| IG Reel MP4 | < 10 MB |

If too large: reduce `fps` (10→8), reduce `width` (800→640), or trim duration.

### 4c. Compare zoom vs no-zoom

Export both versions and visually compare. The zoom version should clearly show each interaction up close while panning between them.

## Phase 5: Iterate

If any review check fails:

1. **Bad timing** → adjust wait durations, re-record
2. **Wrong element zoomed** → check selector specificity, use more targeted selectors
3. **Zoom too aggressive** → reduce `zoomLevel` from 2.5 to 2.0
4. **Zoom too subtle** → increase `zoomLevel` to 3.0
5. **Page not loaded** → increase initial wait, use `waitForSelector` for data load
6. **Sensitive data** → add masking or use test data
7. **GIF too large** → reduce fps, width, or duration

**Iterate until you'd be proud to put this GIF on the product's GitHub README.**

## Phase 6: Deliver

```bash
# Copy to product's docs folder
cp <zoom-gif-path> <product-path>/docs/demo.gif

# Optionally update README
# (only if user asks)
```

Report to user:
- Final GIF path and size
- What the demo shows (the story beats)
- Zoom events count
- Whether it replaces an existing demo