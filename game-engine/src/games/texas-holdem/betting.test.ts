import { describe, expect, it } from 'vitest';
import { applyBettingAction, getNextActiveIndex, isStreetComplete } from './betting.js';
import type { PlayerHandState } from './types.js';

const FILLER_CARDS: PlayerHandState['holeCards'] = [
  { rank: 2, suit: 'clubs' },
  { rank: 3, suit: 'clubs' },
];

function makePlayer(overrides: Partial<PlayerHandState> & { playerId: string }): PlayerHandState {
  return {
    startingStack: 100,
    stack: 100,
    holeCards: FILLER_CARDS,
    committed: 0,
    committedThisStreet: 0,
    status: 'active',
    hasActedThisStreet: false,
    ...overrides,
  };
}

describe('applyBettingAction', () => {
  it('rejects an action from a player who is not active', () => {
    const players = [
      makePlayer({ playerId: 'a', status: 'folded' }),
      makePlayer({ playerId: 'b' }),
    ];
    const result = applyBettingAction(players, 0, 0, 10, { type: 'check' });
    expect(result).toEqual({ ok: false, error: 'this player cannot act right now' });
  });

  it('rejects check when facing a bet', () => {
    const players = [
      makePlayer({ playerId: 'a', committedThisStreet: 0 }),
      makePlayer({ playerId: 'b', committedThisStreet: 20 }),
    ];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'check' });
    expect(result).toEqual({ ok: false, error: 'cannot check facing a bet' });
  });

  it('allows check when already matched (e.g. big blind option)', () => {
    const players = [makePlayer({ playerId: 'a', committedThisStreet: 20 })];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'check' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.update.players[0]!.hasActedThisStreet).toBe(true);
  });

  it('rejects call when there is nothing to call', () => {
    const players = [makePlayer({ playerId: 'a', committedThisStreet: 20 })];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'call' });
    expect(result).toEqual({ ok: false, error: 'nothing to call — use check instead' });
  });

  it('applies a call, capping at the remaining stack (all-in call)', () => {
    const players = [
      makePlayer({ playerId: 'a', stack: 15, committed: 5, committedThisStreet: 5 }),
    ];
    const result = applyBettingAction(players, 0, 50, 10, { type: 'call' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const [player] = result.update.players;
    expect(player).toMatchObject({
      stack: 0,
      committed: 20,
      committedThisStreet: 20,
      status: 'all-in',
    });
  });

  it('rejects a raise that does not exceed the current bet', () => {
    const players = [makePlayer({ playerId: 'a' })];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'raise', toAmount: 20 });
    expect(result).toEqual({ ok: false, error: 'raise must exceed the current bet' });
  });

  it('rejects a raise below the minimum raise size', () => {
    const players = [makePlayer({ playerId: 'a', stack: 100 })];
    // current bet 20, min raise 20 -> next legal raise must be to at least 40
    const result = applyBettingAction(players, 0, 20, 20, { type: 'raise', toAmount: 30 });
    expect(result).toEqual({ ok: false, error: 'raise is below the minimum raise size' });
  });

  it('rejects a raise beyond the player’s stack', () => {
    const players = [makePlayer({ playerId: 'a', stack: 50 })];
    const result = applyBettingAction(players, 0, 0, 10, { type: 'raise', toAmount: 200 });
    expect(result).toEqual({ ok: false, error: 'insufficient stack for this raise' });
  });

  it('allows a full raise, updating currentBet and minRaise', () => {
    const players = [makePlayer({ playerId: 'a', stack: 100 })];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'raise', toAmount: 60 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.update.currentBet).toBe(60);
    expect(result.update.minRaise).toBe(40);
    expect(result.update.players[0]).toMatchObject({ stack: 40, committed: 60, status: 'active' });
  });

  it('allows a short all-in raise below the minimum raise size, without raising minRaise', () => {
    const players = [makePlayer({ playerId: 'a', stack: 25 })];
    const result = applyBettingAction(players, 0, 20, 20, { type: 'raise', toAmount: 25 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.update.currentBet).toBe(25);
    expect(result.update.minRaise).toBe(20);
    expect(result.update.players[0]).toMatchObject({ stack: 0, status: 'all-in' });
  });
});

describe('isStreetComplete', () => {
  it('is false until every active player has matched and acted', () => {
    const players = [
      makePlayer({ playerId: 'a', committedThisStreet: 20, hasActedThisStreet: true }),
      makePlayer({ playerId: 'b', committedThisStreet: 0, hasActedThisStreet: false }),
    ];
    expect(isStreetComplete(players, 20)).toBe(false);
  });

  it('is true once every active player matched the current bet and acted', () => {
    const players = [
      makePlayer({ playerId: 'a', committedThisStreet: 20, hasActedThisStreet: true }),
      makePlayer({ playerId: 'b', committedThisStreet: 20, hasActedThisStreet: true }),
    ];
    expect(isStreetComplete(players, 20)).toBe(true);
  });

  it('is true when everyone remaining is folded or all-in', () => {
    const players = [
      makePlayer({ playerId: 'a', status: 'folded' }),
      makePlayer({ playerId: 'b', status: 'all-in' }),
    ];
    expect(isStreetComplete(players, 20)).toBe(true);
  });

  it('is not satisfied just because commitments match with no action taken (big blind option)', () => {
    const players = [
      makePlayer({ playerId: 'a', committedThisStreet: 20, hasActedThisStreet: false }),
    ];
    expect(isStreetComplete(players, 20)).toBe(false);
  });
});

describe('getNextActiveIndex', () => {
  it('finds the next active player, wrapping around', () => {
    const players = [
      makePlayer({ playerId: 'a' }),
      makePlayer({ playerId: 'b', status: 'folded' }),
      makePlayer({ playerId: 'c' }),
    ];
    expect(getNextActiveIndex(players, 0)).toBe(2);
    expect(getNextActiveIndex(players, 2)).toBe(0);
  });

  it('returns null when no active players remain', () => {
    const players = [
      makePlayer({ playerId: 'a', status: 'folded' }),
      makePlayer({ playerId: 'b', status: 'all-in' }),
    ];
    expect(getNextActiveIndex(players, 0)).toBeNull();
  });
});
