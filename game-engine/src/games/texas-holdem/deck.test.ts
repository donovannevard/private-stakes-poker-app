import { describe, expect, it } from 'vitest';
import { createDeterministicRng } from '../../core/random.js';
import { createDeck, dealCards, shuffleDeck } from './deck.js';

describe('createDeck', () => {
  it('contains 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);

    const unique = new Set(deck.map((card) => `${card.rank}-${card.suit}`));
    expect(unique.size).toBe(52);
  });
});

describe('shuffleDeck', () => {
  it('is deterministic given the same rng seed and still has 52 unique cards', () => {
    const deckA = shuffleDeck(createDeterministicRng('deck-test'));
    const deckB = shuffleDeck(createDeterministicRng('deck-test'));

    expect(deckA).toEqual(deckB);
    expect(new Set(deckA.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
  });
});

describe('dealCards', () => {
  it('splits the deck into dealt and remaining cards without overlap', () => {
    const deck = createDeck();
    const { dealt, rest } = dealCards(deck, 5);

    expect(dealt).toHaveLength(5);
    expect(rest).toHaveLength(47);
    expect(dealt).toEqual(deck.slice(0, 5));
  });
});
