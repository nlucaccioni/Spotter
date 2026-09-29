/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// WCAG 2.x contrast check of the theme tokens in src/styles/global.css. Every text/background
// pair the board actually uses must reach AA for normal text (4.5:1); non-text UI parts (row
// accents, outlines) need 3:1.

// Read from disk: Vitest blanks CSS imports (even ?raw).
const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block`);
  return css.slice(start, css.indexOf('}', start));
}

function tokens(...blocks: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const text of blocks) {
    for (const [, name, value] of text.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      map.set(name!, value!.trim());
    }
  }
  return map;
}

const dark = tokens(block(":root[data-theme='dark']"));
const light = tokens(block(":root[data-theme='dark']"), block(":root[data-theme='light']"));

type Rgb = [number, number, number];

function resolve(theme: Map<string, string>, value: string): Rgb {
  const v = value.trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return resolve(theme, theme.get(ref[1]!) ?? '');
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, (.+)\)$/i.exec(v);
  if (mix) {
    const a = hex(mix[1]!);
    const b = resolve(theme, mix[3]!);
    const p = Number(mix[2]) / 100;
    return [0, 1, 2].map((i) => a[i]! * p + b[i]! * (1 - p)) as Rgb;
  }
  if (/^#[0-9a-f]{3,6}$/i.test(v)) return hex(v);
  throw new Error(`Can't resolve color "${value}"`);
}

function hex(value: string): Rgb {
  const h = value.length === 4 ? [...value.slice(1)].map((c) => c + c).join('') : value.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [what, foreground, background, minimum ratio]
const TEXT = 4.5;
const UI = 3;
const PAIRS: [string, string, string, number][] = [
  ['body text', '--text', '--bg', TEXT],
  ['body text on striped rows', '--text', '--row-alt', TEXT],
  ['body text on panels', '--text', '--surface', TEXT],
  ['muted text', '--text-muted', '--bg', TEXT],
  ['muted text on striped rows', '--text-muted', '--row-alt', TEXT],
  ['muted text on panels', '--text-muted', '--surface', TEXT],
  ['gain arrows', '--up', '--bg', TEXT],
  ['loss arrows', '--down', '--bg', TEXT],
  ['personal-best lap', '--personal-best', '--bg', TEXT],
  ['session-best lap', '--session-best', '--bg', TEXT],
  ['favorite name', '--favorite', '--bg', TEXT],
  ['favorite name on striped rows', '--favorite', '--row-alt', TEXT],
  ['contender badge', '--badge-contender', '--badge-bg', TEXT],
  ['i / R badges', '--text-muted', '--badge-bg', TEXT],
  ['OUT badge', '--badge-pit', '--bg', TEXT],
  ['PIT badge', '--bg', '--badge-pit', TEXT],
  ['Chevy chip', '--mfr-chv-text', '--mfr-chv', TEXT],
  ['Ford chip', '--mfr-frd-text', '--mfr-frd', TEXT],
  ['Toyota chip', '--mfr-tyt-text', '--mfr-tyt', TEXT],
  ['stale warning', '--stale-text', '--stale-bg', TEXT],
  ['text on gain flash', '--text', '--flash-up', TEXT],
  ['text on loss flash', '--text', '--flash-down', TEXT],
  ['favorite accent bar', '--favorite', '--bg', UI],
  ['borders vs background (UI)', '--text-muted', '--bg', UI],
];

describe.each([
  ['dark', dark],
  ['light', light],
])('%s theme contrast', (_name, theme) => {
  it.each(PAIRS)('%s (%s on %s) ≥ %s:1', (_what, fg, bg, min) => {
    const ratio = contrast(resolve(theme, `var(${fg})`), resolve(theme, `var(${bg})`));
    expect(Math.round(ratio * 100) / 100).toBeGreaterThanOrEqual(min);
  });
});

// Flag banner text sits on fixed flag colors (board.css), identical in both themes.
const FLAGS: [string, string, string][] = [
  ['green flag', '#ffffff', '--flag-green'],
  ['yellow flag', '#111111', '--flag-yellow'],
  ['red flag', '#ffffff', '--flag-red'],
];

describe('flag banner contrast', () => {
  it.each(FLAGS)('%s text ≥ 4.5:1', (_what, fg, bg) => {
    const ratio = contrast(hex(fg), resolve(dark, `var(${bg})`));
    expect(Math.round(ratio * 100) / 100).toBeGreaterThanOrEqual(TEXT);
  });
});
