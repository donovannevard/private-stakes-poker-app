import type { PlayerId } from '../../core/types.js';
import { compareHandRanks, type HandRank } from './hand-evaluation.js';
import type { PlayerHandState } from './types.js';

export interface Pot {
  readonly amount: number;
  readonly eligiblePlayerIds: readonly PlayerId[];
}

/**
 * Layers the hand's total contributions into a main pot plus any side pots,
 * keyed on the distinct commitment levels among players who put money in.
 * Folded players' chips still count toward pot amounts, but they're never
 * eligible to win them.
 */
export function computeSidePots(players: readonly PlayerHandState[]): Pot[] {
  const contributors = players.filter((player) => player.committed > 0);
  if (contributors.length === 0) {
    return [];
  }

  const levels = [...new Set(contributors.map((player) => player.committed))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let previousLevel = 0;
  let carryOver = 0;

  for (const level of levels) {
    const layerSize = level - previousLevel;
    const contributingCount = contributors.filter((player) => player.committed >= level).length;
    const amount = layerSize * contributingCount + carryOver;
    const eligiblePlayerIds = contributors
      .filter((player) => player.committed >= level && player.status !== 'folded')
      .map((player) => player.playerId);

    if (eligiblePlayerIds.length === 0) {
      // Nobody eligible at this layer (every contributor at this level folded) —
      // roll it into the next layer instead of leaving it unassigned.
      carryOver = amount;
    } else {
      pots.push({ amount, eligiblePlayerIds });
      carryOver = 0;
    }

    previousLevel = level;
  }

  return pots;
}

/**
 * Splits each pot among its best eligible hand(s). Ties split evenly, with any
 * odd remainder chip(s) going to the first tied winner seated after the button
 * (the standard convention).
 */
export function distributePots(
  pots: readonly Pot[],
  handRanks: ReadonlyMap<PlayerId, HandRank>,
  buttonIndex: number,
  players: readonly PlayerHandState[],
): Record<PlayerId, number> {
  const payouts: Record<PlayerId, number> = {};
  for (const player of players) {
    payouts[player.playerId] = 0;
  }

  for (const pot of pots) {
    const winners =
      pot.eligiblePlayerIds.length === 1
        ? [pot.eligiblePlayerIds[0]!]
        : bestHandWinners(pot.eligiblePlayerIds, handRanks);
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;

    for (const playerId of orderBySeatAfterButton(winners, buttonIndex, players)) {
      payouts[playerId] = (payouts[playerId] ?? 0) + share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
    }
  }

  return payouts;
}

function bestHandWinners(
  eligiblePlayerIds: readonly PlayerId[],
  handRanks: ReadonlyMap<PlayerId, HandRank>,
): PlayerId[] {
  let bestRank: HandRank | null = null;
  let winners: PlayerId[] = [];

  for (const playerId of eligiblePlayerIds) {
    const rank = handRanks.get(playerId);
    if (!rank) {
      continue;
    }

    if (bestRank === null || compareHandRanks(rank, bestRank) > 0) {
      bestRank = rank;
      winners = [playerId];
    } else if (compareHandRanks(rank, bestRank) === 0) {
      winners.push(playerId);
    }
  }

  return winners;
}

function orderBySeatAfterButton(
  winnerIds: readonly PlayerId[],
  buttonIndex: number,
  players: readonly PlayerHandState[],
): PlayerId[] {
  const winnerSet = new Set(winnerIds);
  const ordered: PlayerId[] = [];

  for (let offset = 1; offset <= players.length; offset++) {
    const player = players[(buttonIndex + offset) % players.length]!;
    if (winnerSet.has(player.playerId)) {
      ordered.push(player.playerId);
    }
  }

  return ordered;
}
