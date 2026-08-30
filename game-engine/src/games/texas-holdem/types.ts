import type { PlayerId } from '../../core/types.js';

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

/** 2-10 are their face value; 11=Jack, 12=Queen, 13=King, 14=Ace. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

export type PlayerStatus = 'active' | 'folded' | 'all-in';

export interface PlayerHandState {
  readonly playerId: PlayerId;
  /** Stack this player brought into the hand, used to compute the settlement delta. */
  readonly startingStack: number;
  /** Remaining chips not yet committed to the pot. */
  readonly stack: number;
  readonly holeCards: readonly [Card, Card];
  /** Total wagered this hand, across all streets — the basis for side-pot calculation. */
  readonly committed: number;
  /** Wagered so far on the current street, compared against `currentBet` to call. */
  readonly committedThisStreet: number;
  readonly status: PlayerStatus;
  readonly hasActedThisStreet: boolean;
}

export interface TexasHoldemState {
  readonly seed: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly buttonIndex: number;
  readonly players: readonly PlayerHandState[];
  readonly deck: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly street: Street;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly actingIndex: number | null;
  readonly winners: readonly PlayerId[] | null;
  readonly potPayouts: Readonly<Record<PlayerId, number>> | null;
}

export type TexasHoldemAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' }
  | { readonly type: 'raise'; readonly toAmount: number };

export interface PublicPlayerView {
  readonly playerId: PlayerId;
  readonly stack: number;
  readonly committed: number;
  readonly committedThisStreet: number;
  readonly status: PlayerStatus;
  readonly holeCards: readonly [Card, Card] | null;
}

export interface TexasHoldemSnapshot {
  readonly street: Street;
  readonly buttonIndex: number;
  readonly communityCards: readonly Card[];
  readonly currentBet: number;
  readonly minRaise: number;
  /** Doesn't change mid-hand — exposed so clients can offer bet sizing relative to it. */
  readonly bigBlind: number;
  readonly actingPlayerId: PlayerId | null;
  readonly players: readonly PublicPlayerView[];
  readonly winners: readonly PlayerId[] | null;
  readonly potPayouts: Readonly<Record<PlayerId, number>> | null;
}
