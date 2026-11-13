/* Tests for the pet's recoloring and number drawing in petArt.ts. */
import { describe, expect, it } from 'vitest';
import palette from '../assets/pet/palette.json';
import { DEFAULT_LOOK } from '../domain/pet';
import { colorSwaps, numberBlocks, numberColor, numberSpot, tint } from './petArt';

describe('pet art', () => {
  it('keeps the chosen color at normal shade, darkens shadows and lightens highlights', () => {
    expect(tint('#204080', 128)).toEqual([0x20, 0x40, 0x80]);
    expect(tint('#204080', 64)).toEqual([0x10, 0x20, 0x40]);
    expect(tint('#204080', 256)).toEqual([255, 255, 255]);
  });

  it('has uniform and skin colors to swap, and the default look leaves the main ones unchanged', () => {
    expect(palette.some((e) => e.role === 'uniform')).toBe(true);
    expect(palette.some((e) => e.role === 'skin')).toBe(true);
    const swaps = colorSwaps(DEFAULT_LOOK);
    for (const e of palette.filter((p) => p.shade === 128)) {
      const [r, g, b] = swaps.get(e.rgb)!;
      expect(`#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`).toBe(e.rgb);
    }
  });

  it('uses dark numbers on light jerseys and white on dark ones', () => {
    expect(numberColor('#d9a521')).toBe('#14141c');
    expect(numberColor('#22408f')).toBe('#fcfaf9');
  });

  it('draws the number on whole pixels, inside its spot', () => {
    for (const n of [7, 12, 88]) {
      const spot = numberSpot('idle');
      const blocks = numberBlocks(n, spot);
      for (const b of blocks) {
        expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
      }
      const left = Math.min(...blocks.map((b) => b.x));
      const right = Math.max(...blocks.map((b) => b.x + b.size));
      expect(right - left).toBeLessThanOrEqual(spot.width + 2);
      expect(Math.abs((left + right) / 2 - spot.x)).toBeLessThanOrEqual(1);
    }
  });
});
