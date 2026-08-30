import type { Card, Rank } from '@lightning-poker/game-engine';

/**
 * Bill Chen's well-known starting-hand strength heuristic: a simple, standard
 * piece of poker theory (not learned or searched) that scores any 2-card hand
 * on a scale where AA=20 (the maximum) down to roughly -1 for the weakest
 * hands (e.g. 72o). Used here as the preflop "hand strength" signal in place
 * of a hardcoded 169-hand range chart — the chart itself is this formula's
 * output, computed on demand rather than tabulated cell by cell.
 */
export function chenScore(hole: readonly [Card, Card]): number {
  const [a, b] = hole;
  const high = a.rank >= b.rank ? a : b;
  const low = a.rank >= b.rank ? b : a;
  const isPair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = isPair ? 0 : high.rank - low.rank - 1;

  let score = highCardPoints(high.rank);

  if (isPair) {
    score = Math.max(score * 2, 5);
  }

  if (suited) {
    score += 2;
  }

  score += gapPenalty(gap);

  if (!isPair && gap <= 1 && high.rank < 12) {
    score += 1; // straight-potential bonus for connected/one-gapped low-ish cards
  }

  return roundUpToHalf(score);
}

function highCardPoints(rank: Rank): number {
  if (rank === 14) return 10; // Ace
  if (rank === 13) return 8; // King
  if (rank === 12) return 7; // Queen
  if (rank === 11) return 6; // Jack
  return rank / 2;
}

function gapPenalty(gap: number): number {
  if (gap <= 0) return 0;
  if (gap === 1) return -1;
  if (gap === 2) return -2;
  if (gap === 3) return -4;
  return -5;
}

function roundUpToHalf(score: number): number {
  return Math.ceil(score * 2) / 2;
}
