import { describe, expect, it } from 'vitest';
import { compareHandRanks, evaluateHand } from './hand-evaluation.js';
import type { Card, Rank, Suit } from './types.js';

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

describe('evaluateHand categories (7-card hands)', () => {
  it('recognizes a straight flush', () => {
    const rank = evaluateHand([
      card(9, 'spades'),
      card(8, 'spades'),
      card(7, 'spades'),
      card(6, 'spades'),
      card(5, 'spades'),
      card(2, 'hearts'),
      card(3, 'clubs'),
    ]);
    expect(rank.category).toBe(8);
    expect(rank.tiebreakers).toEqual([9]);
  });

  it('recognizes a wheel straight flush (A-2-3-4-5) with high card 5', () => {
    const rank = evaluateHand([
      card(14, 'hearts'),
      card(2, 'hearts'),
      card(3, 'hearts'),
      card(4, 'hearts'),
      card(5, 'hearts'),
      card(9, 'clubs'),
      card(10, 'clubs'),
    ]);
    expect(rank.category).toBe(8);
    expect(rank.tiebreakers).toEqual([5]);
  });

  it('recognizes four of a kind with correct kicker', () => {
    const rank = evaluateHand([
      card(7, 'spades'),
      card(7, 'hearts'),
      card(7, 'clubs'),
      card(7, 'diamonds'),
      card(12, 'clubs'),
      card(3, 'hearts'),
      card(2, 'hearts'),
    ]);
    expect(rank.category).toBe(7);
    expect(rank.tiebreakers).toEqual([7, 12]);
  });

  it('recognizes a full house, preferring the higher trip over a higher pair', () => {
    const rank = evaluateHand([
      card(5, 'spades'),
      card(5, 'hearts'),
      card(5, 'clubs'),
      card(9, 'diamonds'),
      card(9, 'clubs'),
      card(2, 'hearts'),
      card(3, 'hearts'),
    ]);
    expect(rank.category).toBe(6);
    expect(rank.tiebreakers).toEqual([5, 9]);
  });

  it('picks the best full house when two trips are available (uses the second as the pair)', () => {
    const rank = evaluateHand([
      card(9, 'spades'),
      card(9, 'hearts'),
      card(9, 'clubs'),
      card(5, 'diamonds'),
      card(5, 'clubs'),
      card(5, 'hearts'),
      card(2, 'hearts'),
    ]);
    expect(rank.category).toBe(6);
    expect(rank.tiebreakers).toEqual([9, 5]);
  });

  it('recognizes a flush and ranks by descending card values', () => {
    const rank = evaluateHand([
      card(2, 'clubs'),
      card(5, 'clubs'),
      card(9, 'clubs'),
      card(11, 'clubs'),
      card(13, 'clubs'),
      card(3, 'hearts'),
      card(4, 'diamonds'),
    ]);
    expect(rank.category).toBe(5);
    expect(rank.tiebreakers).toEqual([13, 11, 9, 5, 2]);
  });

  it('recognizes a straight', () => {
    const rank = evaluateHand([
      card(10, 'spades'),
      card(9, 'hearts'),
      card(8, 'clubs'),
      card(7, 'diamonds'),
      card(6, 'hearts'),
      card(2, 'clubs'),
      card(3, 'clubs'),
    ]);
    expect(rank.category).toBe(4);
    expect(rank.tiebreakers).toEqual([10]);
  });

  it('recognizes an ace-low wheel straight', () => {
    const rank = evaluateHand([
      card(14, 'spades'),
      card(2, 'hearts'),
      card(3, 'clubs'),
      card(4, 'diamonds'),
      card(5, 'hearts'),
      card(9, 'clubs'),
      card(12, 'clubs'),
    ]);
    expect(rank.category).toBe(4);
    expect(rank.tiebreakers).toEqual([5]);
  });

  it('does not treat non-consecutive ranks as a straight', () => {
    const rank = evaluateHand([
      card(2, 'spades'),
      card(4, 'hearts'),
      card(6, 'clubs'),
      card(8, 'diamonds'),
      card(10, 'hearts'),
      card(13, 'clubs'),
      card(9, 'clubs'),
    ]);
    expect(rank.category).toBeLessThan(4);
  });

  it('recognizes three of a kind with correct kickers', () => {
    const rank = evaluateHand([
      card(6, 'spades'),
      card(6, 'hearts'),
      card(6, 'clubs'),
      card(13, 'diamonds'),
      card(2, 'clubs'),
      card(9, 'hearts'),
      card(4, 'hearts'),
    ]);
    expect(rank.category).toBe(3);
    expect(rank.tiebreakers).toEqual([6, 13, 9]);
  });

  it('recognizes two pair with the higher pairs and correct kicker', () => {
    const rank = evaluateHand([
      card(11, 'spades'),
      card(11, 'hearts'),
      card(4, 'clubs'),
      card(4, 'diamonds'),
      card(2, 'clubs'),
      card(9, 'hearts'),
      card(3, 'hearts'),
    ]);
    expect(rank.category).toBe(2);
    expect(rank.tiebreakers).toEqual([11, 4, 9]);
  });

  it('picks the best two pair among three available pairs', () => {
    const rank = evaluateHand([
      card(11, 'spades'),
      card(11, 'hearts'),
      card(4, 'clubs'),
      card(4, 'diamonds'),
      card(2, 'clubs'),
      card(2, 'hearts'),
      card(9, 'hearts'),
    ]);
    expect(rank.category).toBe(2);
    expect(rank.tiebreakers).toEqual([11, 4, 9]);
  });

  it('recognizes one pair with correct kickers', () => {
    const rank = evaluateHand([
      card(8, 'spades'),
      card(8, 'hearts'),
      card(13, 'clubs'),
      card(4, 'diamonds'),
      card(2, 'clubs'),
      card(9, 'hearts'),
      card(3, 'hearts'),
    ]);
    expect(rank.category).toBe(1);
    expect(rank.tiebreakers).toEqual([8, 13, 9, 4]);
  });

  it('recognizes high card when nothing else applies', () => {
    const rank = evaluateHand([
      card(2, 'spades'),
      card(5, 'hearts'),
      card(9, 'clubs'),
      card(11, 'diamonds'),
      card(13, 'clubs'),
      card(3, 'hearts'),
      card(7, 'diamonds'),
    ]);
    expect(rank.category).toBe(0);
    expect(rank.tiebreakers).toEqual([13, 11, 9, 7, 5]);
  });
});

describe('compareHandRanks', () => {
  it('ranks a higher category above a lower one regardless of tiebreakers', () => {
    const flush = evaluateHand([
      card(2, 'clubs'),
      card(5, 'clubs'),
      card(9, 'clubs'),
      card(11, 'clubs'),
      card(13, 'clubs'),
      card(3, 'hearts'),
      card(4, 'diamonds'),
    ]);
    const fullHouse = evaluateHand([
      card(2, 'spades'),
      card(2, 'hearts'),
      card(2, 'clubs'),
      card(3, 'diamonds'),
      card(3, 'clubs'),
      card(9, 'hearts'),
      card(4, 'hearts'),
    ]);
    expect(compareHandRanks(fullHouse, flush)).toBeGreaterThan(0);
  });

  it('breaks ties within the same category by tiebreakers', () => {
    const pairOfAces = evaluateHand([
      card(14, 'spades'),
      card(14, 'hearts'),
      card(2, 'clubs'),
      card(4, 'diamonds'),
      card(7, 'clubs'),
      card(9, 'hearts'),
      card(3, 'hearts'),
    ]);
    const pairOfKings = evaluateHand([
      card(13, 'spades'),
      card(13, 'hearts'),
      card(2, 'clubs'),
      card(4, 'diamonds'),
      card(7, 'clubs'),
      card(9, 'hearts'),
      card(3, 'hearts'),
    ]);
    expect(compareHandRanks(pairOfAces, pairOfKings)).toBeGreaterThan(0);
  });

  it('treats identical hands as equal', () => {
    const cards: Card[] = [
      card(14, 'spades'),
      card(14, 'hearts'),
      card(2, 'clubs'),
      card(4, 'diamonds'),
      card(7, 'clubs'),
      card(9, 'hearts'),
      card(3, 'hearts'),
    ];
    expect(compareHandRanks(evaluateHand(cards), evaluateHand([...cards]))).toBe(0);
  });
});

describe('evaluateHand input validation', () => {
  it('throws when fewer than 5 cards are provided', () => {
    expect(() => evaluateHand([card(2, 'clubs'), card(3, 'clubs')])).toThrow();
  });
});
