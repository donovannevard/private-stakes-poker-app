import { describe, expect, it } from 'vitest';
import type { CoinFlipSnapshot } from './__fixtures__/coin-flip-game.js';
import { coinFlipGame } from './__fixtures__/coin-flip-game.js';
import { generateSeed } from './random.js';
import type { GameModule } from './types.js';

/**
 * This file drives the deliberately non-poker "coin flip" fixture through the
 * exact same `GameModule` contract Texas Hold'em implements, to prove the
 * contract is genuinely generic rather than accidentally shaped around poker.
 */
describe('GameModule contract (via coin-flip fixture)', () => {
  const module: GameModule<unknown, { type: 'pick'; side: 'heads' | 'tails' }> = coinFlipGame;

  it('runs a full round end-to-end through only the generic contract', () => {
    const players = [
      { playerId: 'alice', stack: 50 },
      { playerId: 'bob', stack: 50 },
    ];

    let state = module.createInitialState(players, generateSeed());
    expect(module.isRoundOver(state)).toBe(false);

    const spectatorView = module.getSnapshot(state, null) as CoinFlipSnapshot;
    expect(spectatorView.revealed).toBe(false);

    const aliceResult = module.applyAction(state, 'alice', { type: 'pick', side: 'heads' });
    expect(aliceResult.ok).toBe(true);
    if (!aliceResult.ok) throw new Error('unreachable');
    state = aliceResult.state;

    expect(module.isRoundOver(state)).toBe(false);

    const bobResult = module.applyAction(state, 'bob', { type: 'pick', side: 'tails' });
    expect(bobResult.ok).toBe(true);
    if (!bobResult.ok) throw new Error('unreachable');
    state = bobResult.state;

    expect(module.isRoundOver(state)).toBe(true);

    const deltas = module.getSettlementDeltas(state);
    const values = Object.values(deltas);
    expect(values.reduce((sum, delta) => sum + delta, 0)).toBe(0);
    expect(Math.abs(values[0]!)).toBe(50);

    const finalSnapshot = module.getSnapshot(state, null) as CoinFlipSnapshot;
    expect(finalSnapshot.revealed).toBe(true);
    expect(finalSnapshot.flipResult).toBeDefined();
  });

  it('rejects an action from a non-participant, through the generic contract', () => {
    const players = [
      { playerId: 'alice', stack: 50 },
      { playerId: 'bob', stack: 50 },
    ];
    const state = module.createInitialState(players, generateSeed());

    const result = module.applyAction(state, 'mallory', { type: 'pick', side: 'heads' });

    expect(result).toEqual({ ok: false, error: 'not a participant in this game' });
  });
});
