---
name: record-demo
description: Record a browser demo with auto-zoom on interactions. Captures clicks, typing, hovers with bounding boxes, then exports with smooth zoom pan transitions.
argument-hint: "<url> [--gif|--mp4] [--no-zoom]"
---

# Record Demo

Use Pagecast to record browser sessions as polished GIF or video with auto-zoom.

## When to use

- User asks to record a demo or walkthrough
- User needs a GIF for a README or documentation
- User wants to capture a bug reproduction with zoom on the relevant UI
- User says "record this", "make a demo GIF", "capture the screen"

## How to use

### Auto-zoom recording (recommended)
1. `record_page` — start recording a URL (cursor overlay auto-injected)
2. `interact_page` — click, type, hover, scroll, waitForSelector — each action records bounding box + timestamp
3. `stop_recording` — saves `.webm` + `-timeline.json` with all interaction positions
4. `smart_export` — auto-zooms into each interaction, pans between targets, exports GIF or MP4

### Smart export options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mode` | `quick` | `quick` (FFmpeg) or `cinematic` (Remotion) |
| `zoomLevel` | 2.5 | How much to zoom (1.5-3.0) |
| `transitionDuration` | 0.35 | Zoom ease-in/out seconds |
| `holdPerTarget` | 0.8 | Hold each zoom target seconds |
| `format` | `gif` | `gif` or `mp4` |
| `width` | 800 | Output width for GIF |

### Plain recording (no zoom)
Use `convert_to_gif` or `convert_to_mp4` instead of `smart_export` for a standard flat recording.

## Tips

- Default is headed mode (visible browser) — user can watch the recording happen
- Cursor highlight (red dot) and click ripple are auto-injected for visual clarity
- Use `waitForSelector` action to wait for page content before interacting
- For GIF: keep under 3MB for GitHub README (use 10-12 fps, 800px wide)
- Zoom level 2.5 works for most UIs — increase to 3.0 for small UI elements
- The `type` action auto-captures the focused element's position even without a selector
