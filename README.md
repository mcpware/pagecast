# Pagecast

[![npm version](https://img.shields.io/npm/v/@mcpware/pagecast)](https://www.npmjs.com/package/@mcpware/pagecast)
[![license](https://img.shields.io/github/license/mcpware/pagecast)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast/fork)

**English** | [廣東話](README.zh-HK.md)

**Playwright gives you raw `.webm`. Pagecast gives you shipping-ready GIF or MP4.**

Built-in ffmpeg two-pass palette optimization. One MCP tool call. Done.

### The demo below was recorded by Pagecast itself. Yes, really.

![Moltbook Demo](docs/moltbook-demo.gif)

## Why

You built a web app. You need a demo GIF for the README. So you:

1. Open a screen recorder
2. Manually click through the demo
3. Export, crop, figure out ffmpeg, optimize
4. UI changes → repeat everything

**Or** — you tell your AI:

```
"Record a demo of localhost:3000 for my GitHub README"
```

The AI calls `record_and_export` with `platform: "github"` → outputs an optimized GIF. Done.

```
"Record my app for Instagram Reels"
```

The AI calls `record_and_export` with `platform: "reels"` → outputs a 1080×1920 MP4. Done.

The browser is **visible by default** — you watch the AI work in real time.

## Just Say Where It's Going

You don't need to know viewport sizes or formats. Just tell your AI the destination:

```
"Record a demo of my app for GitHub README"     → 1280×720 GIF
"Record my app for Instagram Reels"              → 1080×1920 MP4
"Make a TikTok demo of my dashboard"             → 1080×1920 MP4
"Record a YouTube video of the signup flow"      → 1280×720 MP4
"Record for YouTube Shorts"                      → 1080×1920 MP4
"Make an Instagram post demo"                    → 1080×1080 MP4
"Record a demo for LinkedIn"                     → 1080×1080 MP4
"Record for Twitter"                             → 1280×720 MP4
```

Pagecast maps platform names to the right size and format automatically:

| Platform | Size | Format | Aspect |
|----------|------|--------|--------|
| `github` / `readme` | 1280×720 | GIF | 16:9 |
| `youtube` / `twitter` | 1280×720 | MP4 | 16:9 |
| `reels` / `tiktok` / `shorts` | 1080×1920 | MP4 | 9:16 |
| `instagram` / `linkedin` | 1080×1080 | MP4 | 1:1 |
| Custom | Any size | Your choice | Any |

**Did you know?** Just changing the viewport size turns your AI-recorded demo into content for any platform. Most people don't realize this is possible.

## Use Cases

| What you say | What happens | Output |
|---|---|---|
| "Record my app and make a demo GIF" | AI opens browser, interacts, exports GIF | `.gif` |
| "Log into dashboard, toggle dark mode, record it" | AI performs full workflow, captures everything | `.mp4` |
| "Submit an empty form, record what errors show up" | AI does QA, you review the recording later | `.mp4` |
| "Walk through the signup flow for our TikTok" | AI records in 9:16 vertical format | `.mp4` |
| "Post on Moltbook and record yourself doing it" | AI records its own marketing material 🤯 | `.gif` |

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
| `record_page` | Open a URL, start recording. Accepts `platform` for auto-sizing |
| `interact_page` | scroll, click, hover, type, press keys, select dropdowns, navigate — all captured on video |
| `stop_recording` | Stop and save as `.webm` |
| `convert_to_gif` | WebM → optimized GIF (ffmpeg two-pass palette, configurable FPS/width/trim) |
| `convert_to_mp4` | WebM → MP4 (H.264, ready for social/sharing/embedding) |
| `record_and_export` | All-in-one: record → auto-export to GIF or MP4 based on platform |
| `list_recordings` | List all `.webm`, `.gif`, and `.mp4` files in output directory |

## How It Works

```
You: "Record my app for Instagram Reels"
            ↓
AI → record_and_export(platform: "reels")
            ↓
    Playwright (headed browser, 1080×1920)
            ↓
        .webm recording
            ↓
    ffmpeg two-pass optimization
            ↓
    shipping-ready .mp4 (9:16)
```

1. `record_page` launches Chromium with `recordVideo` enabled at the right viewport size
2. `interact_page` performs actions — scroll, click, hover, type, press keys
3. `stop_recording` flushes the video to disk
4. `convert_to_gif` / `convert_to_mp4` runs ffmpeg — for GIF, that's two-pass palette extraction + Bayer dithering (way better quality than single-pass)

## Comparison

| | Automated | Interactions | Output | AI-driven | Platform presets | Built-in ffmpeg |
|---|:-:|:-:|---|:-:|:-:|:-:|
| **Pagecast** | ✅ | ✅ click/type/scroll/hover | **GIF + WebM + MP4** | ✅ | ✅ | ✅ |
| Playwright MCP | ✅ | ✅ | Raw `.webm` via config | Partial | ❌ | ❌ |
| playwright-record-mcp | ✅ | ✅ | Raw `.webm` | Partial | ❌ | ❌ |
| gifcap.dev | ❌ manual | ❌ | GIF | ❌ | ❌ | N/A |
| Peek / ScreenToGif / Kap | ❌ manual | ❌ | GIF | ❌ | ❌ | N/A |
| VHS (Charmbracelet) | ✅ scripted | Terminal only | GIF | ❌ | ❌ | N/A |

**Playwright can record — but it gives you a raw `.webm` and you figure out the rest.** Pagecast handles the last mile: optimized GIF/MP4, right size for your platform, one tool call.

## Configuration

| Setting | Default | Notes |
|---------|---------|-------|
| Browser | **Headed** (visible) | `--headless` for background |
| GIF FPS | 10 | Higher = smoother, larger |
| GIF width | 640px | Height auto-scaled |
| Video viewport | 1280×720 | Or use `platform` parameter |
| Output dir | `./recordings` | Override: `RECORDING_OUTPUT_DIR` |

## Architecture

```
src/
├── index.js       # MCP server — 7 tools, platform presets, stdio transport
├── recorder.js    # Playwright browser lifecycle + sessions
└── converter.js   # ffmpeg two-pass GIF + MP4 conversion
```

- **Headed by default** — watch what the AI does
- **Lazy browser** — Chromium only launches on first recording
- **Session-based** — multiple simultaneous recordings
- **One browser, multiple contexts** — each recording is isolated
- **`execFile` not `exec`** — safe against shell injection

## More from @mcpware

| Project | What it does | Install |
|---------|---|---|
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Hover any element to see its name — zero extensions, any browser | `npx @mcpware/ui-annotator` |
| **[Claude Code Organizer](https://github.com/mcpware/claude-code-organizer)** | Visual dashboard for memories, skills, MCP servers, hooks | `npx @mcpware/claude-code-organizer` |
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 tools for the Instagram Graph API | `npx @mcpware/instagram-mcp` |

## License

MIT
