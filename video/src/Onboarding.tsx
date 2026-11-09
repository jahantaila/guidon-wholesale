import React from 'react';
import { AbsoluteFill, Audio, interpolate, staticFile, useVideoConfig } from 'remotion';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Paper } from './components/Paper';
import { ShotScene } from './components/ShotScene';
import { Intro, Outro } from './components/TitleCards';
import { SCENES } from './scenes';

export const INTRO = 150;
export const OUTRO = 180;
export const XFADE = 14;

export const totalDuration = () =>
  INTRO + OUTRO + SCENES.reduce((s, sc) => s + sc.duration, 0) - XFADE * (SCENES.length + 1);

export const Onboarding: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const t = linearTiming({ durationInFrames: XFADE });
  return (
    <AbsoluteFill>
      <Paper />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO}>
          <Intro />
        </TransitionSeries.Sequence>
        {SCENES.flatMap((sc) => [
          <TransitionSeries.Transition key={`t-${sc.id}`} presentation={fade()} timing={t} />,
          <TransitionSeries.Sequence key={sc.id} durationInFrames={sc.duration}>
            <ShotScene spec={sc} />
          </TransitionSeries.Sequence>,
        ])}
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence durationInFrames={OUTRO}>
          <Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio
        src={staticFile('audio/music.wav')}
        volume={(f) =>
          0.32 * interpolate(f, [durationInFrames - 75, durationInFrames - 5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        }
      />
    </AbsoluteFill>
  );
};
