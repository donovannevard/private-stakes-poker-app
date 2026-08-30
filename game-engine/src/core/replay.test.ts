import { describe, expect, it } from 'vitest';
import { createTexasHoldemModule } from '../games/texas-holdem/module.js';
import { coinFlipGame } from './__fixtures__/coin-flip-game.js';
import { generateSeed } from './random.js';
import { replayActions } from './replay.js';

describe('replayActions', () => {
  it('reproduces the same final state from the same seed and action log', () => {
    const players = [
      { playerId: 'alice', stack: 100 },
      { playerId: 'bob', stack: 100 },
    ];
    const seed = generateSeed();
    const actionLog = [
      { playerId: 'alice', action: { type: 'pick' as const, side: 'heads' as const } },
      { playerId: 'bob', action: { type: 'pick' as const, side: 'tails' as const } },
    ];

    const first = replayActions(coinFlipGame, players, seed, actionLog);
    const second = replayActions(coinFlipGame, players, seed, actionLog);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it('surfaces the error and index of an illegal action instead of throwing', () => {
    const players = [
      { playerId: 'alice', stack: 100 },
      { playerId: 'bob', stack: 100 },
    ];
    const seed = generateSeed();
    const actionLog = [
      { playerId: 'alice', action: { type: 'pick' as const, side: 'heads' as const } },
      { playerId: 'alice', action: { type: 'pick' as const, side: 'heads' as const } },
    ];

    const result = replayActions(coinFlipGame, players, seed, actionLog);

    expect(result).toEqual({ ok: false, error: 'already picked', failedAt: 1 });
  });

  it('threads previousState through to createInitialState, matching a live deal that rotates the button', () => {
    // Regression test: Texas Hold'em's createInitialState derives the new
    // button from `previousState.buttonIndex + 1`. Replaying the *second* (or
    // later) hand of a table's lifetime without passing the prior hand's
    // state silently reproduces the wrong button — and therefore the wrong
    // acting order — causing replay to reject the very first recorded action
    // as "not this player's turn".
    const module = createTexasHoldemModule({ smallBlind: 1, bigBlind: 2 });
    const players = [
      { playerId: 'alice', stack: 200 },
      { playerId: 'bob', stack: 200 },
      { playerId: 'carol', stack: 200 },
    ];

    const firstHandState = module.createInitialState(players, generateSeed());
    const secondHandSeed = generateSeed();
    const secondHandState = module.createInitialState(players, secondHandSeed, firstHandState);

    const actingPlayerId = secondHandState.players[secondHandState.actingIndex!]!.playerId;
    const actionLog = [{ playerId: actingPlayerId, action: { type: 'fold' as const } }];

    const withoutPreviousState = replayActions(module, players, secondHandSeed, actionLog);
    const withPreviousState = replayActions(
      module,
      players,
      secondHandSeed,
      actionLog,
      firstHandState,
    );

    expect(withoutPreviousState.ok).toBe(false); // wrong button — first action rejected
    expect(withPreviousState.ok).toBe(true);
  });
});
