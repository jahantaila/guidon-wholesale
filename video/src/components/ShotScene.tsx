import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Key, ramp, smooth, track } from '../anim';
import { ui } from '../fonts';
import shots from '../shots.json';
import { C, alpha } from '../theme';
import { Caption, CaptionCue } from './Caption';
import { Stamp, StampSpec } from './Stamp';

export type ShotName = keyof typeof shots;
export type Box = { x: number; y: number; w: number; h: number };

export type SceneSpec = {
  id: string;
  step: number;
  title: string;
  duration: number;
  url: string;
  /** Screens in order. `reveal` wipes the new screen in, left→right, inside each box (typing). */
  states: { at: number; shot: ShotName; fade?: number; reveal?: { box: Box; at: number; len?: number }[] }[];
  /** Camera focus in page px (pre-scroll), zoom, and page scroll. */
  camera: Key<{ x: number; y: number; z: number; scroll?: number }>[];
  /** Cursor path in page px. `click` plays a press + ripple + sound on arrival. */
  cursor?: Key<{ x: number; y: number; click?: boolean }>[];
  cursorHideAt?: number;
  highlights?: { from: number; to: number; box: Box }[];
  captions: CaptionCue[];
  stamps?: StampSpec[];
};

// Layout of the browser frame on the 1920×1080 canvas at zoom 1.
const S0 = 0.86; // screenshot CSS px → canvas px
const VW = 1440;
const VH = 900;
const CHROME = 40; // browser title bar height (canvas px at zoom 1)
const FX = (1920 - VW * S0) / 2;
const FY = 30;
const CENTER = { x: FX + (VW / 2) * S0, y: FY + CHROME + (VH / 2) * S0 };

const shotMeta = (name: ShotName) => shots[name] as unknown as { file: string; width: number; height: number };

export const ShotScene: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();

  // Fill forward missing scroll values so every key is complete.
  let lastScroll = 0;
  const cam = spec.camera.map((k) => {
    lastScroll = k.scroll ?? lastScroll;
    return { ...k, scroll: lastScroll };
  });
  const z = track(frame, cam, (k) => k.z);
  const fx = track(frame, cam, (k) => k.x);
  const fy = track(frame, cam, (k) => k.y);
  const scroll = track(frame, cam, (k) => k.scroll);

  // world (base layout canvas px) → screen
  const focusBase = { x: FX + fx * S0, y: FY + CHROME + (fy - scroll) * S0 };
  const tx = CENTER.x - focusBase.x * z;
  const ty = CENTER.y - focusBase.y * z;
  const pageToScreen = (px: number, py: number) => ({
    x: tx + (FX + px * S0) * z,
    y: ty + (FY + CHROME + (py - scroll) * S0) * z,
  });

  const pageHeight = Math.max(...spec.states.map((st) => shotMeta(st.shot).height));

  // Cursor
  const cursor = spec.cursor ?? [];
  const cursorOn = cursor.length > 0 && frame >= cursor[0].at - 10 && (spec.cursorHideAt === undefined || frame < spec.cursorHideAt);
  const cx = track(frame, cursor, (k) => k.x);
  const cy = track(frame, cursor, (k) => k.y);
  const cPos = pageToScreen(cx, cy);
  const clicks = cursor.filter((k) => k.click).map((k) => k.at);
  const lastClick = clicks.filter((c) => c <= frame).pop();
  const sinceClick = lastClick === undefined ? 99 : frame - lastClick;
  const press = sinceClick < 8 ? 1 - 0.18 * Math.sin((sinceClick / 8) * Math.PI) : 1;
  const cursorFade = cursor.length ? ramp(frame, cursor[0].at - 10, cursor[0].at) * (spec.cursorHideAt ? 1 - ramp(frame, spec.cursorHideAt - 8, spec.cursorHideAt) : 1) : 0;

  return (
    <AbsoluteFill>
      {/* Camera world */}
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <div
          style={{
            position: 'absolute',
            left: FX,
            top: FY,
            width: VW * S0,
            height: CHROME + VH * S0,
            background: C.surface,
            border: `1px solid ${C.divider}`,
            boxShadow: `0 40px 80px ${alpha(C.ink, 0.18)}, 0 8px 20px ${alpha(C.ink, 0.08)}`,
          }}
        >
          {/* Title bar */}
          <div style={{ height: CHROME, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, borderBottom: `1px solid ${C.divider}` }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 11, height: 11, borderRadius: 6, background: C.divider }} />
            ))}
            <div
              style={{
                marginLeft: 24,
                flex: 1,
                maxWidth: 520,
                height: 24,
                background: C.card,
                border: `1px solid ${C.divider}`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                fontFamily: ui,
                fontSize: 14,
                color: C.muted,
                letterSpacing: '0.02em',
              }}
            >
              {spec.url}
            </div>
          </div>
          {/* Viewport */}
          <div style={{ position: 'relative', width: VW * S0, height: VH * S0, overflow: 'hidden', background: C.paper }}>
            {/* Explicit height: the reveal clip-paths are measured against this box. */}
            <div style={{ position: 'absolute', left: 0, top: -scroll * S0, width: VW * S0, height: pageHeight * S0 }}>
              {spec.states.map((st, i) => {
                if (frame < st.at && i > 0) return null;
                const meta = shotMeta(st.shot);
                const img = (
                  <Img
                    src={staticFile(meta.file)}
                    style={{ position: 'absolute', left: 0, top: 0, width: VW * S0, height: meta.height * S0 }}
                  />
                );
                if (i === 0) return <React.Fragment key={i}>{img}</React.Fragment>;
                if (st.reveal && st.reveal.length) {
                  const end = Math.max(...st.reveal.map((r) => r.at + (r.len ?? 16)));
                  if (frame >= end + 2) return <React.Fragment key={i}>{img}</React.Fragment>;
                  return st.reveal.map((r, ri) => {
                    const p = ramp(frame, r.at, r.at + (r.len ?? 16), smooth);
                    if (p <= 0) return null;
                    const pad = 4;
                    const W = VW * S0;
                    const H = meta.height * S0;
                    const l = (r.box.x - pad) * S0;
                    const t = (r.box.y - pad) * S0;
                    const rgt = W - (r.box.x - pad + (r.box.w + pad * 2) * p) * S0;
                    const btm = H - (r.box.y + r.box.h + pad) * S0;
                    return (
                      <div key={`${i}-${ri}`} style={{ position: 'absolute', inset: 0, clipPath: `inset(${t}px ${rgt}px ${btm}px ${l}px)` }}>
                        {img}
                      </div>
                    );
                  });
                }
                const o = ramp(frame, st.at, st.at + (st.fade ?? 8), smooth);
                return (
                  <div key={i} style={{ position: 'absolute', inset: 0, opacity: o }}>
                    {img}
                  </div>
                );
              })}
              {/* Spotlight highlights */}
              {(spec.highlights ?? []).map((h, i) => {
                const o = ramp(frame, h.from, h.from + 12) * (1 - ramp(frame, h.to - 10, h.to));
                if (o <= 0) return null;
                const grow = 1 - ramp(frame, h.from, h.from + 14);
                const pad = 10 + grow * 18;
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: (h.box.x - pad) * S0,
                      top: (h.box.y - pad) * S0,
                      width: (h.box.w + pad * 2) * S0,
                      height: (h.box.h + pad * 2) * S0,
                      opacity: o,
                      border: `3px solid ${C.brass}`,
                      boxShadow: `0 0 0 4000px ${alpha(C.ink, 0.3)}, 0 0 24px ${alpha(C.brass, 0.45)}`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Click ripples + sounds */}
      {clicks.map((at) => {
        const t = frame - at;
        const k = cursor.find((c) => c.at === at)!;
        const pos = pageToScreen(k.x, k.y);
        return (
          <React.Fragment key={at}>
            <Sequence from={at} durationInFrames={10} layout="none">
              <Audio src={staticFile('audio/click.wav')} volume={0.55} />
            </Sequence>
            {t >= 0 && t < 22 && (
              <div
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: 80,
                  height: 80,
                  marginLeft: -40,
                  marginTop: -40,
                  borderRadius: 40,
                  border: `3px solid ${C.brass}`,
                  transform: `scale(${0.2 + ramp(frame, at, at + 22) * 1.1})`,
                  opacity: 1 - ramp(frame, at, at + 22),
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Cursor */}
      {cursorOn && (
        <svg
          width={40}
          height={48}
          viewBox="0 0 20 24"
          style={{
            position: 'absolute',
            left: cPos.x - 4,
            top: cPos.y - 3,
            opacity: cursorFade,
            transform: `scale(${press})`,
            transformOrigin: '4px 3px',
            filter: `drop-shadow(0 4px 6px ${alpha(C.ink, 0.35)})`,
          }}
        >
          <path d="M2 1.5 L2 19 L6.6 14.8 L9.6 21.6 L12.6 20.3 L9.7 13.6 L16 13.6 Z" fill={C.ink} stroke={C.card} strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
      )}

      {(spec.stamps ?? []).map((s, i) => (
        <Stamp key={i} {...s} />
      ))}

      <Caption step={spec.step} title={spec.title} cues={spec.captions} />
    </AbsoluteFill>
  );
};
