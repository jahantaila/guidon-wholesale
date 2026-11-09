import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadInstrument } from '@remotion/google-fonts/InstrumentSans';
import { loadFont as loadSourceSerif } from '@remotion/google-fonts/SourceSerif4';

// DESIGN.md: Fraunces (display), Source Serif 4 (body), Instrument Sans (UI).
export const display = loadFraunces('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
export const body = loadSourceSerif('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;
export const bodyItalic = loadSourceSerif('italic', { weights: ['400'], subsets: ['latin'] }).fontFamily;
export const ui = loadInstrument('normal', { weights: ['500', '600', '700'], subsets: ['latin'] }).fontFamily;
