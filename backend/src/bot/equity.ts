import {
  compareHandRanks,
  createDeck,
  evaluateHand,
  type Card,
  type PlayerId,
} from '@lightning-poker/game-engine';

export interface OpponentRange {
  readonly playerId: PlayerId;
  /** Chen score this opponent is assumed to hold at least — a simple stand-in for a real range. */
  readonly minChenScore: number;
}

const DEFAULT_TRIALS = 250;

/**
 * Monte-Carlo equity: how often the bot's hand ends up best against a random
 * sample from each opponent's inferred range, over the remaining community
 * cards. A simplification of real multi-way equity (treats "best hand wins"
 * rather than exact side-pot shares) — good enough to drive a fold/call/raise
 * decision, not a payout calculation.
 */
export function estimateEquity(
  myHole: readonly [Card, Card],
  communityCards: readonly Card[],
  opponents: readonly OpponentRange[],
  chenScoreOf: (hole: readonly [Card, Card]) => number,
  rng: () => number,
  trials: number = DEFAULT_TRIALS,
): number {
  if (opponents.length === 0) {
    return 1;
  }

  const baseDeck = createDeck().filter(
    (card) =>
      !isSameCard(card, myHole[0]) &&
      !isSameCard(card, myHole[1]) &&
      !communityCards.some((known) => isSameCard(known, card)),
  );

  let wins = 0;
  let ties = 0;

  for (let trial = 0; trial < trials; trial++) {
    let remaining = shuffleArray(baseDeck, rng);

    const opponentHoles: Array<readonly [Card, Card]> = [];
    for (const opponent of opponents) {
      const drawn = drawQualifyingHole(remaining, opponent.minChenScore, chenScoreOf);
      opponentHoles.push(drawn.hole);
      remaining = drawn.rest;
    }

    const cardsNeeded = 5 - communityCards.length;
    const board = [...communityCards, ...remaining.slice(0, cardsNeeded)];

    const myRank = evaluateHand([...myHole, ...board]);
    const opponentRanks = opponentHoles.map((hole) => evaluateHand([...hole, ...board]));
    const bestOpponentRank = opponentRanks.reduce((best, rank) =>
      compareHandRanks(rank, best) > 0 ? rank : best,
    );

    const comparison = compareHandRanks(myRank, bestOpponentRank);
    if (comparison > 0) {
      wins++;
    } else if (comparison === 0) {
      ties++;
    }
  }

  return (wins + ties * 0.5) / trials;
}

function isSameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function shuffleArray<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Draws 2 cards meeting the range bar from `deck` (already shuffled), and
 * returns the rest of the deck with exactly those 2 cards removed — so
 * unlike a cursor-skipping scan, no card is ever silently lost from the pool
 * regardless of how many opponents are searched in sequence. Since the deck
 * is pre-shuffled, taking the first qualifying pair by index is equivalent to
 * a random qualifying pick. Falls back to the first two cards if nothing
 * meets the bar (an extremely tight threshold against a nearly-empty deck).
 */
function drawQualifyingHole(
  deck: readonly Card[],
  minChenScore: number,
  chenScoreOf: (hole: readonly [Card, Card]) => number,
): { hole: readonly [Card, Card]; rest: Card[] } {
  for (let i = 0; i < deck.length - 1; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      if (chenScoreOf([deck[i]!, deck[j]!]) >= minChenScore) {
        return {
          hole: [deck[i]!, deck[j]!],
          rest: deck.filter((_, index) => index !== i && index !== j),
        };
      }
    }
  }
  return { hole: [deck[0]!, deck[1]!], rest: deck.slice(2) };
}
