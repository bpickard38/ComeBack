export type Metal = 'Bronze' | 'Silver' | 'Gold';

export interface Rank {
  name: string;
  minPoints: number;
  metal: Metal;
}

/** The rank ladder, lowest first. Thresholds are guesses; tune them here. */
export const RANKS: readonly Rank[] = [
  { name: 'Starter I', minPoints: 0, metal: 'Bronze' },
  { name: 'Starter II', minPoints: 20, metal: 'Bronze' },
  { name: 'Starter III', minPoints: 40, metal: 'Bronze' },
  { name: 'Varsity I', minPoints: 60, metal: 'Silver' },
  { name: 'Varsity II', minPoints: 90, metal: 'Silver' },
  { name: 'Varsity III', minPoints: 120, metal: 'Silver' },
  { name: 'All-conference I', minPoints: 160, metal: 'Gold' },
  { name: 'All-conference II', minPoints: 210, metal: 'Gold' },
  { name: 'All-conference III', minPoints: 270, metal: 'Gold' },
];

export interface RankStatus {
  index: number;
  rank: Rank;
  next: Rank | null;
  /** Points still needed for the next rank. 0 at the top. */
  pointsToNext: number;
  /** Progress from this rank to the next, 0 to 100. */
  percentToNext: number;
}

export function rankIndex(points: number): number {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (points >= r.minPoints) index = i;
  });
  return index;
}

export function rankStatus(points: number): RankStatus {
  const index = rankIndex(points);
  const rank = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  if (!next) return { index, rank, next, pointsToNext: 0, percentToNext: 100 };
  return {
    index,
    rank,
    next,
    pointsToNext: next.minPoints - points,
    percentToNext: Math.round((100 * (points - rank.minPoints)) / (next.minPoints - rank.minPoints)),
  };
}

/** The new rank if going from `before` to `after` points crosses a threshold. */
export function rankUp(before: number, after: number): Rank | null {
  const i = rankIndex(after);
  return i > rankIndex(before) ? RANKS[i] : null;
}
