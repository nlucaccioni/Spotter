import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, nextSort, sortCars } from '../../src/components/board/sort.ts';
import { parseLiveFeed } from '../../src/data/feeds/liveFeed.parse.ts';
import kansas from '../fixtures/cup-2026-kansas-final.json';

const result = parseLiveFeed(kansas);
if (!result.ok) throw new Error(result.error);
const cars = result.session.cars;

const numbers = (sorted: typeof cars) => sorted.map((c) => c.carNumber);

describe('nextSort', () => {
  it('toggles direction on the same column', () => {
    expect(nextSort(DEFAULT_SORT, 'pos')).toEqual({ column: 'pos', direction: 'desc' });
  });

  it('starts "bigger is better" columns descending and others ascending', () => {
    expect(nextSort(DEFAULT_SORT, 'led')).toEqual({ column: 'led', direction: 'desc' });
    expect(nextSort(DEFAULT_SORT, 'best')).toEqual({ column: 'best', direction: 'asc' });
  });
});

describe('sortCars', () => {
  it('defaults to running order and returns a copy', () => {
    const sorted = sortCars(cars, DEFAULT_SORT);
    expect(sorted.map((c) => c.position)).toEqual(cars.map((c) => c.position));
    expect(sorted).not.toBe(cars);
  });

  it('sorts by best lap, fastest first', () => {
    const sorted = sortCars(cars, { column: 'best', direction: 'asc' });
    expect(numbers(sorted).slice(0, 3)).toEqual(['5', '2', '20']);
  });

  it('sorts by laps led, most first, ties in running order', () => {
    const sorted = sortCars(cars, { column: 'led', direction: 'desc' });
    expect(numbers(sorted).slice(0, 2)).toEqual(['5', '19']);
    const zeros = sorted.filter((c) => c.lapsLed === 0).map((c) => c.position);
    expect(zeros).toEqual([...zeros].sort((a, b) => a - b));
  });

  it('sorts car numbers numerically', () => {
    const sorted = sortCars(cars, { column: 'car', direction: 'asc' });
    expect(numbers(sorted).slice(0, 4)).toEqual(['1', '2', '3', '4']);
  });

  it('puts unknown intervals last in both directions', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const sorted = sortCars(cars, { column: 'interval', direction });
      const firstUnknown = sorted.findIndex((c) => c.interval.kind === 'unknown');
      expect(sorted.slice(firstUnknown).every((c) => c.interval.kind === 'unknown')).toBe(true);
    }
  });

  it('sorts by driver last name', () => {
    const sorted = sortCars(cars, { column: 'driver', direction: 'asc' });
    expect(sorted[0]!.name.last).toBe('Allmendinger');
  });
});
