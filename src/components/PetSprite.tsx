/*
  Shows the Player Pet in one of his five states, in the athlete's jersey
  color and number. The drawing work lives in petArt.ts.
*/
import { useEffect, useState } from 'react';
import type { PetLook, PetState } from '../domain/pet';
import { drawPetFrame, FRAME_HEIGHT, FRAME_WIDTH, PET_FRAMES } from './petArt';

/** Draw every pose in this look up front, so a state change shows instantly. */
export function preloadPetFrames(look: Pick<PetLook, 'number' | 'jersey'>) {
  for (const state of Object.keys(PET_FRAMES) as PetState[]) void drawPetFrame(state, look);
}

interface PetSpriteProps {
  state: PetState;
  look: Pick<PetLook, 'number' | 'jersey'>;
  width?: number;
}

export function PetSprite({ state, look, width = 96 }: PetSpriteProps) {
  const [drawn, setDrawn] = useState<{ key: string; src: string } | null>(null);
  const key = `${state}|${look.jersey}|${look.number}`;

  useEffect(() => {
    let current = true;
    drawPetFrame(state, look).then((src) => current && setDrawn({ key, src }));
    return () => {
      current = false;
    };
  }, [key]); // `key` covers state, jersey and number.

  // Until the new look is drawn (a few milliseconds), keep showing the last one,
  // or the plain pose on the very first draw.
  const src = drawn?.src ?? PET_FRAMES[state].art;

  return (
    <img
      className={`pet-sprite pet-sprite--${state}`}
      src={src}
      width={width}
      height={Math.round((width * FRAME_HEIGHT) / FRAME_WIDTH)}
      alt=""
      draggable={false}
    />
  );
}
