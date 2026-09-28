import { describe, expect, it } from 'vitest';
import { parseDriverName, stripSuffixes } from '../../src/data/model/names.ts';

const driver = (full: string, first: string, last: string, isInChase = false) => ({
  full_name: full,
  first_name: first,
  last_name: last,
  is_in_chase: isInChase,
});

describe('stripSuffixes', () => {
  it.each([
    ['Kyle Larson (C)', 'Kyle Larson', ['contender']],
    ['Austin Hill(i)', 'Austin Hill', ['ineligible']],
    ['Connor Zilisch #', 'Connor Zilisch', ['rookie']],
    ['Someone (i) #', 'Someone', ['ineligible', 'rookie']],
    ['Ricky Stenhouse Jr.', 'Ricky Stenhouse Jr.', []],
    ['  Plain Name  ', 'Plain Name', []],
  ])('%s', (raw, name, badges) => {
    const result = stripSuffixes(raw);
    expect(result.name).toBe(name);
    expect([...result.badges].sort()).toEqual([...badges].sort());
  });
});

describe('parseDriverName', () => {
  it('strips the marker from full and last name and badges a contender', () => {
    expect(parseDriverName(driver('Kyle Larson (C)', 'Kyle', 'Larson (C)', true))).toEqual({
      full: 'Kyle Larson',
      initial: 'K. Larson',
      last: 'Larson',
      badges: ['contender'],
    });
  });

  it('badges a contender from is_in_chase even without a (C) marker', () => {
    expect(parseDriverName(driver('Kyle Larson', 'Kyle', 'Larson', true)).badges).toEqual([
      'contender',
    ]);
  });

  it('handles markers with no leading space, and rookies', () => {
    expect(parseDriverName(driver('Austin Hill(i)', 'Austin', 'Hill(i)')).badges).toEqual([
      'ineligible',
    ]);
    const rookie = parseDriverName(driver('Connor Zilisch #', 'Connor', 'Zilisch #'));
    expect(rookie).toMatchObject({ last: 'Zilisch', badges: ['rookie'] });
  });

  it('shortens multi-word and initial-style first names sensibly', () => {
    const initial = (full: string, first: string, last: string) =>
      parseDriverName(driver(full, first, last)).initial;
    expect(initial('John Hunter Nemechek', 'John Hunter', 'Nemechek')).toBe('J.H. Nemechek');
    expect(initial('AJ Allmendinger', 'AJ', 'Allmendinger')).toBe('AJ Allmendinger');
    expect(initial('Shane Van Gisbergen', 'Shane', 'Van Gisbergen')).toBe('S. Van Gisbergen');
    expect(initial('Ricky Stenhouse Jr.', 'Ricky', 'Stenhouse Jr.')).toBe('R. Stenhouse Jr.');
  });

  it('derives missing parts from whatever is present', () => {
    expect(parseDriverName(driver('Kyle Larson (C)', '', ''))).toMatchObject({
      full: 'Kyle Larson',
      initial: 'K. Larson',
      last: 'Larson',
    });
    expect(parseDriverName(driver('', 'Kyle', 'Larson')).full).toBe('Kyle Larson');
    expect(parseDriverName(driver('', '', ''))).toMatchObject({
      full: 'Unknown driver',
      initial: 'Unknown driver',
      last: 'Unknown driver',
    });
  });
});
