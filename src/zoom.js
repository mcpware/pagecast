/**
 * Zoom calculation engine — v2 with pan targets.
 *
 * Instead of merging overlapping events into one giant crop,
 * we create "zoom chains" that zoom in, pan between targets, then zoom out.
 *
 * Visual timeline:
 *   [full] → [zoom in] → [pan to A] → [pan to B] → [pan to C] → [zoom out] → [full]
 *
 * This produces the "cinematic product demo" look where the camera smoothly
 * follows the action across different parts of the UI.
 */

/**
 * Calculate crop region for a zoom centered on a bounding box.
 */
export function calculateCropRegion(bbox, viewport, zoomLevel = 2.0) {
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;

  const cropW = Math.round(viewport.width / zoomLevel);
  const cropH = Math.round(viewport.height / zoomLevel);

  const cropX = Math.round(clamp(centerX - cropW / 2, 0, viewport.width - cropW));
  const cropY = Math.round(clamp(centerY - cropH / 2, 0, viewport.height - cropH));

  return { x: cropX, y: cropY, w: cropW, h: cropH };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Build zoom chains from the event timeline.
 *
 * A chain is a group of events that happen close together in time.
 * Within a chain, the camera stays zoomed and pans between targets.
 * Between chains, the camera zooms out to show the full viewport.
 *
 * @returns {Array<ZoomChain>} where ZoomChain = {
 *   startZoom, zoomedAt, unzoomAt, endZoom,  // timing
 *   targets: [{ time, holdUntil, crop }],     // pan targets within the chain
 *   zoomLevel
 * }
 */
export function buildZoomChains(timeline, options = {}) {
  const {
    zoomLevel = 2.0,
    transitionDuration = 0.3,  // zoom in/out easing
    panDuration = 0.25,        // pan between targets easing
    holdPerTarget = 0.8,       // hold each target before panning to next
    preLead = 0.2,             // start zoom before first event
    chainGap = 2.5,            // if gap between events > this, start a new chain
  } = options;

  const viewport = timeline.viewport;
  const zoomableActions = ['click', 'type', 'hover', 'select'];

  // Step 1: Extract zoomable events with their crop regions
  const events = [];
  for (const event of timeline.events) {
    if (!zoomableActions.includes(event.type)) continue;
    if (!event.boundingBox) continue;

    let extraHold = 0;
    if (event.type === 'type' && event.text) {
      extraHold = (event.text.length * (event.delay || 80)) / 1000;
    }

    events.push({
      time: event.timestamp,
      holdDuration: holdPerTarget + extraHold,
      crop: calculateCropRegion(event.boundingBox, viewport, zoomLevel),
      type: event.type,
    });
  }

  if (events.length === 0) return [];

  // Step 2: Group into chains based on time gaps
  const chains = [];
  let currentChain = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].time - (events[i - 1].time + events[i - 1].holdDuration);
    if (gap > chainGap) {
      chains.push(currentChain);
      currentChain = [events[i]];
    } else {
      currentChain.push(events[i]);
    }
  }
  chains.push(currentChain);

  // Step 3: Convert chains into timed zoom chains with pan targets
  return chains.map(chain => {
    const firstEvent = chain[0];
    const lastEvent = chain[chain.length - 1];

    // Build targets with timing
    const targets = [];
    let currentTime = firstEvent.time;

    for (let i = 0; i < chain.length; i++) {
      const event = chain[i];
      const arriveAt = i === 0 ? firstEvent.time : event.time;
      const holdUntil = arriveAt + event.holdDuration;
      targets.push({
        time: arriveAt,
        holdUntil,
        crop: event.crop,
      });
      currentTime = holdUntil;
    }

    const startZoom = Math.max(0, firstEvent.time - preLead);
    const zoomedAt = startZoom + transitionDuration;
    const lastTarget = targets[targets.length - 1];
    const unzoomAt = lastTarget.holdUntil;
    const endZoom = unzoomAt + transitionDuration;

    return {
      startZoom,
      zoomedAt,
      unzoomAt,
      endZoom,
      targets,
      zoomLevel,
      panDuration,
    };
  });
}

/**
 * Generate FFmpeg crop filter with zoom chains and panning.
 *
 * The filter has two parts:
 * 1. w/h expressions: zoom in → hold → zoom out (same for all targets in a chain)
 * 2. x/y expressions: pan between targets within each chain
 */
export function buildFFmpegZoomFilter(timeline, options = {}) {
  const chains = buildZoomChains(timeline, options);
  const vw = timeline.viewport.width;
  const vh = timeline.viewport.height;

  if (chains.length === 0) return null;

  const wExpr = buildSizeExpr(chains, 'w', vw, vh);
  const hExpr = buildSizeExpr(chains, 'h', vw, vh);
  const xExpr = buildPanExpr(chains, 'x', vw, vh);
  const yExpr = buildPanExpr(chains, 'y', vw, vh);

  // Single quotes are FFmpeg filter syntax (not shell quotes) — they protect commas
  // inside expressions like between(t,0.3,0.6) from being parsed as filter separators.
  // execFile passes args directly so the quotes reach FFmpeg intact.
  return `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}':exact=1,scale=${vw}:${vh}:flags=lanczos`;
}

/**
 * Build w or h expression.
 * These only change during zoom-in and zoom-out transitions.
 * During the hold phase, they stay at the zoomed value.
 */
function buildSizeExpr(chains, dim, vw, vh) {
  const fullVal = dim === 'w' ? 'iw' : 'ih';
  const full = dim === 'w' ? vw : vh;
  let expr = fullVal;

  for (let i = chains.length - 1; i >= 0; i--) {
    const chain = chains[i];
    const zoomed = dim === 'w' ? chain.targets[0].crop.w : chain.targets[0].crop.h;

    // Zoom in: [startZoom, zoomedAt]
    const inExpr = smoothInterp(fullVal, zoomed, chain.startZoom, chain.zoomedAt);
    // Hold: [zoomedAt, unzoomAt]
    const holdExpr = String(zoomed);
    // Zoom out: [unzoomAt, endZoom]
    const outExpr = smoothInterp(zoomed, fullVal, chain.unzoomAt, chain.endZoom);

    expr = `if(between(t,${f(chain.startZoom)},${f(chain.zoomedAt)}),${inExpr},` +
           `if(between(t,${f(chain.zoomedAt)},${f(chain.unzoomAt)}),${holdExpr},` +
           `if(between(t,${f(chain.unzoomAt)},${f(chain.endZoom)}),${outExpr},` +
           `${expr})))`;
  }

  return expr;
}

/**
 * Build x or y expression with panning between targets.
 * During the zoomed phase, the position smoothly pans between crop targets.
 */
function buildPanExpr(chains, dim, vw, vh) {
  const defaultPos = '0';
  let expr = defaultPos;

  for (let i = chains.length - 1; i >= 0; i--) {
    const chain = chains[i];
    const targets = chain.targets;
    const firstPos = dim === 'x' ? targets[0].crop.x : targets[0].crop.y;
    const lastPos = dim === 'x' ? targets[targets.length - 1].crop.x : targets[targets.length - 1].crop.y;

    // Zoom in: pan from 0 to first target position
    const inExpr = smoothInterp(defaultPos, firstPos, chain.startZoom, chain.zoomedAt);

    // Hold phase: build pan expressions between targets
    let holdExpr;
    if (targets.length === 1) {
      holdExpr = String(firstPos);
    } else {
      // Build nested if/between for panning between targets
      holdExpr = buildPanChainExpr(targets, dim, chain);
    }

    // Zoom out: pan from last target position back to 0
    const outExpr = smoothInterp(lastPos, defaultPos, chain.unzoomAt, chain.endZoom);

    expr = `if(between(t,${f(chain.startZoom)},${f(chain.zoomedAt)}),${inExpr},` +
           `if(between(t,${f(chain.zoomedAt)},${f(chain.unzoomAt)}),${holdExpr},` +
           `if(between(t,${f(chain.unzoomAt)},${f(chain.endZoom)}),${outExpr},` +
           `${expr})))`;
  }

  return expr;
}

/**
 * Build pan expressions within a zoom chain.
 * Smoothly interpolates x or y between consecutive targets.
 *
 * Timing: pan is timed so we ARRIVE at the next target when it fires.
 *   [hold at current] → [pan to next] → [arrive exactly at next.time]
 *
 * When events overlap (next starts before current's hold ends),
 * we start panning immediately.
 */
function buildPanChainExpr(targets, dim, chain) {
  const lastPos = dim === 'x' ? targets[targets.length - 1].crop.x : targets[targets.length - 1].crop.y;
  let expr = String(lastPos);

  for (let i = targets.length - 2; i >= 0; i--) {
    const current = targets[i];
    const next = targets[i + 1];
    const currentPos = dim === 'x' ? current.crop.x : current.crop.y;
    const nextPos = dim === 'x' ? next.crop.x : next.crop.y;

    // Pan arrives at next position exactly when next event fires
    const panEnd = next.time;
    // Pan starts panDuration before arrival, but not before current event
    const panStart = Math.max(current.time + 0.05, panEnd - chain.panDuration);

    if (panStart >= panEnd) {
      // Events are essentially simultaneous — just snap to current position until next
      expr = `if(lt(t,${f(next.time)}),${currentPos},${expr})`;
    } else if (currentPos === nextPos) {
      // Same position — just hold
      expr = `if(lt(t,${f(next.time)}),${currentPos},${expr})`;
    } else {
      // Hold at current, then pan to next
      const panExpr = smoothInterp(currentPos, nextPos, panStart, panEnd);
      expr = `if(lt(t,${f(panStart)}),${currentPos},` +
             `if(between(t,${f(panStart)},${f(panEnd)}),${panExpr},` +
             `${expr}))`;
    }
  }

  return expr;
}

/**
 * Smoothstep interpolation expression between two values over a time range.
 *
 * Uses inline smoothstep formula without st()/ld() storage variables,
 * because those are NOT thread-safe in FFmpeg's expression evaluator.
 * Multi-threaded encoding (preset slow/slower) corrupts shared storage.
 *
 * Smoothstep: p*p*(3-2*p) where p = normalized progress
 */
function smoothInterp(from, to, tStart, tEnd) {
  const duration = tEnd - tStart;
  if (duration <= 0) return String(to);
  // p = clipped progress [0,1]
  const p = `clip((t-${f(tStart)})/${f(duration)},0,1)`;
  // Inline smoothstep: p*p*(3-2*p) — repeated p is verbose but thread-safe
  const smooth = `${p}*${p}*(3-2*${p})`;
  return `${from}+(${to}-${from})*(${smooth})`;
}

/** Format number to 3 decimal places */
function f(n) {
  return n.toFixed(3);
}

/**
 * Generate Remotion-compatible timeline data with pan targets.
 */
export function buildRemotionTimeline(timeline, options = {}) {
  const chains = buildZoomChains(timeline, options);
  const vw = timeline.viewport.width;
  const vh = timeline.viewport.height;

  return {
    viewport: { width: vw, height: vh },
    duration: timeline.duration,
    chains: chains.map(chain => ({
      startZoom: chain.startZoom,
      zoomedAt: chain.zoomedAt,
      unzoomAt: chain.unzoomAt,
      endZoom: chain.endZoom,
      zoomLevel: chain.zoomLevel,
      panDuration: chain.panDuration,
      targets: chain.targets.map(t => ({
        time: t.time,
        holdUntil: t.holdUntil,
        scale: chain.zoomLevel,
        translateX: -(t.crop.x / vw) * 100 * chain.zoomLevel,
        translateY: -(t.crop.y / vh) * 100 * chain.zoomLevel,
        crop: t.crop,
      })),
    })),
  };
}

// ============================================================
// MAGNIFYING GLASS — overlay approach
// Full viewport stays visible. A magnified inset appears near
// each interaction, showing a close-up of what's happening.
// ============================================================

/**
 * Build magnifying glass events from the timeline.
 * Each zoomable interaction becomes a magnify event with:
 *   - source crop region (what to magnify)
 *   - overlay position (where to place the magnified view)
 *   - timing (fade in, hold, fade out)
 *
 * @param {object} timeline - the event timeline
 * @param {object} options
 * @param {number} options.magnifyScale - how much to enlarge (default 1.6)
 * @param {number} options.lensSize - size of the magnified inset in px (default 400)
 * @param {number} options.fadeDuration - fade in/out in seconds (default 0.25)
 * @param {number} options.holdPerTarget - hold each magnified view (default 1.2)
 * @param {number} options.padding - margin from viewport edges (default 20)
 * @param {number} options.borderWidth - border around the lens (default 4)
 * @returns {Array<MagnifyEvent>}
 */
export function buildMagnifyEvents(timeline, options = {}) {
  const {
    magnifyScale = 1.6,
    lensSize = 400,
    fadeDuration = 0.25,
    holdPerTarget = 1.2,
    padding = 20,
    borderWidth = 4,
  } = options;

  const vw = timeline.viewport.width;
  const vh = timeline.viewport.height;
  const zoomableActions = ['click', 'type', 'hover', 'select'];

  const events = [];
  for (const event of timeline.events) {
    if (!zoomableActions.includes(event.type)) continue;
    if (!event.boundingBox) continue;

    const bbox = event.boundingBox;
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    // Source crop: what area of the original video to magnify
    const srcSize = Math.round(lensSize / magnifyScale);
    const srcX = Math.round(clamp(centerX - srcSize / 2, 0, vw - srcSize));
    const srcY = Math.round(clamp(centerY - srcSize / 2, 0, vh - srcSize));

    // Overlay position: place the lens on the opposite side from the interaction
    // Account for border + shadow padding (adds ~6px each side)
    const shadowWidth = 2;
    const totalLensSize = lensSize + shadowWidth * 2;

    let overlayX, overlayY;
    if (centerX < vw / 2) {
      overlayX = vw - totalLensSize - padding;
    } else {
      overlayX = padding;
    }
    if (centerY < vh / 2) {
      overlayY = vh - totalLensSize - padding;
    } else {
      overlayY = padding;
    }

    // Extra hold for typing
    let extraHold = 0;
    if (event.type === 'type' && event.text) {
      extraHold = (event.text.length * (event.delay || 80)) / 1000;
    }

    const fadeIn = event.timestamp;
    const holdStart = fadeIn + fadeDuration;
    const holdEnd = holdStart + holdPerTarget + extraHold;
    const fadeOut = holdEnd + fadeDuration;

    events.push({
      fadeIn,
      holdStart,
      holdEnd,
      fadeOut,
      src: { x: srcX, y: srcY, size: srcSize },
      overlay: { x: overlayX, y: overlayY, size: lensSize },
      borderWidth,
    });
  }

  // Merge overlapping events: if next fadeIn < prev fadeOut, extend prev
  const merged = [];
  for (const ev of events) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (ev.fadeIn < prev.fadeOut) {
        // Close enough — end previous early, start new one
        prev.holdEnd = Math.min(prev.holdEnd, ev.fadeIn - fadeDuration);
        prev.fadeOut = ev.fadeIn;
      }
    }
    merged.push(ev);
  }

  return merged;
}

/**
 * Generate FFmpeg filter_complex for magnifying glass overlay.
 *
 * Architecture:
 *   [0:v] → split into [base] and [mag_src]
 *   [mag_src] → crop → scale → drawbox (border) → [lens]
 *   [base][lens] → overlay with enable expression → [out]
 *
 * For multiple events, we chain overlays sequentially.
 *
 * @returns {{ filterComplex: string, outputLabel: string }} or null if no events
 */
export function buildMagnifyFilter(timeline, options = {}) {
  const events = buildMagnifyEvents(timeline, options);
  if (events.length === 0) return null;

  const vw = timeline.viewport.width;
  const vh = timeline.viewport.height;
  const borderWidth = options.borderWidth || 3;

  // Strategy: for each magnify event, create a separate overlay pass.
  // Each pass: crop the source region, scale up, add border, overlay with time-based enable + opacity.
  //
  // We chain them: [0:v] → overlay1 → overlay2 → ... → [out]

  const filters = [];
  let prevLabel = '0:v';

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const lensLabel = `lens${i}`;
    const outLabel = i === events.length - 1 ? 'out' : `pass${i}`;

    // Crop the source region from original video
    // Scale up to lens size (slightly smaller to make room for border)
    // Add double border: dark outer + light inner for contrast on any background
    const innerSize = ev.overlay.size - borderWidth * 2;
    const shadowWidth = 2;
    const totalSize = ev.overlay.size + shadowWidth * 2;
    filters.push(
      `[0:v]crop=${ev.src.size}:${ev.src.size}:${ev.src.x}:${ev.src.y},` +
      `scale=${innerSize}:${innerSize}:flags=lanczos,` +
      // Inner white border
      `pad=${ev.overlay.size}:${ev.overlay.size}:${borderWidth}:${borderWidth}:color=white,` +
      // Outer dark shadow border
      `pad=${totalSize}:${totalSize}:${shadowWidth}:${shadowWidth}:color=black@0.6[${lensLabel}]`
    );

    // Overlay with fade in/out using alpha expression
    // enable: only show during the event window
    // Alpha fades: use format=rgba on the lens, then colorchannelmixer for alpha
    const enableExpr = `between(t,${f(ev.fadeIn)},${f(ev.fadeOut)})`;

    // Opacity expression: fade in → hold → fade out
    const opacityExpr =
      `if(between(t,${f(ev.fadeIn)},${f(ev.holdStart)}),` +
        `clip((t-${f(ev.fadeIn)})/${f(ev.holdStart - ev.fadeIn)},0,1),` +
      `if(between(t,${f(ev.holdStart)},${f(ev.holdEnd)}),` +
        `1,` +
      `if(between(t,${f(ev.holdEnd)},${f(ev.fadeOut)}),` +
        `1-clip((t-${f(ev.holdEnd)})/${f(ev.fadeOut - ev.holdEnd)},0,1),` +
        `0)))`;

    filters.push(
      `[${prevLabel}][${lensLabel}]overlay=` +
      `x=${ev.overlay.x}:y=${ev.overlay.y}:` +
      `enable='${enableExpr}':` +
      `format=auto[${outLabel}]`
    );

    prevLabel = outLabel;
  }

  return {
    filterComplex: filters.join(';'),
    outputLabel: 'out',
  };
}

// ============================================================
// SPEECH BUBBLE — bubble overlay approach
// Full viewport visible + magnified inset inside a speech bubble
// with a tail pointing toward the interaction.
// ============================================================

/**
 * Build speech bubble magnify events from the timeline.
 * Each interaction gets a bubble with a tail pointing toward it.
 *
 * Returns events + the bubble PNG paths that need to be generated.
 *
 * @param {object} timeline
 * @param {object} options
 * @param {number} options.magnifyScale - zoom level inside bubble (default 1.6)
 * @param {number} options.bubbleSize - bubble body size in px (default 380)
 * @param {number} options.tailSize - tail triangle size (default 28)
 * @param {number} options.fadeDuration - fade in/out seconds (default 0.25)
 * @param {number} options.holdPerTarget - hold duration (default 1.2)
 * @param {number} options.padding - margin from viewport edge (default 24)
 * @returns {Array<BubbleEvent>}
 */
export function buildBubbleEvents(timeline, options = {}) {
  const {
    magnifyScale = 1.6,
    bubbleSize = 380,
    tailSize = 28,
    fadeDuration = 0.25,
    holdPerTarget = 1.2,
    padding = 24,
  } = options;

  const vw = timeline.viewport.width;
  const vh = timeline.viewport.height;
  const zoomableActions = ['click', 'type', 'hover', 'select'];
  const totalH = bubbleSize + tailSize + 10; // body + tail + shadow
  const totalW = bubbleSize + 10; // body + shadow

  const events = [];
  for (const event of timeline.events) {
    if (!zoomableActions.includes(event.type)) continue;
    if (!event.boundingBox) continue;

    const bbox = event.boundingBox;
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    // Source crop region (what to magnify)
    const srcSize = Math.round(bubbleSize / magnifyScale);
    const srcX = Math.round(clamp(centerX - srcSize / 2, 0, vw - srcSize));
    const srcY = Math.round(clamp(centerY - srcSize / 2, 0, vh - srcSize));

    // Determine tail direction (bubble appears opposite to interaction)
    let tailDirection;
    const onLeft = centerX < vw / 2;
    const onTop = centerY < vh / 2;
    if (onLeft && onTop) tailDirection = 'top-left';       // interaction top-left → tail points there
    else if (!onLeft && onTop) tailDirection = 'top-right';
    else if (onLeft && !onTop) tailDirection = 'bottom-left';
    else tailDirection = 'bottom-right';

    // Overlay position (opposite side from interaction)
    let overlayX, overlayY;
    if (onLeft) {
      overlayX = vw - totalW - padding;
    } else {
      overlayX = padding;
    }
    if (onTop) {
      overlayY = vh - totalH - padding;
    } else {
      overlayY = padding;
    }

    // Extra hold for typing
    let extraHold = 0;
    if (event.type === 'type' && event.text) {
      extraHold = (event.text.length * (event.delay || 80)) / 1000;
    }

    const fadeIn = event.timestamp;
    const holdStart = fadeIn + fadeDuration;
    const holdEnd = holdStart + holdPerTarget + extraHold;
    const fadeOut = holdEnd + fadeDuration;

    events.push({
      fadeIn, holdStart, holdEnd, fadeOut,
      src: { x: srcX, y: srcY, size: srcSize },
      overlay: { x: overlayX, y: overlayY },
      bubbleSize,
      tailSize,
      tailDirection,
    });
  }

  // Prevent overlapping: trim previous event if next starts before it ends
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (curr.fadeIn < prev.fadeOut) {
      prev.holdEnd = Math.min(prev.holdEnd, curr.fadeIn - fadeDuration);
      prev.fadeOut = curr.fadeIn;
    }
  }

  return events;
}

/**
 * Build the FFmpeg filter_complex for speech bubble overlays.
 *
 * For each event:
 *   1. Crop source area from [0:v], scale to fit inside bubble body
 *   2. Overlay the content ON TOP of the bubble PNG (content fills the white interior,
 *      border/tail/shadow remain visible around the edges)
 *   3. Overlay composed bubble onto the video with enable/disable timing
 *
 * Inputs: [0] = video, [1] = bubble PNG for event 0, [2] = bubble PNG for event 1, ...
 *
 * @param {Array<BubbleEvent>} bubbleEvents
 * @returns {{ filterComplex: string, outputLabel: string }}
 */
export function buildBubbleFilter(bubbleEvents) {
  if (bubbleEvents.length === 0) return null;

  const filters = [];
  let prevLabel = '0:v';

  // Shadow and border sizing (must match bubble.js defaults)
  const shadowSize = 5;
  const borderWidth = 3;

  for (let i = 0; i < bubbleEvents.length; i++) {
    const ev = bubbleEvents[i];
    const bubbleInput = `${1 + i}:v`;
    const contentLabel = `cnt${i}`;
    const composedLabel = `bub${i}`;
    const outLabel = i === bubbleEvents.length - 1 ? 'out' : `p${i}`;

    const enableExpr = `between(t,${f(ev.fadeIn)},${f(ev.fadeOut)})`;

    // Content size = bubble body minus border (so border is visible around content)
    const contentSize = ev.bubbleSize - borderWidth * 2;

    // Content position inside the bubble PNG depends on tail direction
    // For bottom tails: body starts at (shadowSize, shadowSize)
    // For top tails: body starts at (shadowSize, shadowSize + tailSize)
    const isTopTail = ev.tailDirection.startsWith('top');
    const contentX = shadowSize + borderWidth;
    const contentY = (isTopTail ? shadowSize + ev.tailSize + borderWidth : shadowSize + borderWidth);

    // 1. Crop source from video, scale to content size
    filters.push(
      `[0:v]crop=${ev.src.size}:${ev.src.size}:${ev.src.x}:${ev.src.y},` +
      `scale=${contentSize}:${contentSize}:flags=lanczos[${contentLabel}]`
    );

    // 2. Overlay content onto bubble PNG at the body interior position
    filters.push(
      `[${bubbleInput}][${contentLabel}]overlay=` +
      `x=${contentX}:y=${contentY}:format=auto[${composedLabel}]`
    );

    // 3. Overlay composed bubble onto the video at the right position with timing
    filters.push(
      `[${prevLabel}][${composedLabel}]overlay=` +
      `x=${ev.overlay.x}:y=${ev.overlay.y}:` +
      `enable='${enableExpr}':` +
      `format=auto[${outLabel}]`
    );

    prevLabel = outLabel;
  }

  return {
    filterComplex: filters.join(';'),
    outputLabel: 'out',
  };
}

// Keep backward compat for converter.js which uses buildZoomSegments
export function buildZoomSegments(timeline, options = {}) {
  const chains = buildZoomChains(timeline, options);
  // Flatten chains into segments (each chain = one segment for w/h, but with first target's crop)
  return chains.map(chain => ({
    startZoom: chain.startZoom,
    startHold: chain.zoomedAt,
    endHold: chain.unzoomAt,
    endZoom: chain.endZoom,
    crop: chain.targets[0].crop,
    zoomLevel: chain.zoomLevel,
  }));
}
