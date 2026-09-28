import { describe, expect, it } from 'vitest';
import { manufacturerFromCode, seriesFromId } from '../../src/data/model/lookups.ts';

describe('manufacturerFromCode', () => {
  it('maps known codes and passes unknown ones through', () => {
    expect(manufacturerFromCode('Chv')).toEqual({ code: 'Chv', name: 'Chevrolet' });
    expect(manufacturerFromCode('Frd').name).toBe('Ford');
    expect(manufacturerFromCode('Tyt').name).toBe('Toyota');
    expect(manufacturerFromCode('Dge').name).toBe('Dge');
    expect(manufacturerFromCode('').name).toBe('Unknown');
  });
});

describe('seriesFromId', () => {
  it('maps known ids and labels unknown ones', () => {
    expect(seriesFromId(1)).toEqual({ id: 1, name: 'Cup Series' });
    expect(seriesFromId(8).name).toBe('Series 8');
    expect(seriesFromId(null).name).toBe('Unknown series');
  });
});
