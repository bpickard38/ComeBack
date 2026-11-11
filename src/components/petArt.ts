/*
  Player Pet artwork. The images in src/assets/pet come from the owner's
  sprite strip (reference/pet-sprites.png) via scripts/slice-pet-sprites.py:
    <state>.png         the pose, jersey number erased
    <state>-jersey.png  uniform map: alpha = "this pixel is uniform red",
                        gray = how light/dark it is (128 = the normal red)
  To show the athlete's choices, we recolor the uniform pixels and draw the
  number back on in a chunky pixel font, using a <canvas>.
*/
import celebrating from '../assets/pet/celebrating.png';
import celebratingJersey from '../assets/pet/celebrating-jersey.png';
import happy from '../assets/pet/happy.png';
import happyJersey from '../assets/pet/happy-jersey.png';
import idle from '../assets/pet/idle.png';
import idleJersey from '../assets/pet/idle-jersey.png';
import tired from '../assets/pet/tired.png';
import tiredJersey from '../assets/pet/tired-jersey.png';
import training from '../assets/pet/training.png';
import trainingJersey from '../assets/pet/training-jersey.png';
import { ORIGINAL_RED, type PetLook, type PetState } from '../domain/pet';

export const FRAME_WIDTH = 240;
export const FRAME_HEIGHT = 295;

// Importing an image gives back its URL. Vite copies the file into the build.
export const PET_FRAMES: Record<PetState, { art: string; jersey: string }> = {
  idle: { art: idle, jersey: idleJersey },
  happy: { art: happy, jersey: happyJersey },
  training: { art: training, jersey: trainingJersey },
  tired: { art: tired, jersey: tiredJersey },
  celebrating: { art: celebrating, jersey: celebratingJersey },
};

/**
 * Where the number goes on each pose, in frame pixels (from the slicing
 * script): center, the box it must fit in, and a lean for poses where the
 * chest is turned.
 */
const NUMBER_SPOTS: Record<PetState, { x: number; y: number; height: number; width: number; lean: number }> = {
  idle: { x: 127.8, y: 194.5, height: 31, width: 40, lean: 0 },
  happy: { x: 128, y: 195.8, height: 30.5, width: 40, lean: 0 },
  training: { x: 132, y: 196, height: 27, width: 38, lean: 0.18 },
  tired: { x: 129.8, y: 217.8, height: 19.5, width: 33, lean: 0.2 },
  celebrating: { x: 123.5, y: 176, height: 28, width: 38, lean: 0 },
};

/** A bold 5 x 7 pixel font, to match the art. '#' = filled. */
const DIGITS: Record<string, string[]> = {
  '0': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  '1': ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  '2': ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  '3': ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  '4': ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
  '5': ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  '6': ['.###.', '##...', '##...', '####.', '##.##', '##.##', '.###.'],
  '7': ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  '8': ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  '9': ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};

export interface Block {
  x: number;
  y: number;
  size: number;
}

/**
 * The squares that draw `number`, centered on (0, 0). Square "pixels" keep
 * the retro look, so they're sized to fit the spot's height and width.
 */
export function numberBlocks(number: number, height: number, width: number): Block[] {
  const text = String(number);
  const columns = text.length * 5 + (text.length - 1); // one blank column between digits
  const size = Math.min(height / 7, width / columns);
  const left = (-columns * size) / 2;
  const top = (-7 * size) / 2;
  const blocks: Block[] = [];
  [...text].forEach((digit, i) => {
    DIGITS[digit].forEach((row, r) => {
      [...row].forEach((cell, c) => {
        if (cell === '#') blocks.push({ x: left + (i * 6 + c) * size, y: top + r * size, size });
      });
    });
  });
  return blocks;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * One uniform pixel in the new color. `shade` is the map's gray: 128 is the
 * color itself, lower is darker (shadows), higher is lighter (highlights).
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
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#1d2230' : '#f5f6f8';
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

function pixelsOf(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
}

const finished = new Map<string, Promise<string>>();

/** The pose in the athlete's colors and number, as an image URL. Cached, so each combination is drawn once. */
export function drawPetFrame(state: PetState, look: Pick<PetLook, 'number' | 'jersey'>): Promise<string> {
  const key = `${state}|${look.jersey}|${look.number}`;
  let found = finished.get(key);
  if (!found) {
    found = (async () => {
      const frame = PET_FRAMES[state];
      const [art, map] = await Promise.all([loadImage(frame.art), loadImage(frame.jersey)]);
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
      const ctx = canvas.getContext('2d')!;
      const out = pixelsOf(art);

      // Recolor the uniform. The original red is left exactly as drawn.
      if (look.jersey !== ORIGINAL_RED) {
        const uniform = pixelsOf(map).data;
        const px = out.data;
        for (let i = 0; i < px.length; i += 4) {
          const amount = uniform[i + 3] / 255;
          if (amount === 0) continue;
          const [r, g, b] = tint(look.jersey, uniform[i]);
          px[i] += (r - px[i]) * amount;
          px[i + 1] += (g - px[i + 1]) * amount;
          px[i + 2] += (b - px[i + 2]) * amount;
        }
      }
      ctx.putImageData(out, 0, 0);

      // Draw the number, leaning with the chest on turned poses.
      const spot = NUMBER_SPOTS[state];
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.transform(1, 0, -spot.lean, 1, 0, 0);
      ctx.fillStyle = numberColor(look.jersey);
      for (const block of numberBlocks(look.number, spot.height, spot.width)) {
        // A hair of overlap so neighboring squares don't show seams.
        ctx.fillRect(block.x, block.y, block.size + 0.3, block.size + 0.3);
      }
      ctx.restore();
      return canvas.toDataURL('image/png');
    })();
    finished.set(key, found);
  }
  return found;
}
