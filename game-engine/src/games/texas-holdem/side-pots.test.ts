import { describe, expect, it } from 'vitest';
import type { HandRank } from './hand-evaluation.js';
import { computeSidePots, distributePots } from './side-pots.js';
import type { PlayerHandState } from './types.js';

const FILLER_CARDS: PlayerHandState['holeCards'] = [
  { rank: 2, suit: 'clubs' },
  { rank: 3, suit: 'clubs' },
];

function makePlayer(overrides: Partial<PlayerHandState> & { playerId: string }): PlayerHandState {
  return {
    startingStack: 0,
    stack: 0,
    holeCards: FILLER_CARDS,
    committed: 0,
    committedThisStreet: 0,
    status: 'active',
    hasActedThisStreet: true,
    ...overrides,
  };
}

function rank(category: number): HandRank {
  return { category, tiebreakers: [] };
}

describe('computeSidePots', () => {
  it('returns a single main pot when nobody is all-in for less than another', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 100 }),
      makePlayer({ playerId: 'b', committed: 100 }),
      makePlayer({ playerId: 'c', committed: 100 }),
    ];

    const pots = computeSidePots(players);

    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] }]);
  });

  it('creates a side pot for a shorter all-in stack', () => {
    // a is all-in for 50, b and c each committed 100
    const players = [
      makePlayer({ playerId: 'a', committed: 50, status: 'all-in' }),
      makePlayer({ playerId: 'b', committed: 100 }),
      makePlayer({ playerId: 'c', committed: 100 }),
    ];

    const pots = computeSidePots(players);

    expect(pots).toEqual([
      { amount: 150, eligiblePlayerIds: ['a', 'b', 'c'] },
      { amount: 100, eligiblePlayerIds: ['b', 'c'] },
    ]);
  });

  it('excludes folded players from eligibility but keeps their chips in the pot', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 100, status: 'folded' }),
      makePlayer({ playerId: 'b', committed: 100 }),
      makePlayer({ playerId: 'c', committed: 100 }),
    ];

    const pots = computeSidePots(players);

    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['b', 'c'] }]);
  });

  it('handles three distinct all-in levels', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 20, status: 'all-in' }),
      makePlayer({ playerId: 'b', committed: 50, status: 'all-in' }),
      makePlayer({ playerId: 'c', committed: 100 }),
    ];

    const pots = computeSidePots(players);

    expect(pots).toEqual([
      { amount: 60, eligiblePlayerIds: ['a', 'b', 'c'] }, // 20 * 3
      { amount: 60, eligiblePlayerIds: ['b', 'c'] }, // 30 * 2
      { amount: 50, eligiblePlayerIds: ['c'] }, // 50 * 1
    ]);
  });

  it('returns no pots when nobody committed anything', () => {
    const players = [makePlayer({ playerId: 'a' }), makePlayer({ playerId: 'b' })];
    expect(computeSidePots(players)).toEqual([]);
  });
});

describe('distributePots', () => {
  it('awards the whole pot to the sole eligible winner without evaluating hands', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 50, status: 'folded' }),
      makePlayer({ playerId: 'b', committed: 50 }),
    ];
    const pots = [{ amount: 100, eligiblePlayerIds: ['b'] }];

    const payouts = distributePots(pots, new Map(), 0, players);

    expect(payouts).toEqual({ a: 0, b: 100 });
  });

  it('awards a contested pot to the best hand', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 100 }),
      makePlayer({ playerId: 'b', committed: 100 }),
    ];
    const pots = [{ amount: 200, eligiblePlayerIds: ['a', 'b'] }];
    const handRanks = new Map([
      ['a', rank(3)],
      ['b', rank(6)],
    ]);

    const payouts = distributePots(pots, handRanks, 0, players);

    expect(payouts).toEqual({ a: 0, b: 200 });
  });

  it('splits a tied pot evenly, with the odd chip going to the first winner after the button', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 101 }),
      makePlayer({ playerId: 'b', committed: 101 }),
      makePlayer({ playerId: 'c', committed: 101 }),
    ];
    const pots = [{ amount: 301, eligiblePlayerIds: ['a', 'b', 'c'] }];
    const handRanks = new Map([
      ['a', rank(2)],
      ['b', rank(2)],
      ['c', rank(2)],
    ]);

    // button is seat 0 (a); odd chip should go to the first winner after the
    // button in seat order: b (seat 1), then c, then a.
    const payouts = distributePots(pots, handRanks, 0, players);

    expect(payouts).toEqual({ a: 100, b: 101, c: 100 });
  });

  it('correctly distributes layered side pots to different winners', () => {
    const players = [
      makePlayer({ playerId: 'a', committed: 20, status: 'all-in' }),
      makePlayer({ playerId: 'b', committed: 50, status: 'all-in' }),
      makePlayer({ playerId: 'c', committed: 100 }),
    ];
    const pots = computeSidePots(players);
    // a has the best hand but is only eligible for the main pot; c has the
    // second-best hand and mops up both side pots it's eligible for.
    const handRanks = new Map([
      ['a', rank(8)],
      ['b', rank(1)],
      ['c', rank(4)],
    ]);

    const payouts = distributePots(pots, handRanks, 2, players);

    expect(payouts).toEqual({ a: 60, b: 0, c: 110 });
  });
});
