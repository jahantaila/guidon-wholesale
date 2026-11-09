import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, alpha } from '../theme';

/** Cream newsprint with faint grain and a soft vignette (DESIGN.md: paper grain ~3%). */
export const Paper: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.07 }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${alpha(C.brassDim, 0.12)} 100%)`,
      }}
    />
  </AbsoluteFill>
);
