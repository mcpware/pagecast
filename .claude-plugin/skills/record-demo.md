---
name: record-demo
description: Record a browser page as GIF or video. Use when you need to create a demo, capture a bug, or record a walkthrough.
argument-hint: "<url> [--gif|--mp4]"
---

# Record Demo

Use Pagecast to record browser sessions as GIF or video.

## When to use

- User asks to record a demo or walkthrough
- User needs a GIF for a README or documentation
- User wants to capture a bug reproduction
- User says "record this", "make a GIF", "capture the screen"

## How to use

### Quick recording (one-step)
```
Use record_and_export with the target URL. This records, interacts, and exports in one step.
```

### Step-by-step recording
1. `record_page` — start recording a URL
2. `interact_page` — scroll, click, type, hover, press keys, select options
3. `stop_recording` — stop and get the video file
4. `convert_to_gif` or `convert_to_mp4` — export to final format

## Tips

- Default is headed mode (visible browser) — user can watch the recording happen
- For GIF: keep it under 2MB for GitHub README (use 8-12 fps, 720px wide)
- Use `interact_page` with type "wait" to pause between actions for natural pacing
