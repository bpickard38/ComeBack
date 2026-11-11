/*
  Player Pet artwork. The images in src/assets/pet are made from the owner's
  sprite strip (reference/pet-sprites.png) by scripts/slice-pet-sprites.py:
  clean pixel art, one image per pose, that uses only a small shared set of
  colors. palette.json says which of those colors are the uniform and the
  skin, and how light each is.

  To show the athlete's choices we swap those exact colors and draw the jersey
  number back on, pixel by pixel, using a <canvas>.
*/
import celebrating from '../assets/pet/celebrating.png';
import happy from '../assets/pet/happy.png';
import idle from '../assets/pet/idle.png';
import palette from '../assets/pet/palette.json';
import tired from '../assets/pet/tired.png';
import training from '../assets/pet/training.png';
import type { PetLook, PetState } from '../domain/pet';

/** Size of every frame, in art pixels. It's shown scaled up with crisp edges. */
export const FRAME_WIDTH = 96;
export const FRAME_HEIGHT = 119;

// Importing an image gives back its URL. Vite copies the file into the build.
export const PET_FRAMES: Record<PetState, string> = { idle, happy, training, tired, celebrating };

/**
 * Where the number goes on each pose, in art pixels (printed by the slicing
 * script): its center, the room it has, and a lean for a turned chest.
 */
const NUMBER_SPOTS: Record<PetState, { x: number; y: number; height: number; width: number; lean: number }> = {
  idle: { x: 51.1, y: 78.8, height: 12.4, width: 15.4, lean: 0 },
  happy: { x: 51.2, y: 79.3, height: 12.2, width: 15.2, lean: 0 },
  training: { x: 52.8, y: 79.4, height: 10.8, width: 14.4, lean: 0.15 },
  tired: { x: 51.9, y: 88.1, height: 7.8, width: 12.6, lean: 0.15 },
  celebrating: { x: 49.4, y: 71.4, height: 11.2, width: 14.4, lean: 0 },
};

/** A 3 x 5 pixel font, the classic scoreboard look. '#' = filled. */
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

export interface Block {
  x: number;
  y: number;
  size: number;
}

/**
 * The squares that draw `number` at a spot, in whole art pixels so the
 * number is as crisp as the rest of the sprite. Each font pixel is 2 x 2 art
 * pixels when there's room, else 1 x 1.
 */
export function numberBlocks(number: number, spot: { x: number; y: number; height: number; width: number; lean: number }): Block[] {
  const text = String(number);
  const columns = text.length * 3 + (text.length - 1); // one blank column between digits
  const size = spot.height >= 10 && columns * 2 <= spot.width + 2 ? 2 : 1;
  const left = Math.round(spot.x - (columns * size) / 2);
  const top = Math.round(spot.y - (5 * size) / 2);
  const blocks: Block[] = [];
  [...text].forEach((digit, i) => {
    DIGITS[digit].forEach((row, r) => {
      // Lean: rows nearer the top shift right a little.
      const shift = Math.round(spot.lean * (4 - r) * size);
      [...row].forEach((cell, c) => {
        if (cell === '#') blocks.push({ x: left + (i * 4 + c) * size + shift, y: top + r * size, size });
      });
    });
  });
  return blocks;
}

export function numberSpot(state: PetState) {
  return NUMBER_SPOTS[state];
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A color at a shade. 128 is the color itself, lower is darker (shadows),
 * higher is lighter (highlights).
 */
export function tint(color: string, shade: number): [number, number, number] {
  const k = shade / 128;
  return channels(color).map((c) => Math.round(k <= 1 ? c * k : c + (255 - c) * Math.min(k - 1, 1))) as [
    number,
    number,
    number,
  ];
}

/** White numbers, or dark ones on light jerseys so they stay readable. */
export function numberColor(jersey: string): string {
  const [r, g, b] = channels(jersey);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#14141c' : '#fcfaf9';
}

/** Which art colors become which new colors for a look. Keys are "#rrggbb". */
export function colorSwaps(look: Pick<PetLook, 'jersey' | 'skin'>): Map<string, [number, number, number]> {
  const swaps = new Map<string, [number, number, number]>();
  for (const entry of palette) {
    const target = entry.role === 'uniform' ? look.jersey : look.skin;
    swaps.set(entry.rgb, tint(target, entry.shade));
  }
  return swaps;
}

/* ---------- Drawing (browser only) ---------- */

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let found = images.get(src);
  if (!found) {
    found = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    images.set(src, found);
  }
  return found;
}

const hex = (r: number, g: number, b: number) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

const finished = new Map<string, Promise<string>>();

/** The pose in the athlete's look, as an image URL. Cached, so each combination is drawn once. */
export function drawPetFrame(state: PetState, look: Pick<PetLook, 'number' | 'jersey' | 'skin'>): Promise<string> {
  const key = `${state}|${look.jersey}|${look.skin}|${look.number}`;
  let found = finished.get(key);
  if (!found) {
    found = (async () => {
      const art = await loadImage(PET_FRAMES[state]);
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(art, 0, 0);

      // Swap the uniform and skin colors, pixel by pixel.
      const swaps = colorSwaps(look);
      const image = ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      const px = image.data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const swap = swaps.get(hex(px[i], px[i + 1], px[i + 2]));
        if (swap) [px[i], px[i + 1], px[i + 2]] = swap;
      }
      ctx.putImageData(image, 0, 0);

      // The number, on the same pixel grid as the art.
      ctx.fillStyle = numberColor(look.jersey);
      for (const b of numberBlocks(look.number, NUMBER_SPOTS[state])) ctx.fillRect(b.x, b.y, b.size, b.size);
      return canvas.toDataURL('image/png');
    })();
    finished.set(key, found);
  }
  return found;
}
