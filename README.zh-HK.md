# Pagecast

[![npm version](https://img.shields.io/npm/v/@mcpware/pagecast)](https://www.npmjs.com/package/@mcpware/pagecast)
[![license](https://img.shields.io/github/license/mcpware/pagecast)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/pagecast?style=social)](https://github.com/mcpware/pagecast/fork)

[English](README.md) | **廣東話**

**叫你嘅 AI 錄低佢做緊嘅嘢。佢開個 browser，做完件事，然後畀返個 GIF 或者影片你。**

一個 MCP server，畀 AI 助手錄低任何 browser 頁面 — 出 GIF、WebM 或者 MP4。AI 自己控制個 browser，自己同個頁面互動，成個過程全部錄低。你可以實時睇住佢做。

### 下面呢個 demo 係 Pagecast 自己錄自己嘅。係真㗎。

![Moltbook Demo](docs/moltbook-demo.gif)

## 點解要用

你整咗個 web app。你要整個 demo GIF 擺 README。所以你：

1. 開個錄屏工具
2. 自己手動 click 成個 demo
3. Export、裁剪、壓縮
4. UI 改咗 → 全部重嚟

**或者** — 你同你嘅 AI 講：

> 「去 https://myapp.localhost:3000，玩下佢 5 秒鐘然後整個 GIF」

AI call `record_and_gif` → 出 `recordings/recording-{id}.gif`。搞掂。

個 browser **預設係睇得到嘅** — 你可以實時睇住 AI 做嘢。

## 使用場景

| 你講嘅嘢 | AI 做咩 | 輸出 |
|---|---|---|
| 「錄低我個 app 整個 demo GIF」 | AI 開 browser，互動，出 GIF | `.gif` |
| 「登入 dashboard，開 dark mode，錄低成個過程」 | AI 做晒成個流程，全部錄低 | `.webm` `.mp4` |
| 「Submit 個空白 form，錄低出咩 error」 | AI 做 QA，你之後睇返段片 | `.webm` |
| 「行一次成個註冊流程，錄條片」 | AI 整 onboarding 文件 | `.mp4` |
| 「去 Moltbook 出個 post 同時錄低自己做呢件事」 | AI 錄低自己做 marketing 🤯 | `.gif` |
| 「用 1080x1920 錄我個 app 做 IG Reel」 | AI 用直版格式錄 social media 內容 | `.mp4` |

### 📐 任何 size。任何平台。

用**任何 viewport size** 錄 — AI 開一個真正嘅 browser，你要幾大就幾大：

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
| `record_page` | 開一條 URL，開始錄。回傳 session ID |
| `interact_page` | Scroll、click、hover、**打字**、撳掣、navigate — 全部錄入去 |
| `stop_recording` | 停止錄影，儲存 `.webm` |
| `convert_to_gif` | WebM → 優化 GIF（兩步 palette，可調 FPS/闊度/修剪） |
| `record_and_gif` | 一步搞掂：錄 URL N 秒 → GIF |
| `list_recordings` | 列出所有 `.webm` 同 `.gif` 檔案 |

## 點樣運作

```
AI → MCP 工具 → Playwright（睇得到嘅 browser + 錄影）
                       ↓
                  .webm 錄影檔
                       ↓
              ffmpeg 兩步 palette 優化
                       ↓
               靚嘅 .gif / .mp4
```

1. `record_page` 開 Chromium，開咗 `recordVideo`
2. `interact_page` 做動作 — scroll、click、hover、打字、撳掣
3. `stop_recording` 將影片寫入硬碟
4. `convert_to_gif` 跑兩步 ffmpeg：先分析所有 frame 整最靚嘅 256 色 palette，再用 Bayer dithering 編碼。質素好過單步好多。

## 對比

| 工具 | 自動化 | 互動 | 輸出 | AI 驅動 |
|------|:------:|:----:|------|:------:|
| **Pagecast** | ✅ | ✅ click/打字/scroll/hover | **GIF + WebM + MP4** | ✅ |
| gifcap.dev | ❌ | ❌ | GIF | ❌ |
| Peek / ScreenToGif / Kap | ❌ | ❌ | GIF | ❌ |
| Playwright MCP（官方） | ✅ | ✅ | 只有截圖 | 部分 |
| playwright-record-mcp | ✅ | ✅ | 只有 WebM | 部分 |
| VHS (Charmbracelet) | ✅ | 只有 Terminal | GIF | ❌ |

Pagecast 係唯一一個做到 **browser 錄影 + AI 互動 + GIF/影片輸出** 嘅 MCP。

## 設定

| 設定 | 預設 | 備註 |
|------|------|------|
| Browser | **睇得到**（headed） | `--headless` 背景錄影 |
| GIF FPS | 10 | 越高越順但越大 |
| GIF 闊度 | 640px | 高度自動縮放 |
| 錄影 viewport | 1280×720 | 出 GIF 時會縮細 |
| 輸出目錄 | `./recordings` | 用 `RECORDING_OUTPUT_DIR` 改 |

## 架構

```
src/
├── index.js       # MCP server — 6 個工具，stdio transport
├── recorder.js    # Playwright browser 生命週期 + session 管理
└── converter.js   # ffmpeg 兩步 GIF 轉換
```

- **預設睇得到** — 睇住 AI 做咩
- **懶啟動** — Chromium 要錄先開
- **Session 制** — 可以同時錄幾條片
- **一個 browser，多個 context** — 每條錄影獨立
- **`execFile` 唔係 `exec`** — 防 shell injection

## 授權

MIT
