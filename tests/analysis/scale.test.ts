import { describe, expect, it } from 'vitest';
import { clampView } from '../../src/components/analysis/scale.ts';

describe('clampView', () => {
  it('leaves a range inside the chart alone', () => {
    expect(clampView([5, 12], [0, 35], 3)).toEqual([5, 12]);
  });

  it('slides a range that runs off either end back inside, keeping its width', () => {
    expect(clampView([-4, 6], [0, 35], 3)).toEqual([0, 10]);
    expect(clampView([30, 40], [0, 35], 3)).toEqual([25, 35]);
  });

  it('widens a range narrower than the minimum', () => {
    expect(clampView([10, 11], [0, 35], 3)).toEqual([10, 13]);
    expect(clampView([34, 35], [0, 35], 3)).toEqual([32, 35]);
  });

  it('never goes wider than the chart', () => {
    expect(clampView([-10, 50], [0, 35], 3)).toEqual([0, 35]);
  });
});
