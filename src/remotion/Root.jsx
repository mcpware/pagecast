import React from 'react';
import { Composition } from 'remotion';
import { ZoomComposition } from './ZoomComposition.jsx';

/**
 * Remotion Root — registers the ZoomVideo composition.
 *
 * When rendering via CLI, pass inputProps as JSON:
 *   npx remotion render src/remotion/Root.jsx ZoomVideo out.mp4 \
 *     --props='{"videoSrc":"recording.webm","timeline":{...}}'
 */
export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ZoomVideo"
        component={ZoomComposition}
        // These are defaults — overridden by --props at render time
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: '',
          timeline: { viewport: { width: 1280, height: 720 }, duration: 10, segments: [] },
        }}
      />
    </>
  );
};
