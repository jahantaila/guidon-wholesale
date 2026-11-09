import React from 'react';
import { Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { easeOut } from '../anim';
import { ui } from '../fonts';

export type StampSpec = {
  at: number;
  lines: string[];
  x: number; // canvas center
  y: number;
  rotate?: number;
  color: string;
};

/** A rubber trade stamp that presses onto the page with a soft thunk. */
export const Stamp: React.FC<StampSpec> = ({ at, lines, x, y, rotate = -6, color }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0) return null;
  const press = interpolate(t, [0, 7], [1.9, 1], { easing: easeOut, extrapolateRight: 'clamp' });
  const settle = t >= 7 ? 1 + 0.025 * Math.sin((t - 7) * 0.9) * Math.exp(-(t - 7) * 0.35) : 1;
  const opacity = interpolate(t, [0, 5], [0, 0.88], { extrapolateRight: 'clamp' });
  const id = `ink-${at}`;
  return (
    <>
      <Sequence from={at + 6} durationInFrames={20} layout="none">
        <Audio src={staticFile('audio/stamp.wav')} volume={0.7} />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${press * settle})`,
          opacity,
          color,
          border: `5px solid ${color}`,
          outline: `2px solid ${color}`,
          outlineOffset: 5,
          padding: '18px 34px',
          fontFamily: ui,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.15,
          filter: `url(#${id})`,
          background: 'rgba(245, 239, 223, 0.55)',
        }}
      >
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={id}>
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={at} />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </svg>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: i === 0 ? 40 : 26 }}>
            {l}
          </div>
        ))}
      </div>
    </>
  );
};
