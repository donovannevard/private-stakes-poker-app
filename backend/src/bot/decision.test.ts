import type { PlayerHandState, TexasHoldemState } from '@lightning-poker/game-engine';
import { describe, expect, it } from 'vitest';
import { chooseBotAction, decideIdeal } from './decision.js';

/** Small deterministic PRNG (mulberry32) so statistical tests are reproducible, not flaky. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function player(overrides: Partial<PlayerHandState> & { playerId: string }): PlayerHandState {
  return {
    startingStack: 200,
    stack: 200,
    holeCards: [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'hearts' },
    ],
    committed: 0,
    committedThisStreet: 0,
    status: 'active',
    hasActedThisStreet: false,
    ...overrides,
  };
}

function state(overrides: Partial<TexasHoldemState>): TexasHoldemState {
  return {
    seed: 'seed',
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    players: [],
    deck: [],
    communityCards: [],
    street: 'preflop',
    currentBet: 2,
    minRaise: 2,
    actingIndex: 1,
    winners: null,
    potPayouts: null,
    ...overrides,
  };
}

describe('decideIdeal (pure, no randomization)', () => {
  const facingBigBetState = state({
    street: 'river',
    currentBet: 100,
    minRaise: 50,
    players: [
      player({ playerId: 'villain', committed: 100, committedThisStreet: 100, stack: 100 }),
      player({ playerId: 'bot', committed: 0, committedThisStreet: 0, stack: 200 }),
    ],
    actingIndex: 1,
  });
  const botPlayer = facingBigBetState.players[1]!;

  it('folds a weak hand facing a large bet', () => {
    const action = decideIdeal(facingBigBetState, 1, botPlayer, true, 100, 0.1);
    expect(action.type).toBe('fold');
  });

  it('calls when equity clears pot odds by a modest margin', () => {
    // potOdds = 100/(100+100) = 0.5; strength just above potOdds + CALL_MARGIN(0.05)
    const action = decideIdeal(facingBigBetState, 1, botPlayer, true, 100, 0.58);
    expect(action.type).toBe('call');
  });

  it('raises for value when clearly ahead of a bet', () => {
    const action = decideIdeal(facingBigBetState, 1, botPlayer, true, 100, 0.95);
    expect(action.type).toBe('raise');
  });

  const checkedToState = state({
    street: 'river',
    currentBet: 0,
    minRaise: 2,
    players: [
      player({ playerId: 'villain', committed: 20, committedThisStreet: 0, stack: 80 }),
      player({ playerId: 'bot', committed: 20, committedThisStreet: 0, stack: 80 }),
    ],
    actingIndex: 1,
  });
  const checkedToBot = checkedToState.players[1]!;

  it('checks back a weak hand with nothing to call', () => {
    const action = decideIdeal(checkedToState, 1, checkedToBot, false, 40, 0.2);
    expect(action.type).toBe('check');
  });

  it('bets for value with a strong hand and nothing to call', () => {
    const action = decideIdeal(checkedToState, 1, checkedToBot, false, 40, 0.9);
    expect(action.type).toBe('raise');
  });
});

describe('chooseBotAction', () => {
  const facingBigBetState = state({
    street: 'river',
    communityCards: [
      { rank: 9, suit: 'spades' },
      { rank: 4, suit: 'diamonds' },
      { rank: 6, suit: 'clubs' },
      { rank: 11, suit: 'hearts' },
      { rank: 13, suit: 'spades' },
    ],
    currentBet: 100,
    minRaise: 50,
    players: [
      player({ playerId: 'villain', committed: 100, committedThisStreet: 100, stack: 100 }),
      player({
        playerId: 'bot',
        holeCards: [
          { rank: 7, suit: 'clubs' },
          { rank: 2, suit: 'hearts' },
        ],
        committed: 0,
        committedThisStreet: 0,
        stack: 200,
      }),
    ],
    actingIndex: 1,
  });
  const actionLog = [{ playerId: 'villain', action: { type: 'raise' as const, toAmount: 100 } }];

  it('folds this hand under the ideal line (sanity check with equity in the loop)', () => {
    const action = chooseBotAction({
      state: facingBigBetState,
      actingIndex: 1,
      actionLog,
      skill: 100,
      rng: mulberry32(1),
    });
    // Villain's tight, aggression-implied range crushes 7-high here — either
    // the ideal fold, or (rarely, at skill 100) a bluff-raise, never a call.
    expect(['fold', 'raise']).toContain(action.type);
  });

  it('folds more often at high skill than at low skill, over many trials with matched rolls', () => {
    const trials = 80;
    let highSkillFolds = 0;
    let lowSkillFolds = 0;

    for (let i = 0; i < trials; i++) {
      const seed = 1000 + i;
      const highSkillAction = chooseBotAction({
        state: facingBigBetState,
        actingIndex: 1,
        actionLog,
        skill: 100,
        rng: mulberry32(seed),
      });
      const lowSkillAction = chooseBotAction({
        state: facingBigBetState,
        actingIndex: 1,
        actionLog,
        skill: 0,
        rng: mulberry32(seed),
      });
      if (highSkillAction.type === 'fold') highSkillFolds++;
      if (lowSkillAction.type === 'fold') lowSkillFolds++;
    }

    expect(highSkillFolds).toBeGreaterThan(lowSkillFolds);
  });
});
