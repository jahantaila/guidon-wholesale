// Tokens from DESIGN.md (light mode). Do not add colors outside this palette.
export const C = {
  paper: '#F5EFDF',
  surface: '#EEE5CE',
  card: '#FBF7EA',
  divider: '#D8CDA8',
  ink: '#2A2416',
  muted: '#6B5F48',
  faint: '#9B8D6F',
  brass: '#9E7A3B',
  brassDim: '#7C5F2E',
  olive: '#3D4F2F',
  ruby: '#8C3B2E',
  pine: '#2F5436',
} as const;

/** rgba() from a palette hex. */
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
