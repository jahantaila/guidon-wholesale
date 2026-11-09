import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { easeOut, ramp } from '../anim';
import { body, ui } from '../fonts';
import { C, alpha } from '../theme';

export type CaptionCue = { from: number; text: string };

export const TOTAL_STEPS = 10;

const Words: React.FC<{ text: string; start: number; frame: number }> = ({ text, start, frame }) => {
  // Allow **bold** spans for UI names (e.g. **Place Order**).
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
  let i = 0;
  return (
    <>
      {parts.map((part, pi) => {
        const bold = part.startsWith('**');
        const words = (bold ? part.slice(2, -2) : part).split(/(\s+)/);
        return words.map((w, wi) => {
          if (/^\s+$/.test(w) || w === '') return <span key={`${pi}-${wi}`}>{w}</span>;
          const p = ramp(frame, start + i * 1.6, start + i * 1.6 + 10);
          i++;
          return (
            <span
              key={`${pi}-${wi}`}
              style={{
                display: 'inline-block',
                opacity: p,
                transform: `translateY(${(1 - p) * 14}px)`,
                fontWeight: bold ? 600 : 400,
                color: bold ? C.brassDim : C.ink,
              }}
            >
              {w}
            </span>
          );
        });
      })}
    </>
  );
};

/** Lower caption card: step overline, script line, and a 10-step progress rail. */
export const Caption: React.FC<{ step: number; title: string; cues: CaptionCue[] }> = ({ step, title, cues }) => {
  const frame = useCurrentFrame();
  const enter = ramp(frame, 4, 22);
  const idx = cues.reduce((acc, c, i) => (frame >= c.from ? i : acc), 0);
  const cur = cues[idx];
  const prev = idx > 0 ? cues[idx - 1] : null;
  const prevOut = prev ? 1 - ramp(frame, cur.from, cur.from + 6) : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 240,
        right: 240,
        top: 862,
        height: 176,
        background: C.card,
        border: `1px solid ${C.divider}`,
        boxShadow: `0 18px 40px ${alpha(C.ink, 0.12)}`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 30}px)`,
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div style={{ width: 8, background: C.brass }} />
      <div style={{ flex: 1, padding: '24px 40px 0 36px', position: 'relative' }}>
        <div
          style={{
            fontFamily: ui,
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: C.brass,
          }}
        >
          Step {String(step).padStart(2, '0')} &nbsp;·&nbsp; {title}
        </div>
        <div style={{ position: 'relative', marginTop: 12, fontFamily: body, fontSize: 38, lineHeight: 1.28 }}>
          {prev && prevOut > 0 && (
            <div style={{ position: 'absolute', inset: 0, opacity: prevOut, color: C.ink }}>
              {prev.text.replace(/\*\*/g, '')}
            </div>
          )}
          <div>
            <Words text={cur.text} start={cur.from + (prev ? 4 : 10)} frame={frame} />
          </div>
        </div>
      </div>
      <div
        style={{
          width: 230,
          borderLeft: `1px solid ${C.divider}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div style={{ fontFamily: ui, fontSize: 30, fontWeight: 600, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
          {String(step).padStart(2, '0')}
          <span style={{ color: C.faint }}> / {TOTAL_STEPS}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const fill = i + 1 < step ? 1 : i + 1 === step ? interpolate(frame, [10, 30], [0, 1], { easing: easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
            return (
              <div key={i} style={{ width: 12, height: 12, border: `1.5px solid ${C.brass}`, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: C.brass, transform: `scale(${fill})` }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
