import React from 'react';
import { Composition } from 'remotion';
import { Onboarding, totalDuration } from './Onboarding';
import { FPS, HEIGHT, WIDTH } from './theme';

export const Root: React.FC = () => (
  <Composition id="Onboarding" component={Onboarding} durationInFrames={totalDuration()} fps={FPS} width={WIDTH} height={HEIGHT} />
);
