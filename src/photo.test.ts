import { describe, expect, it } from 'vitest';
import { centerSquare } from './photo';

describe('centerSquare', () => {
  it('cuts the middle out of a wide picture', () => {
    expect(centerSquare(4000, 3000)).toEqual({ x: 500, y: 0, size: 3000 });
  });

  it('cuts the middle out of a tall picture', () => {
    expect(centerSquare(3000, 4000)).toEqual({ x: 0, y: 500, size: 3000 });
  });

  it('keeps a square picture whole', () => {
    expect(centerSquare(800, 800)).toEqual({ x: 0, y: 0, size: 800 });
  });
});
