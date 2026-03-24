# Pagecast

[![npm version](https://img.shields.io/npm/v/@mcpware/pagecast)](https://www.npmjs.com/package/@mcpware/pagecast)
[![license](https://img.shields.io/github/license/mcpware/pagecast)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast/fork)

[English](README.md) | **廣東話**

**AI 錄你嘅產品 demo。Pagecast 自動 zoom 去每一個互動位置。**

AI click、打字、scroll — Pagecast 追蹤佢互動嘅位置然後自動 zoom camera 跟住。內建 cursor highlight、click ripple、smooth pan transition。一個 tool call 搞掂。

### 下面呢個 demo 係 Pagecast 自己錄自己嘅。係真㗎。

![Moltbook Demo](docs/moltbook-demo.gif)

### 三個 export 模式

**冇 Pagecast** — 淨係錄 screen。個 cursor 喺度郁但你根本睇唔到佢撳緊啲咩：

![Original](docs/demo-original.gif)

**用 Pagecast（tooltip 模式）** — 每個互動位置彈出放大 tooltip，終於睇到做緊啲咩：

![Tooltip Demo](docs/demo-tooltip.gif)

**用 Pagecast（cinematic 模式）** — camera 跟住 action crop + pan：

![Cinematic Demo](docs/demo-cinematic.gif)

## 點解要用

你整咗個 web app。你要整個 demo GIF 擺 README。所以你：

1. 開個錄屏工具
2. 自己手動 click 成個 demo
3. 用 video editor zoom 入去重要嘅位置
4. Export、裁剪、壓縮
5. UI 改咗 → 全部重嚟

**或者** — 你同你嘅 AI 講：

> 「錄一個 localhost:3000 嘅 demo，整個有 zoom 嘅 GIF」

AI call `record_page` → `interact_page` → `stop_recording` → `smart_export`。自動 zoom 去每一個 click、type 同 hover。搞掂。

個 browser **預設係睇得到嘅** — 你可以實時睇住 AI 做嘢。

### Auto-Zoom：最核心嘅功能

大部分錄屏工具成條片都係顯示成個 viewport。重要嘅 click 發生喺細細粒嘅 button 上面，viewer 根本睇唔到。

**Pagecast 追蹤每一個互動** — 當 AI click 一個 button、喺 input 打字、或者 hover 一個 element，Pagecast 記錄 bounding box 同 timestamp。然後 `smart_export` 用呢啲 data：

1. **Zoom 入去** 每個互動區域（預設 2.5 倍）
2. **Smooth pan** 去唔同嘅互動目標
3. 完成之後 **zoom 返出嚟** 顯示成個結果

唔使手動 video editing。唔使 post-production。AI 錄 demo 嘅同時已經錄埋 zoom data。

## 使用場景

| 你講嘅嘢 | AI 做咩 | 輸出 |
|---|---|---|
| 「錄低我個 app 整個 demo GIF」 | AI 開 browser，互動，auto-zoom export | `.gif` |
| 「登入 dashboard，開 dark mode，錄低成個過程」 | AI 做晒成個流程，zoom 去每個操作 | `.mp4` |
| 「Submit 個空白 form，錄低出咩 error」 | AI 做 QA，zoom 去 error message | `.gif` |
| 「用 1080x1920 錄我個 app 做 IG Reel」 | AI 用直版格式錄 social media 內容 | `.mp4` |
| 「去 Moltbook 出個 post 同時錄低自己做呢件事」 | AI 錄低自己做 marketing 🤯 | `.gif` |

### 📐 任何 size。任何平台。

| 格式 | Size | 用途 |
|------|------|------|
| 1280×720 | 16:9 | GitHub README、YouTube、文件 |
| 1080×1920 | 9:16 | **IG Reels、TikTok、YouTube Shorts** |
| 1080×1080 | 1:1 | Instagram posts、LinkedIn |
| 自訂 | 任何 | 你要咩就咩 |

## 快速開始

要有 **Node.js ≥ 20** 同 **ffmpeg**。

```bash
# 加入 Claude Code
claude mcp add pagecast -- npx -y @mcpware/pagecast

# 或者直接跑
npx @mcpware/pagecast

# 無頭模式（冇 browser 視窗）
claude mcp add pagecast -- npx -y @mcpware/pagecast --headless

# 第一次用：裝 browser
npx playwright install chromium
```

## MCP 工具

| 工具 | 做咩 |
|------|------|
| `record_page` | 開一條 URL，開始錄。自動注入 cursor highlight + click ripple |
| `interact_page` | scroll、click、hover、打字、撳掣、揀 dropdown、navigate、waitForSelector — 全部記錄 bounding box |
| `stop_recording` | 停止錄影，儲存 `.webm` + `-timeline.json`（互動位置記錄） |
| `cinematic_export` | **Cinematic crop-pan** — 讀取 timeline，crop 去互動區域，pan 去唔同目標。FFmpeg 或 Remotion |
| `convert_to_gif` | WebM → 優化 GIF（兩步 palette，可調 FPS/闊度/修剪） |
| `convert_to_mp4` | WebM → MP4（H.264，社交媒體 / 分享 / 嵌入用） |
| `record_and_export` | 一步搞掂：錄 URL → 自動 export 做 GIF 或 MP4 |
| `list_recordings` | 列出所有 `.webm`、`.gif`、`.mp4` 檔案 |

## 點樣運作

```
你：「錄我個 app 嘅 demo，要有 auto-zoom」
            ↓
AI → record_page(url, platform: "github")
    Playwright（睇得到嘅 browser，1280×720）
    + cursor highlight + click ripple 注入
            ↓
AI → interact_page(click, type, hover...)
    每個 action 記錄 bounding box + timestamp
            ↓
AI → stop_recording
    儲存 .webm + timeline.json
            ↓
AI → cinematic_export(mode: "quick")
    讀取 timeline → 生成 zoom chains
    FFmpeg crop expressions + smoothstep easing
    zoom 入去 → pan 去下一個目標 → zoom 返出嚟
            ↓
    出貨級 .gif 或 .mp4（有 auto-zoom）
```

### 兩個 rendering mode

| Mode | 引擎 | 速度 | 質素 | Dependencies |
|------|------|------|------|--------------|
| `quick`（預設） | FFmpeg crop + smoothstep easing | 快 | 好 | 冇（ffmpeg） |
| `cinematic` | Remotion React compositions | 慢啲 | 專業級 | remotion, react |

## 對比

| 工具 | 自動化 | 互動 | Auto-zoom | 輸出 | AI 驅動 |
|------|:------:|:----:|:---------:|------|:------:|
| **Pagecast** | ✅ | ✅ click/打字/scroll/hover | ✅ smooth pan | **GIF + WebM + MP4** | ✅ |
| Screen Studio | ❌ | ❌ | ✅ cursor-based | MP4 | ❌ |
| AutoZoom | ❌ | ❌ | ✅ click-based | MP4 | ❌ |
| Playwright MCP | ✅ | ✅ | ❌ | Raw `.webm` | 部分 |
| gifcap.dev / Peek / Kap | ❌ | ❌ | ❌ | GIF | ❌ |
| VHS (Charmbracelet) | ✅ | 只有 Terminal | ❌ | GIF | ❌ |

**Screen Studio 同 AutoZoom 有好靚嘅 zoom — 但要手動錄。** Pagecast 係唯一一個 AI 錄影 + 自動 zoom 嘅工具。

## 設定

| 設定 | 預設 | 備註 |
|------|------|------|
| Browser | **睇得到**（headed） | `--headless` 背景錄影 |
| GIF FPS | 12 | 越高越順但越大 |
| GIF 闊度 | 800px | 高度自動縮放 |
| Zoom 倍數 | 2.5x | 1.5-3.0。越高越 dramatic |
| Zoom 過渡 | 0.35s | Smoothstep ease-in/out |
| Cursor overlay | 開 | 紅點 + click ripple 效果 |
| 錄影 viewport | 1280×720 | 或者用 `platform` 參數 |
| 輸出目錄 | `./recordings` | 用 `RECORDING_OUTPUT_DIR` 改 |

## 架構

```
src/
├── index.js              # MCP server — 8 個工具，stdio transport
├── recorder.js           # Playwright browser 生命週期 + session + event timeline
├── converter.js          # ffmpeg 兩步 GIF + MP4 + zoom 增強轉換
├── zoom.js               # Zoom 計算引擎 — chains、panning、FFmpeg expressions
└── remotion/
    ├── ZoomComposition.jsx  # React composition（cinematic zoom）
    ├── Root.jsx             # Remotion 入口
    └── render.js            # Remotion CLI wrapper
```

- **Auto-zoom** — 每個互動記錄 bounding box + timestamp 做 post-processing
- **Cursor overlay** — 紅點跟蹤 mouse，click ripple 做視覺反饋
- **Zoom chains with panning** — 附近嘅互動組成 chains，zoom 入去 → pan 去唔同目標 → zoom 返出嚟
- **Thread-safe FFmpeg expressions** — crop filters 喺 multi-threaded encoding 正確運作
- **預設睇得到** — 睇住 AI 做咩
- **懶啟動** — Chromium 要錄先開
- **`execFile` 唔係 `exec`** — 防 shell injection

## 更多 @mcpware 產品

| 產品 | 做咩 | 安裝 |
|------|------|------|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 個 Instagram Graph API 工具 | `npx @mcpware/instagram-mcp` |
| **[Claude Code Organizer](https://github.com/mcpware/claude-code-organizer)** | 視覺化 dashboard 管理 memories、skills、MCP servers、hooks | `npx @mcpware/claude-code-organizer` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Hover 任何 element 睇到佢個名 — 零 extension，任何 browser | `npx @mcpware/ui-annotator` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI logo 設計 → SVG → 完整 brand kit export | `npx @mcpware/logoloom` |

## 授權

MIT
