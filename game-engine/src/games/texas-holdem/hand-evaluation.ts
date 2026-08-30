import type { Card, Rank } from './types.js';

/**
 * 0 = high card ... 8 = straight flush. Compare two `HandRank`s with
 * `compareHandRanks`; never compare `category`/`tiebreakers` directly.
 */
export interface HandRank {
  readonly category: number;
  readonly tiebreakers: readonly number[];
}

const HIGH_CARD = 0;
const ONE_PAIR = 1;
const TWO_PAIR = 2;
const THREE_OF_A_KIND = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const FOUR_OF_A_KIND = 7;
const STRAIGHT_FLUSH = 8;

export function compareHandRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) {
    return a.category - b.category;
  }

  const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < length; i++) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

/** Best 5-card hand rank achievable from `cards` (5, 6, or 7 cards). */
export function evaluateHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5) {
    throw new Error('evaluateHand requires at least 5 cards');
  }

  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const rank = evaluateFiveCardHand(combo);
    if (best === null || compareHandRanks(rank, best) > 0) {
      best = rank;
    }
  }

  return best!;
}

function evaluateFiveCardHand(cards: readonly Card[]): HandRank {
  const ranksDescending = [...cards].map((card) => card.rank).sort((a, b) => b - a);
  const isFlush = cards.every((card) => card.suit === cards[0]!.suit);
  const straightHigh = straightHighCard(ranksDescending);

  const groups = groupByRankDescending(ranksDescending);

  if (isFlush && straightHigh !== null) {
    return { category: STRAIGHT_FLUSH, tiebreakers: [straightHigh] };
  }

  if (groups[0]!.count === 4) {
    const kicker = groups[1]!.rank;
    return { category: FOUR_OF_A_KIND, tiebreakers: [groups[0]!.rank, kicker] };
  }

  if (groups[0]!.count === 3 && groups[1]!.count >= 2) {
    return { category: FULL_HOUSE, tiebreakers: [groups[0]!.rank, groups[1]!.rank] };
  }

  if (isFlush) {
    return { category: FLUSH, tiebreakers: ranksDescending };
  }

  if (straightHigh !== null) {
    return { category: STRAIGHT, tiebreakers: [straightHigh] };
  }

  if (groups[0]!.count === 3) {
    const kickers = groups
      .slice(1)
      .map((group) => group.rank)
      .sort((a, b) => b - a);
    return { category: THREE_OF_A_KIND, tiebreakers: [groups[0]!.rank, ...kickers] };
  }

  if (groups[0]!.count === 2 && groups[1]!.count === 2) {
    const [highPair, lowPair] = [groups[0]!.rank, groups[1]!.rank].sort((a, b) => b - a);
    const kicker = groups[2]!.rank;
    return { category: TWO_PAIR, tiebreakers: [highPair!, lowPair!, kicker] };
  }

  if (groups[0]!.count === 2) {
    const kickers = groups
      .slice(1)
      .map((group) => group.rank)
      .sort((a, b) => b - a);
    return { category: ONE_PAIR, tiebreakers: [groups[0]!.rank, ...kickers] };
  }

  return { category: HIGH_CARD, tiebreakers: ranksDescending };
}

interface RankGroup {
  readonly rank: Rank;
  readonly count: number;
}

function groupByRankDescending(ranksDescending: readonly Rank[]): RankGroup[] {
  const counts = new Map<Rank, number>();
  for (const rank of ranksDescending) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
}

/** Returns the straight's high card, treating ace-low (A-2-3-4-5) as high-5, or null if none. */
function straightHighCard(ranksDescending: readonly Rank[]): number | null {
  const uniqueDescending = [...new Set(ranksDescending)].sort((a, b) => b - a);
  if (uniqueDescending.length < 5) {
    return null;
  }

  for (let start = 0; start <= uniqueDescending.length - 5; start++) {
    const slice = uniqueDescending.slice(start, start + 5);
    if (slice[0]! - slice[4]! === 4) {
      return slice[0]!;
    }
  }

  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((rank) => uniqueDescending.includes(rank as Rank))) {
    return 5;
  }

  return null;
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }
  if (items.length < size) {
    return [];
  }

  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((combo) => [first!, ...combo]);
  const withoutFirst = combinations(rest, size);

  return [...withFirst, ...withoutFirst];
}
