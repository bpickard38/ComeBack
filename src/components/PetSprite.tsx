/*
  Shows the Player Pet in one of his five states, in the athlete's look.
  The drawing work lives in petArt.ts.
*/
import { useEffect, useState } from 'react';
import type { PetLook, PetState } from '../domain/pet';
import { drawPetFrame, FRAME_HEIGHT, FRAME_WIDTH, PET_FRAMES } from './petArt';

type Look = Pick<PetLook, 'number' | 'jersey' | 'skin'>;

/** Draw every pose in this look up front, so a state change shows instantly. */
export function preloadPetFrames(look: Look) {
  for (const state of Object.keys(PET_FRAMES) as PetState[]) void drawPetFrame(state, look);
}

interface PetSpriteProps {
  state: PetState;
  look: Look;
  /** How many screen pixels per art pixel. Whole numbers keep every pixel the same size. */
  scale?: number;
}

export function PetSprite({ state, look, scale = 1 }: PetSpriteProps) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const key = `${state}|${look.jersey}|${look.skin}|${look.number}`;

  useEffect(() => {
    let current = true;
    drawPetFrame(state, look).then((src) => current && setDrawn(src));
    return () => {
      current = false;
    };
  }, [key]); // `key` covers state and look.

  // Until the new look is drawn (a few milliseconds), keep showing the last one,
  // or the plain pose on the very first draw.
  const src = drawn ?? PET_FRAMES[state];

  return (
    <img
      className={`pet-sprite pet-sprite--${state}`}
      src={src}
      width={FRAME_WIDTH * scale}
      height={FRAME_HEIGHT * scale}
      alt=""
      draggable={false}
    />
  );
}
