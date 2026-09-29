import { describe, expect, it } from 'vitest';
import { createDelayBuffer } from '../src/data/delayBuffer.ts';

describe('createDelayBuffer', () => {
  it('passes snapshots straight through with no delay', () => {
    const buffer = createDelayBuffer<string>();
    buffer.push('a', 1000);
    expect(buffer.release(1000, 0)).toEqual({ value: 'a', at: 1000 });
    expect(buffer.release(1000, 0)).toBeNull();
  });

  it('holds snapshots until they are old enough, then releases the newest due one', () => {
    const buffer = createDelayBuffer<string>();
    buffer.push('a', 0);
    buffer.push('b', 5_000);
    buffer.push('c', 10_000);
    expect(buffer.release(20_000, 30_000)).toBeNull();
    expect(buffer.nextDueAt(30_000)).toBe(30_000);
    // At 36 s, 'a' (0 s) and 'b' (5 s) are both 30 s old; 'b' is the newest due.
    expect(buffer.release(36_000, 30_000)).toEqual({ value: 'b', at: 5_000 });
    expect(buffer.size()).toBe(1);
    expect(buffer.nextDueAt(30_000)).toBe(40_000);
    expect(buffer.release(40_000, 30_000)).toEqual({ value: 'c', at: 10_000 });
    expect(buffer.nextDueAt(30_000)).toBeNull();
  });

  it('jumps forward when the delay is shortened', () => {
    const buffer = createDelayBuffer<string>();
    buffer.push('a', 0);
    buffer.push('b', 5_000);
    expect(buffer.release(10_000, 60_000)).toBeNull();
    expect(buffer.release(10_000, 0)?.value).toBe('b');
  });

  it('caps how much it holds', () => {
    const buffer = createDelayBuffer<number>(3);
    for (let i = 0; i < 10; i++) buffer.push(i, i * 1000);
    expect(buffer.size()).toBe(3);
    expect(buffer.release(1_000_000, 0)?.value).toBe(9);
  });
});
