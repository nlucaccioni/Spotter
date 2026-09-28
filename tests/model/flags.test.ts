import { describe, expect, it } from 'vitest';
import { flagFromCode } from '../../src/data/model/flags.ts';

describe('flagFromCode', () => {
  it.each([
    [1, 'green', 'Green'],
    [2, 'yellow', 'Caution'],
    [3, 'red', 'Red flag'],
    [4, 'white', 'White flag'],
    [9, 'checkered', 'Checkered'],
  ])('maps %i to %s', (code, kind, label) => {
    expect(flagFromCode(code)).toEqual({ code, kind, label });
  });

  it('renders unmapped codes as Unknown (n) instead of failing', () => {
    expect(flagFromCode(7)).toEqual({ code: 7, kind: 'unknown', label: 'Unknown (7)' });
    expect(flagFromCode(0)).toEqual({ code: 0, kind: 'unknown', label: 'Unknown (0)' });
    expect(flagFromCode(null)).toEqual({ code: null, kind: 'unknown', label: 'Unknown' });
  });
});
