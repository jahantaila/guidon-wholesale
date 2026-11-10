/**
 * Generates the video's audio from code, so there is nothing to license:
 *   public/audio/music.wav  warm, slow ambient bed (Rhodes-ish keys + pad)
 *   public/audio/click.wav  soft UI click
 *   public/audio/stamp.wav  low "thunk" for the letterpress stamps
 *
 * Deterministic (seeded), mono, 44.1 kHz, 16-bit.
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, '../public/audio');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([h, data]));
}

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ── Music ────────────────────────────────────────────────────────────────
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const SECONDS = Number(process.env.MUSIC_SECONDS || 130);
const N = Math.ceil(SECONDS * SR);
const buf = new Float32Array(N);

// D major, gentle: Dmaj7 – Bm7 – Gmaj7 – A6sus
const CHORDS = [
  [50, 57, 61, 64, 66], // D  A  C# E  F#
  [47, 54, 57, 61, 62], // B  F# A  C# D
  [43, 50, 54, 57, 59], // G  D  F# A  B
  [45, 52, 54, 57, 62], // A  E  F# A  D
];

function addNote(freq, start, dur, amp, kind) {
  const s0 = Math.floor(start * SR);
  const len = Math.floor((dur + 2.5) * SR);
  for (let i = 0; i < len && s0 + i < N; i++) {
    const t = i / SR;
    let env;
    let v;
    if (kind === 'key') {
      // Electric-piano-ish: quick attack, exponential decay, soft bell partial.
      env = Math.min(1, t / 0.008) * Math.exp(-t * 1.6);
      v = Math.sin(2 * Math.PI * freq * t)
        + 0.25 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 4)
        + 0.08 * Math.sin(2 * Math.PI * freq * 3.01 * t) * Math.exp(-t * 7);
    } else {
      // Pad: slow swell, slightly detuned pair, release after dur.
      const att = Math.min(1, t / 1.6);
      const rel = t > dur ? Math.exp(-(t - dur) * 2.2) : 1;
      env = att * rel;
      v = Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 1.003 * t + 1.3)
        + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t);
      v *= 0.4;
    }
    buf[s0 + i] += v * env * amp;
  }
}

const bars = Math.ceil(SECONDS / BAR);
for (let b = 0; b < bars; b++) {
  const chord = CHORDS[b % CHORDS.length];
  const t0 = b * BAR;
  // Pad holds the chord for the whole bar.
  for (const n of chord.slice(0, 4)) addNote(midi(n), t0, BAR, 0.035, 'pad');
  // Bass on beat 1.
  addNote(midi(chord[0] - 12), t0, BAR, 0.09, 'key');
  // Lazy broken-chord on the keys, slightly humanized.
  const pattern = [1, 2, 3, 4, 3, 2];
  for (let k = 0; k < pattern.length; k++) {
    const t = t0 + k * (BAR / pattern.length) + (rand() - 0.5) * 0.02;
    addNote(midi(chord[pattern[k]] + 12), t, 0.5, 0.05 + rand() * 0.015, 'key');
  }
}

// Fade in / out, simple soft limiter, normalize to a quiet peak.
const fadeIn = 2.5 * SR;
const fadeOut = 4 * SR;
let peak = 0;
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > N - fadeOut) g = Math.max(0, (N - i) / fadeOut);
  buf[i] = Math.tanh(buf[i] * 1.4) * g;
  peak = Math.max(peak, Math.abs(buf[i]));
}
for (let i = 0; i < N; i++) buf[i] = (buf[i] / peak) * 0.6;
writeWav('music.wav', buf);

// ── Click ────────────────────────────────────────────────────────────────
{
  const n = Math.floor(0.06 * SR);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    c[i] = (Math.sin(2 * Math.PI * 1800 * t) * 0.5 + (rand() * 2 - 1) * 0.5) * Math.exp(-t * 90) * 0.6;
  }
  writeWav('click.wav', c);
}

// ── Stamp ────────────────────────────────────────────────────────────────
{
  const n = Math.floor(0.35 * SR);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 140 * Math.exp(-t * 6) + 55;
    c[i] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) + (rand() * 2 - 1) * Math.exp(-t * 60) * 0.35) * 0.8;
  }
  writeWav('stamp.wav', c);
}

console.log('audio written to', OUT);
