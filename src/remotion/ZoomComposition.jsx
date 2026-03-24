import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Video,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
} from 'remotion';

/**
 * Remotion composition that renders a raw screen recording
 * with smooth zoom/pan animations at interaction points.
 *
 * Props:
 *   videoSrc: path to the raw .webm recording
 *   timeline: Remotion timeline data from buildRemotionTimeline()
 */
export const ZoomComposition = ({ videoSrc, timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const { scale, translateX, translateY } = useMemo(() => {
    return getTransformAtTime(currentTime, timeline.segments, fps);
  }, [currentTime, timeline.segments, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
          transformOrigin: 'top left',
          willChange: 'transform',
        }}
      >
        <Video
          src={videoSrc}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * Calculate the transform (scale + translate) at a given time.
 * Uses Remotion's interpolate() with easeInOut for smooth transitions.
 */
function getTransformAtTime(currentTime, segments, fps) {
  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  for (const seg of segments) {
    if (currentTime < seg.startZoom || currentTime > seg.endZoom) continue;

    if (currentTime <= seg.startHold) {
      // Easing in: 1 -> target scale
      const progress = (currentTime - seg.startZoom) / (seg.startHold - seg.startZoom);
      const eased = easeInOutCubic(progress);
      scale = 1 + (seg.scale - 1) * eased;
      translateX = seg.translateX * eased;
      translateY = seg.translateY * eased;
    } else if (currentTime <= seg.endHold) {
      // Holding at target zoom
      scale = seg.scale;
      translateX = seg.translateX;
      translateY = seg.translateY;
    } else {
      // Easing out: target scale -> 1
      const progress = (currentTime - seg.endHold) / (seg.endZoom - seg.endHold);
      const eased = easeInOutCubic(progress);
      scale = seg.scale + (1 - seg.scale) * eased;
      translateX = seg.translateX * (1 - eased);
      translateY = seg.translateY * (1 - eased);
    }
    break; // Only one segment active at a time (they don't overlap after merging)
  }

  return { scale, translateX, translateY };
}

/** Cubic ease-in-out: smooth acceleration and deceleration */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
