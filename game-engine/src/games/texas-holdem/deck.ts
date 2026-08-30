import { shuffle } from '../../core/random.js';
import type { Card, Rank, Suit } from './types.js';

const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** A fresh, ordered 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(rng: () => number): Card[] {
  return shuffle(createDeck(), rng);
}

/** Deals `count` cards off the top of `deck`, returning the dealt cards and the remainder. */
export function dealCards(deck: readonly Card[], count: number): { dealt: Card[]; rest: Card[] } {
  return { dealt: deck.slice(0, count), rest: deck.slice(count) };
}
