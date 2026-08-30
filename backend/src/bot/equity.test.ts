import type { Card } from '@lightning-poker/game-engine';
import { describe, expect, it } from 'vitest';
import { chenScore } from './chen-score.js';
import { estimateEquity } from './equity.js';

/** Small deterministic PRNG so equity tests are reproducible, not flaky. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe('estimateEquity', () => {
  it('returns 1 when there are no opponents left in the hand', () => {
    const hole: [Card, Card] = [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'hearts' },
    ];
    const equity = estimateEquity(hole, [], [], chenScore, seededRng(1));
    expect(equity).toBe(1);
  });

  it('gives a made full house near-certain equity against a wide range on the river', () => {
    const hole: [Card, Card] = [
      { rank: 10, suit: 'clubs' },
      { rank: 10, suit: 'hearts' },
    ];
    const board: Card[] = [
      { rank: 10, suit: 'spades' },
      { rank: 4, suit: 'diamonds' },
      { rank: 4, suit: 'clubs' },
      { rank: 9, suit: 'hearts' },
      { rank: 2, suit: 'spades' },
    ];

    const equity = estimateEquity(
      hole,
      board,
      [{ playerId: 'villain', minChenScore: 4 }],
      chenScore,
      seededRng(42),
      500,
    );

    expect(equity).toBeGreaterThan(0.9);
  });

  it('gives a weak unpaired hand low equity against a tight, aggression-implied range on the river', () => {
    const hole: [Card, Card] = [
      { rank: 7, suit: 'clubs' },
      { rank: 2, suit: 'hearts' },
    ];
    const board: Card[] = [
      { rank: 9, suit: 'spades' },
      { rank: 4, suit: 'diamonds' },
      { rank: 6, suit: 'clubs' },
      { rank: 3, suit: 'hearts' },
      { rank: 11, suit: 'spades' },
    ];

    const equity = estimateEquity(
      hole,
      board,
      [{ playerId: 'villain', minChenScore: 14 }],
      chenScore,
      seededRng(7),
      500,
    );

    expect(equity).toBeLessThan(0.4);
  });

  it('gives higher equity against a wider (lower minChenScore) range than a tighter one, all else equal', () => {
    const hole: [Card, Card] = [
      { rank: 12, suit: 'clubs' },
      { rank: 11, suit: 'hearts' },
    ];
    const board: Card[] = [
      { rank: 12, suit: 'spades' },
      { rank: 4, suit: 'diamonds' },
      { rank: 6, suit: 'clubs' },
    ];

    const vsWide = estimateEquity(
      hole,
      board,
      [{ playerId: 'villain', minChenScore: 4 }],
      chenScore,
      seededRng(3),
      400,
    );
    const vsTight = estimateEquity(
      hole,
      board,
      [{ playerId: 'villain', minChenScore: 15 }],
      chenScore,
      seededRng(3),
      400,
    );

    expect(vsWide).toBeGreaterThan(vsTight);
  });

  it('does not run out of cards with the maximum 7 opponents on an 8-max table, even with tight ranges', () => {
    // Regression test: an earlier implementation scanned forward and skipped
    // (rather than removed) cards while hunting for a qualifying pair per
    // opponent, which could exhaust the deck with enough tight-range
    // opponents and crash on an undefined card. With 7 opponents all assumed
    // tight (minChenScore 14), this must complete without throwing.
    const hole: [Card, Card] = [
      { rank: 12, suit: 'clubs' },
      { rank: 11, suit: 'hearts' },
    ];
    const board: Card[] = [
      { rank: 2, suit: 'spades' },
      { rank: 5, suit: 'diamonds' },
      { rank: 9, suit: 'clubs' },
    ];
    const opponents = Array.from({ length: 7 }, (_, i) => ({
      playerId: `villain-${i}`,
      minChenScore: 14,
    }));

    expect(() =>
      estimateEquity(hole, board, opponents, chenScore, seededRng(99), 100),
    ).not.toThrow();
  });
});
