# Pagecast

[![npm version](https://img.shields.io/npm/v/@mcpware/pagecast)](https://www.npmjs.com/package/@mcpware/pagecast)
[![license](https://img.shields.io/github/license/mcpware/pagecast)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast/fork)

**English** | [廣東話](README.zh-HK.md)

**Tell your AI to record what it does. It opens a browser, does the thing, and hands you back a GIF or video.**

An MCP server that gives AI assistants the ability to record any browser page — as GIF, WebM, or MP4. The AI controls the browser, interacts with the page, and the whole session is captured on video. You watch it happen live.

### The demo below was recorded by Pagecast itself. Yes, really.

![Moltbook Demo](docs/moltbook-demo.gif)

## Why

You built a web app. You need a demo GIF for the README. So you:

1. Open a screen recorder
2. Manually click through the demo
3. Export, crop, optimize
4. UI changes → repeat everything

**Or** — you tell your AI:

> "Go to https://myapp.localhost:3000, play around with it for 5 seconds and make a GIF"

The AI calls `record_and_gif` → outputs `recordings/recording-{id}.gif`. Done.

The browser is **visible by default** — you watch the AI work in real time.

## Use Cases

| What you say | What happens | Output |
|---|---|---|
| "Record my app and make a demo GIF" | AI opens browser, interacts, exports GIF | `.gif` |
| "Log into dashboard, toggle dark mode, record it" | AI performs full workflow, captures everything | `.webm` `.mp4` |
| "Submit an empty form, record what errors show up" | AI does QA, you review the recording later | `.webm` |
| "Walk through the signup flow and record a video" | AI creates onboarding documentation | `.mp4` |
| "Post on Moltbook and record yourself doing it" | AI records its own marketing material 🤯 | `.gif` |
| "Record my app in 1080x1920 for an IG Reel" | AI records in vertical format for social media | `.mp4` |

### 📐 Any size. Any platform.

Record in **any viewport size** — the AI opens a real browser at whatever dimension you need:

| Format | Size | For |
|--------|------|-----|
| 1280×720 | 16:9 | GitHub README, YouTube, docs |
| 1080×1920 | 9:16 | **IG Reels, TikTok, YouTube Shorts** |
| 1080×1080 | 1:1 | Instagram posts, LinkedIn |
| Custom | Any | Whatever you need |

## Quick Start

**Node.js ≥ 20** and **ffmpeg** required.

```bash
# Add to Claude Code
claude mcp add pagecast -- npx -y @mcpware/pagecast

# Or run directly
npx @mcpware/pagecast

# Headless mode (no visible browser)
claude mcp add pagecast -- npx -y @mcpware/pagecast --headless

# First time: install browser
npx playwright install chromium
```

## MCP Tools

| Tool | What it does |
|------|---|
| `record_page` | Open a URL in Chromium, start recording. Returns session ID |
| `interact_page` | Scroll, click, hover, **type**, press keys, navigate — all captured on video |
| `stop_recording` | Stop and save as `.webm` |
| `convert_to_gif` | WebM → optimized GIF (two-pass palette, configurable FPS/width/trim) |
| `record_and_gif` | All-in-one: record URL for N seconds → GIF |
| `list_recordings` | List all `.webm` and `.gif` files in output directory |

## How It Works

```
AI → MCP tools → Playwright (headed browser + video capture)
                       ↓
                  .webm recording
                       ↓
              ffmpeg two-pass palette
                       ↓
               optimized .gif / .mp4
```

1. `record_page` launches Chromium with `recordVideo` enabled
2. `interact_page` performs actions — scroll, click, hover, type, press keys
3. `stop_recording` flushes the video to disk
4. `convert_to_gif` runs two-pass ffmpeg: first extracts an optimal 256-color palette from all frames, then encodes with Bayer dithering. Way better quality than single-pass.

## Comparison

| Tool | Automated | Interactions | Output | AI-driven |
|------|:---------:|:------------:|--------|:---------:|
| **Pagecast** | ✅ | ✅ click/type/scroll/hover | **GIF + WebM + MP4** | ✅ |
| gifcap.dev | ❌ | ❌ | GIF | ❌ |
| Peek / ScreenToGif / Kap | ❌ | ❌ | GIF | ❌ |
| Playwright MCP (official) | ✅ | ✅ | Screenshot only | Partial |
| playwright-record-mcp | ✅ | ✅ | WebM only | Partial |
| VHS (Charmbracelet) | ✅ | Terminal only | GIF | ❌ |

Pagecast is the only MCP that does **browser recording + AI interactions + GIF/video output**.

## Configuration

| Setting | Default | Notes |
|---------|---------|-------|
| Browser | **Headed** (visible) | `--headless` for background |
| GIF FPS | 10 | Higher = smoother, larger |
| GIF width | 640px | Height auto-scaled |
| Video viewport | 1280×720 | Downscaled for GIF |
| Output dir | `./recordings` | Override: `RECORDING_OUTPUT_DIR` |

## Architecture

```
src/
├── index.js       # MCP server — 6 tools, stdio transport
├── recorder.js    # Playwright browser lifecycle + sessions
└── converter.js   # ffmpeg two-pass GIF conversion
```

- **Headed by default** — watch what the AI does
- **Lazy browser** — Chromium only launches on first recording
- **Session-based** — multiple simultaneous recordings
- **One browser, multiple contexts** — each recording is isolated
- **`execFile` not `exec`** — safe against shell injection

## License

MIT
