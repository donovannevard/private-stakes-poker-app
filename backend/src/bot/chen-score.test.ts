import type { Card } from '@lightning-poker/game-engine';
import { describe, expect, it } from 'vitest';
import { chenScore } from './chen-score.js';

function hand(a: Card, b: Card): readonly [Card, Card] {
  return [a, b];
}

describe('chenScore', () => {
  it('scores pocket aces at the maximum, 20', () => {
    expect(chenScore(hand({ rank: 14, suit: 'clubs' }, { rank: 14, suit: 'hearts' }))).toBe(20);
  });

  it('scores pocket kings at 16', () => {
    expect(chenScore(hand({ rank: 13, suit: 'clubs' }, { rank: 13, suit: 'hearts' }))).toBe(16);
  });

  it('scores suited ace-king at 12', () => {
    expect(chenScore(hand({ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }))).toBe(12);
  });

  it('scores offsuit ace-king lower than suited ace-king', () => {
    const suited = chenScore(hand({ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }));
    const offsuit = chenScore(hand({ rank: 14, suit: 'spades' }, { rank: 13, suit: 'hearts' }));
    expect(offsuit).toBeLessThan(suited);
  });

  it('scores a weak, disconnected, offsuit low hand near the bottom of the scale', () => {
    const weak = chenScore(hand({ rank: 7, suit: 'clubs' }, { rank: 2, suit: 'hearts' }));
    expect(weak).toBeLessThan(4);
  });

  it('gives a small bonus to connected low cards over an equally-gapped disconnected pair', () => {
    const connected = chenScore(hand({ rank: 8, suit: 'clubs' }, { rank: 7, suit: 'hearts' }));
    const gapped = chenScore(hand({ rank: 9, suit: 'clubs' }, { rank: 5, suit: 'hearts' }));
    expect(connected).toBeGreaterThan(gapped);
  });

  it('never scores a pair below 5, even the weakest pair', () => {
    expect(
      chenScore(hand({ rank: 2, suit: 'clubs' }, { rank: 2, suit: 'hearts' })),
    ).toBeGreaterThanOrEqual(5);
  });
});
