import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { easeOut, ramp } from '../anim';
import { bodyItalic, display, ui } from '../fonts';
import { C } from '../theme';

const Rise: React.FC<{ text: string; start: number; size: number; style?: React.CSSProperties }> = ({ text, start, size, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ fontFamily: display, fontSize: size, color: C.ink, fontWeight: 500, letterSpacing: '-0.01em', ...style }}>
      {text.split(' ').map((w, i) => {
        const p = ramp(frame, start + i * 4, start + i * 4 + 18);
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 30}px)`, marginRight: size * 0.25 }}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

const Rule: React.FC<{ start: number; width: number }> = ({ start, width }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, start, start + 24);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
      <div style={{ width: width * p, height: 1.5, background: C.brass }} />
      <div style={{ width: 9, height: 9, background: C.brass, transform: `rotate(45deg) scale(${p})` }} />
      <div style={{ width: width * p, height: 1.5, background: C.brass }} />
    </div>
  );
};

const Overline: React.FC<{ text: string; start: number }> = ({ text, start }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, start, start + 20);
  return (
    <div style={{ fontFamily: ui, fontWeight: 600, fontSize: 22, letterSpacing: `${0.2 + (1 - p) * 0.2}em`, textTransform: 'uppercase', color: C.brass, opacity: p }}>
      {text}
    </div>
  );
};

/** Logo pressed onto the paper like a letterpress block. */
const LogoStamp: React.FC<{ at: number; height: number }> = ({ at, height }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  const scale = interpolate(t, [0, 9], [1.7, 1], { easing: easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const o = interpolate(t, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <Sequence from={at + 7} durationInFrames={20} layout="none">
        <Audio src={staticFile('audio/stamp.wav')} volume={0.6} />
      </Sequence>
      <Img src={staticFile('logo.png')} style={{ height, opacity: o, transform: `scale(${scale})` }} />
    </>
  );
};

export const Intro: React.FC = () => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 34, flexDirection: 'column' }}>
    <LogoStamp at={8} height={150} />
    <Overline text="Guidon Brewing Co. · Wholesale" start={26} />
    <Rise text="Welcome to Guidon Wholesale" start={36} size={104} />
    <Rule start={52} width={260} />
    <div style={{ fontFamily: bodyItalic, fontSize: 36, color: C.muted, opacity: ramp(useCurrentFrame(), 70, 92) }}>
      A two-minute tour of your wholesale portal
    </div>
  </AbsoluteFill>
);

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 30, flexDirection: 'column' }}>
      <LogoStamp at={6} height={110} />
      <Rise text="Cheers — see you Thursday." start={22} size={110} />
      <Rule start={44} width={220} />
      <div style={{ fontFamily: ui, fontWeight: 600, fontSize: 34, letterSpacing: '0.06em', color: C.brass, opacity: ramp(frame, 56, 76) }}>
        guidonbrewing.com/wholesale
      </div>
      <div style={{ fontFamily: bodyItalic, fontSize: 30, color: C.muted, opacity: ramp(frame, 70, 90) }}>
        Questions? Reply to any Guidon email. It comes straight to the brewery.
      </div>
    </AbsoluteFill>
  );
};
