import { describe, expect, it } from 'vitest';
import { generateSeed } from '../../core/random.js';
import type { GameModule, SeatedPlayer } from '../../core/types.js';
import { createTexasHoldemModule } from './module.js';
import type {
  Card,
  PlayerHandState,
  TexasHoldemAction,
  TexasHoldemSnapshot,
  TexasHoldemState,
} from './types.js';

const config = { smallBlind: 1, bigBlind: 2 };

function seatedPlayers(count: number, stack = 200): SeatedPlayer[] {
  return Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, stack }));
}

function sumDeltas(
  module: GameModule<TexasHoldemState, TexasHoldemAction>,
  state: TexasHoldemState,
) {
  return Object.values(module.getSettlementDeltas(state)).reduce((a, b) => a + b, 0);
}

/** Drives a hand to completion using only check/call, which is always legal. */
function playCheckCallOnly(
  module: GameModule<TexasHoldemState, TexasHoldemAction>,
  state: TexasHoldemState,
): TexasHoldemState {
  let current = state;
  let guard = 0;

  while (current.street !== 'complete') {
    if (guard++ > 1000) {
      throw new Error('playCheckCallOnly did not terminate — likely an engine bug');
    }

    const actingIndex = current.actingIndex;
    if (actingIndex === null) {
      throw new Error('expected an acting player while the street is still open');
    }

    const actor = current.players[actingIndex]!;
    const action: TexasHoldemAction =
      actor.committedThisStreet === current.currentBet ? { type: 'check' } : { type: 'call' };

    const result = module.applyAction(current, actor.playerId, action);
    if (!result.ok) {
      throw new Error(`unexpected illegal action: ${result.error}`);
    }
    current = result.state;
  }

  return current;
}

describe('createTexasHoldemModule: createInitialState', () => {
  it('throws outside the 2-8 player range', () => {
    const module = createTexasHoldemModule(config);
    expect(() => module.createInitialState(seatedPlayers(1), generateSeed())).toThrow();
    expect(() => module.createInitialState(seatedPlayers(9), generateSeed())).toThrow();
  });

  it('deals two hole cards to every seated player from a 52-card deck', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(5), generateSeed());

    expect(state.players).toHaveLength(5);
    for (const player of state.players) {
      expect(player.holeCards).toHaveLength(2);
    }

    const allDealt = state.players.flatMap((p) => p.holeCards);
    const unique = new Set(allDealt.map((c) => `${c.rank}-${c.suit}`));
    expect(unique.size).toBe(10);
    expect(state.deck).toHaveLength(52 - 10);
  });

  it('posts blinds heads-up with the button as small blind, acting first', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(2, 200), generateSeed());

    expect(state.players[0]).toMatchObject({ committed: 1, stack: 199 }); // button/SB
    expect(state.players[1]).toMatchObject({ committed: 2, stack: 198 }); // BB
    expect(state.actingIndex).toBe(0);
    expect(state.currentBet).toBe(2);
  });

  it('posts blinds normally with 3+ players and starts action at UTG', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(4, 200), generateSeed());

    expect(state.players[1]).toMatchObject({ committed: 1 }); // SB
    expect(state.players[2]).toMatchObject({ committed: 2 }); // BB
    expect(state.actingIndex).toBe(3); // UTG, first after BB
  });

  it('rotates the button using previousState', () => {
    const module = createTexasHoldemModule(config);
    const first = module.createInitialState(seatedPlayers(3, 200), generateSeed());
    const second = module.createInitialState(seatedPlayers(3, 200), generateSeed(), first);
    const third = module.createInitialState(seatedPlayers(3, 200), generateSeed(), second);

    expect(second.buttonIndex).toBe((first.buttonIndex + 1) % 3);
    expect(third.buttonIndex).toBe((second.buttonIndex + 1) % 3);
  });
});

describe('createTexasHoldemModule: applyAction turn/legality enforcement', () => {
  it('rejects an action from a player who is not the one to act', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(3, 200), generateSeed());
    // Button (index 0) is UTG and correctly acts first in a 3-handed hand; the
    // small blind (index 1) is genuinely out of turn.
    const outOfTurnPlayer = state.players[1]!;

    const result = module.applyAction(state, outOfTurnPlayer.playerId, { type: 'call' });

    expect(result).toEqual({ ok: false, error: 'not this player’s turn' });
  });

  it('rejects any action once the hand is complete', () => {
    const module = createTexasHoldemModule(config);
    let state = module.createInitialState(seatedPlayers(2, 200), generateSeed());
    const foldResult = module.applyAction(state, state.players[0]!.playerId, { type: 'fold' });
    if (!foldResult.ok) throw new Error('unreachable');
    state = foldResult.state;

    const result = module.applyAction(state, state.players[1]!.playerId, { type: 'check' });
    expect(result).toEqual({ ok: false, error: 'hand is already over' });
  });

  it('surfaces a betting-legality error raised through the module entry point', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(3, 200), generateSeed());
    const utg = state.players[state.actingIndex!]!;

    // Facing the big blind, UTG cannot check.
    const result = module.applyAction(state, utg.playerId, { type: 'check' });

    expect(result).toEqual({ ok: false, error: 'cannot check facing a bet' });
  });
});

describe('createTexasHoldemModule: isRoundOver', () => {
  it('is false mid-hand and true once the hand completes', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(2, 200), generateSeed());
    expect(module.isRoundOver(state)).toBe(false);

    const result = module.applyAction(state, state.players[0]!.playerId, { type: 'fold' });
    if (!result.ok) throw new Error('unreachable');
    expect(module.isRoundOver(result.state)).toBe(true);
  });
});

describe('createTexasHoldemModule: getSnapshot', () => {
  it('hides hole cards from other players until showdown, but shows the viewer their own', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(2, 200), generateSeed());
    const [button, bigBlind] = state.players;

    const spectatorView = module.getSnapshot(state, null) as TexasHoldemSnapshot;
    expect(spectatorView.players.every((p) => p.holeCards === null)).toBe(true);

    const ownView = module.getSnapshot(state, button!.playerId) as TexasHoldemSnapshot;
    const ownEntry = ownView.players.find((p) => p.playerId === button!.playerId)!;
    const otherEntry = ownView.players.find((p) => p.playerId === bigBlind!.playerId)!;
    expect(ownEntry.holeCards).toEqual(button!.holeCards);
    expect(otherEntry.holeCards).toBeNull();
  });

  it('reveals non-folded hole cards to everyone once the hand is complete, but never folded ones', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(3, 200), generateSeed());
    const utg = state.players[state.actingIndex!]!;

    const foldResult = module.applyAction(state, utg.playerId, { type: 'fold' });
    if (!foldResult.ok) throw new Error('unreachable');
    let current = foldResult.state;
    current = playCheckCallOnly(module, current);

    const snapshot = module.getSnapshot(current, null) as TexasHoldemSnapshot;
    for (const player of snapshot.players) {
      if (player.status === 'folded') {
        expect(player.holeCards).toBeNull();
      } else {
        expect(player.holeCards).not.toBeNull();
      }
    }
  });

  it('reports actingPlayerId matching the current acting seat, and null once complete', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(2, 200), generateSeed());
    const snapshot = module.getSnapshot(state, null) as TexasHoldemSnapshot;
    expect(snapshot.actingPlayerId).toBe(state.players[state.actingIndex!]!.playerId);

    const result = module.applyAction(state, state.players[0]!.playerId, { type: 'fold' });
    if (!result.ok) throw new Error('unreachable');
    const finalSnapshot = module.getSnapshot(result.state, null) as TexasHoldemSnapshot;
    expect(finalSnapshot.actingPlayerId).toBeNull();
  });
});

describe('createTexasHoldemModule: full hand simulation', () => {
  it('ends the hand immediately when everyone but one player folds preflop (heads-up)', () => {
    const module = createTexasHoldemModule(config);
    const state = module.createInitialState(seatedPlayers(2, 200), generateSeed());

    const result = module.applyAction(state, state.players[0]!.playerId, { type: 'fold' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');

    expect(result.state.street).toBe('complete');
    expect(result.state.winners).toEqual([state.players[1]!.playerId]);
    expect(sumDeltas(module, result.state)).toBe(0);
    const deltas = module.getSettlementDeltas(result.state);
    expect(deltas[state.players[0]!.playerId]).toBe(-1); // lost their small blind
    expect(deltas[state.players[1]!.playerId]).toBe(1); // won the small blind
  });

  it('plays a full 2-8 player hand headlessly to showdown via check/call, conserving chips', () => {
    for (const playerCount of [2, 3, 5, 8]) {
      const module = createTexasHoldemModule(config);
      const state = module.createInitialState(seatedPlayers(playerCount, 200), generateSeed());

      const finalState = playCheckCallOnly(module, state);

      expect(finalState.street).toBe('complete');
      expect(finalState.communityCards).toHaveLength(5);
      expect(finalState.winners).not.toBeNull();
      expect(finalState.winners!.length).toBeGreaterThan(0);
      expect(sumDeltas(module, finalState)).toBe(0);

      const totalPayouts = Object.values(finalState.potPayouts!).reduce((a, b) => a + b, 0);
      const totalCommitted = finalState.players.reduce((sum, p) => sum + p.committed, 0);
      expect(totalPayouts).toBe(totalCommitted);
    }
  });

  it('auto-runs the board out to showdown when everyone is all-in before the river', () => {
    const module = createTexasHoldemModule(config);
    const stacks = [200, 5, 8]; // button, small blind, big blind — deliberately short SB/BB
    let state = module.createInitialState(
      stacks.map((stack, i) => ({ playerId: `p${i}`, stack })),
      generateSeed(),
    );

    // UTG (the button, in a 3-handed hand) shoves all-in.
    let result = module.applyAction(state, state.players[0]!.playerId, {
      type: 'raise',
      toAmount: 200,
    });
    if (!result.ok) throw new Error('unreachable');
    state = result.state;
    expect(state.street).toBe('preflop'); // still awaiting the blinds' response

    // Small blind calls all-in for its remaining (much smaller) stack.
    result = module.applyAction(state, state.players[1]!.playerId, { type: 'call' });
    if (!result.ok) throw new Error('unreachable');
    state = result.state;
    expect(state.street).toBe('preflop');

    // Big blind calls all-in too — nobody is left who can act, so the engine
    // must deal the flop/turn/river and reach showdown on its own.
    result = module.applyAction(state, state.players[2]!.playerId, { type: 'call' });
    if (!result.ok) throw new Error('unreachable');
    state = result.state;

    expect(state.street).toBe('complete');
    expect(state.communityCards).toHaveLength(5);
    expect(state.players.every((p) => p.status === 'all-in')).toBe(true);
    expect(sumDeltas(module, state)).toBe(0);

    const totalPayouts = Object.values(state.potPayouts!).reduce((a, b) => a + b, 0);
    const totalCommitted = state.players.reduce((sum, p) => sum + p.committed, 0);
    expect(totalPayouts).toBe(totalCommitted);
  });

  it('rotates the button and posts fresh blinds across consecutive hands', () => {
    const module = createTexasHoldemModule(config);
    let state = module.createInitialState(seatedPlayers(3, 200), generateSeed());
    state = playCheckCallOnly(module, state);

    const nextStacks: SeatedPlayer[] = state.players.map((p) => ({
      playerId: p.playerId,
      stack: p.stack + (state.potPayouts?.[p.playerId] ?? 0),
    }));
    expect(nextStacks.reduce((sum, p) => sum + p.stack, 0)).toBe(600); // no chips created/destroyed

    const nextHand = module.createInitialState(nextStacks, generateSeed(), state);
    expect(nextHand.buttonIndex).toBe((state.buttonIndex + 1) % 3);
    expect(nextHand.street).toBe('preflop');
  });
});

describe('createTexasHoldemModule: multi-way all-in with side pots (module-level integration)', () => {
  it('awards each pot to the best eligible hand, wired through advanceStreet -> showdown', () => {
    const module = createTexasHoldemModule(config);

    const communityCards: Card[] = [
      { rank: 14, suit: 'clubs' },
      { rank: 14, suit: 'diamonds' },
      { rank: 13, suit: 'hearts' },
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'diamonds' },
    ];

    function player(
      playerId: string,
      holeCards: readonly [Card, Card],
      committed: number,
      status: PlayerHandState['status'],
      hasActedThisStreet: boolean,
    ): PlayerHandState {
      return {
        playerId,
        startingStack: committed,
        stack: 0,
        holeCards,
        committed,
        committedThisStreet: committed,
        status,
        hasActedThisStreet,
      };
    }

    const state: TexasHoldemState = {
      seed: 'unused-at-showdown',
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      buttonIndex: 0,
      players: [
        // A: all-in for less, has quads -> wins the main pot only
        player(
          'a',
          [
            { rank: 14, suit: 'spades' },
            { rank: 14, suit: 'hearts' },
          ],
          20,
          'all-in',
          true,
        ),
        // B: full house -> wins the side pot
        player(
          'b',
          [
            { rank: 13, suit: 'clubs' },
            { rank: 13, suit: 'spades' },
          ],
          100,
          'active',
          true,
        ),
        // C: weak pair, about to check and close the street
        player(
          'c',
          [
            { rank: 7, suit: 'hearts' },
            { rank: 8, suit: 'hearts' },
          ],
          100,
          'active',
          false,
        ),
      ],
      deck: [],
      communityCards,
      street: 'river',
      currentBet: 100,
      minRaise: config.bigBlind,
      actingIndex: 2,
      winners: null,
      potPayouts: null,
    };

    const result = module.applyAction(state, 'c', { type: 'check' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');

    expect(result.state.street).toBe('complete');
    expect(result.state.potPayouts).toEqual({ a: 60, b: 160, c: 0 });
    expect(sumDeltas(module, result.state)).toBe(40 + 60 - 100);
  });
});
