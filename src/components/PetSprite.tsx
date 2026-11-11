/*
  The Player Pet, drawn as pixel art in SVG. Each string below is one row of
  pixels and each letter picks a color, so the jersey, trim and skin colors
  can change without any image files.
*/
import type { PetLook, PetMood } from '../domain/pet';

// Standing pose. 16 pixels wide, 20 tall.
const STANDING = [
  '....OOOOOOOO....',
  '...OHHHSSHHHO...',
  '..OHHHHSSHHHHO..',
  '..OHHHHSSHHHHO..',
  '..OHFFFFFFFFHO..',
  '..OHFEFFFFEFHO..',
  '..OHMMMMMMMMHO..',
  '..OhFFFMMFFFhO..',
  '...OOFFFFFFOO...',
  '.OJJJJJJJJJJJJO.',
  'OJJJJJJJJJJJJJJO',
  'OTJJJJJJJJJJJJTO',
  'OFOJJJJJJJJJJOFO',
  'OFOJJJJJJJJJJOFO',
  'OFOTTTTTTTTTTOFO',
  '.O.OPPPPPPPPO.O.',
  '...OPPPOOPPPO...',
  '...OTTTOOTTTO...',
  '...OBBBOOBBBO...',
  '..OBBBBOOBBBBO..',
];

/** Change single pixels: [row, column, letter]. */
function edit(rows: string[], changes: [number, number, string][]): string[] {
  const grid = rows.map((r) => r.split(''));
  for (const [r, c, ch] of changes) grid[r][c] = ch;
  return grid.map((r) => r.join(''));
}

// Arms up for a fully charged pet.
const CHEER = edit(STANDING, [
  [2, 0, 'O'], [2, 1, 'O'], [2, 14, 'O'], [2, 15, 'O'],
  ...[3, 4, 5, 6, 7, 8].flatMap((r): [number, number, string][] => [
    [r, 0, 'O'], [r, 1, 'F'], [r, 14, 'F'], [r, 15, 'O'],
  ]),
  [9, 0, 'O'], [9, 1, 'T'], [9, 14, 'T'], [9, 15, 'O'],
  ...[12, 13, 14].flatMap((r): [number, number, string][] => [
    [r, 0, '.'], [r, 1, 'O'], [r, 2, r === 14 ? 'T' : 'J'],
    [r, 13, r === 14 ? 'T' : 'J'], [r, 14, 'O'], [r, 15, '.'],
  ]),
  [15, 1, '.'], [15, 14, '.'],
]);

// Sleepy eyelids when the tank is low.
const TIRED = edit(STANDING, [[5, 5, 'e'], [5, 10, 'e']]);

/** Darken a "#rrggbb" color by `amount` (0 to 1). */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const scale = (v: number) => Math.round(v * (1 - amount));
  const r = scale((n >> 16) & 255);
  const g = scale((n >> 8) & 255);
  const b = scale(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

interface PetSpriteProps {
  look: PetLook;
  mood: PetMood;
  /** Size in CSS pixels across. The art scales without blurring. */
  size?: number;
}

export function PetSprite({ look, mood, size = 96 }: PetSpriteProps) {
  const rows = mood === 'pumped' ? CHEER : mood === 'tired' ? TIRED : STANDING;
  const colors: Record<string, string> = {
    O: '#1b1f24',
    E: '#1b1f24',
    H: '#f4f4f4',
    h: '#c9ced4',
    M: '#8a939c',
    S: look.jersey,
    J: look.jersey,
    T: look.trim,
    F: look.skin,
    e: darken(look.skin, 0.45),
    P: '#eceff2',
    B: '#2a2e33',
  };
  // The number uses the trim color, unless that would match the jersey.
  const numberColor = look.trim !== look.jersey ? look.trim : '#f4f4f4';

  return (
    <svg
      className={`pet-sprite pet-sprite--${mood}`}
      viewBox="0 0 16 20"
      width={size}
      height={(size * 20) / 16}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        row.split('').map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={colors[ch]} />,
        ),
      )}
      <text
        x={8}
        y={13.6}
        textAnchor="middle"
        fontSize={look.number > 9 ? 3.6 : 4}
        fontWeight={700}
        fontFamily="ui-monospace, Menlo, Consolas, monospace"
        fill={numberColor}
        stroke="#1b1f24"
        strokeWidth={0.35}
        paintOrder="stroke"
      >
        {look.number}
      </text>
      {mood === 'tired' && (
        <text x={14.6} y={2.6} fontSize={3} fontWeight={700} fill="#8fc5ff" className="pet-sprite__z">
          z
        </text>
      )}
    </svg>
  );
}
