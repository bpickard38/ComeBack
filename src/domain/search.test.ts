import { describe, expect, it } from 'vitest';
import { searchAthletes } from './search';

const roster = [{ name: 'Maya Torres' }, { name: 'Jordan Reyes' }, { name: 'Devon Clarke' }, { name: 'Priya Nair' }, { name: 'José Mayfield' }];
const names = (query: string) => searchAthletes(roster, query).map((a) => a.name);

describe('searchAthletes', () => {
  it('returns everyone by name for an empty search', () => {
    expect(names('')).toEqual(['Devon Clarke', 'Jordan Reyes', 'José Mayfield', 'Maya Torres', 'Priya Nair']);
    expect(names('   ')).toHaveLength(5);
  });

  it('ignores case', () => {
    expect(names('JORDAN')).toEqual(['Jordan Reyes']);
  });

  it('finds part of a first or last name', () => {
    expect(names('rey')).toEqual(['Jordan Reyes']);
    expect(names('cla')).toEqual(['Devon Clarke']);
  });

  it('puts names that start with what was typed first', () => {
    expect(names('may')).toEqual(['Maya Torres', 'José Mayfield']);
  });

  it('needs every word, in any order', () => {
    expect(names('tor may')).toEqual(['Maya Torres']);
    expect(names('maya reyes')).toEqual([]);
  });

  it('ignores accents', () => {
    expect(names('jose')).toEqual(['José Mayfield']);
  });

  it('is empty when nobody matches', () => {
    expect(names('zzz')).toEqual([]);
  });

  it('leaves the list it was given alone', () => {
    const before = roster.map((a) => a.name);
    searchAthletes(roster, 'a');
    expect(roster.map((a) => a.name)).toEqual(before);
  });
});
