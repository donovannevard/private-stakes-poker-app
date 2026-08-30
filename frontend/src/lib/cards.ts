import type { Card, Rank, Suit } from '@lightning-poker/game-engine';

const RANK_LABELS: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const RED_SUITS: ReadonlySet<Suit> = new Set(['diamonds', 'hearts']);

export function formatCard(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

export function isRedSuit(suit: Suit): boolean {
  return RED_SUITS.has(suit);
}

export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}
