import { describe, expect, it } from 'vitest';
import { inviteText, joinLink, parseJoinLink } from './join';

describe('joinLink', () => {
  it('puts the code and role on the home address', () => {
    expect(joinLink('https://comeback.example', '7F3A9C21', 'athlete')).toBe('https://comeback.example/?join=7F3A9C21&as=athlete');
  });

  it('copes with a trailing slash', () => {
    expect(joinLink('https://comeback.example/', '7F3A9C21', 'coach')).toBe('https://comeback.example/?join=7F3A9C21&as=coach');
  });
});

describe('parseJoinLink', () => {
  it('reads back what joinLink wrote', () => {
    const link = new URL(joinLink('https://comeback.example', '7F3A9C21', 'coach'));
    expect(parseJoinLink(link.search)).toEqual({ code: '7F3A9C21', role: 'coach' });
  });

  it('upper-cases and trims the code', () => {
    expect(parseJoinLink('?join=%207f3a9c21%20')).toEqual({ code: '7F3A9C21', role: null });
  });

  it('ignores a role it does not know, such as trainer', () => {
    expect(parseJoinLink('?join=7F3A9C21&as=trainer')).toEqual({ code: '7F3A9C21', role: null });
  });

  it('is null without a code, or with something that is not a code', () => {
    expect(parseJoinLink('')).toBeNull();
    expect(parseJoinLink('?with=coach')).toBeNull();
    expect(parseJoinLink('?join=')).toBeNull();
    expect(parseJoinLink('?join=<script>')).toBeNull();
  });
});

describe('inviteText', () => {
  it('names the team, the role and the code', () => {
    expect(inviteText('Demo Soccer', 'athlete', '7F3A9C21')).toBe(
      'Join Demo Soccer on Comeback as an athlete. Open the link to sign up, or enter join code 7F3A9C21.',
    );
    expect(inviteText('Demo Soccer', 'coach', 'ABCD1234')).toContain('as a coach');
  });
});
