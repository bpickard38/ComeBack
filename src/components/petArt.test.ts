/* Tests for the pet's recoloring and number drawing math in petArt.ts. */
import { describe, expect, it } from 'vitest';
import { numberBlocks, numberColor, tint } from './petArt';

describe('pet art', () => {
  it('keeps the chosen color at normal shade, darkens shadows and lightens highlights', () => {
    expect(tint('#204080', 128)).toEqual([0x20, 0x40, 0x80]);
    expect(tint('#204080', 64)).toEqual([0x10, 0x20, 0x40]);
    expect(tint('#204080', 256)).toEqual([255, 255, 255]);
  });

  it('uses dark numbers on light jerseys and white on dark ones', () => {
    expect(numberColor('#d9a521')).toBe('#1d2230');
    expect(numberColor('#22408f')).toBe('#f5f6f8');
  });

  it('fits the number inside its spot, centered', () => {
    for (const n of [7, 12, 88]) {
      const blocks = numberBlocks(n, 30, 40);
      const left = Math.min(...blocks.map((b) => b.x));
      const right = Math.max(...blocks.map((b) => b.x + b.size));
      const top = Math.min(...blocks.map((b) => b.y));
      const bottom = Math.max(...blocks.map((b) => b.y + b.size));
      expect(right - left).toBeLessThanOrEqual(40.001);
      expect(bottom - top).toBeLessThanOrEqual(30.001);
      expect(Math.abs(top + bottom)).toBeLessThan(0.001);
    }
  });
});
