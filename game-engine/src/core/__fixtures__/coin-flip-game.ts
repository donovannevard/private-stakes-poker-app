import { createDeterministicRng } from '../random.js';
import type { ActionResult, GameModule, PlayerId, SeatedPlayer } from '../types.js';

/**
 * A deliberately trivial two-player game used only to prove the `GameModule`
 * contract isn't accidentally shaped around poker: no streets, no side pots,
 * no turn order, and only one simultaneous-choice action.
 *
 * Each player wagers the same amount and picks a side. Whoever picked the side
 * matching the (seed-derived) flip takes the pot; matching picks split or push.
 */
export type CoinFlipSide = 'heads' | 'tails';

export interface CoinFlipState {
  readonly players: readonly [SeatedPlayer, SeatedPlayer];
  readonly wager: number;
  readonly picks: Readonly<Partial<Record<PlayerId, CoinFlipSide>>>;
  readonly flipResult: CoinFlipSide;
}

export type CoinFlipAction = { type: 'pick'; side: CoinFlipSide };

export interface CoinFlipSnapshot {
  readonly wager: number;
  readonly hasPicked: Readonly<Record<PlayerId, boolean>>;
  readonly revealed: boolean;
  readonly picks?: Readonly<Partial<Record<PlayerId, CoinFlipSide>>>;
  readonly flipResult?: CoinFlipSide;
}

function isOver(state: CoinFlipState): boolean {
  return state.players.every((player) => state.picks[player.playerId] !== undefined);
}

export const coinFlipGame: GameModule<CoinFlipState, CoinFlipAction> = {
  gameType: 'coin-flip',

  createInitialState(players, seed) {
    if (players.length !== 2) {
      throw new Error('coin-flip requires exactly 2 players');
    }

    const [first, second] = players as [SeatedPlayer, SeatedPlayer];
    const rng = createDeterministicRng(seed);

    return {
      players: [first, second],
      wager: Math.min(first.stack, second.stack),
      picks: {},
      flipResult: rng() < 0.5 ? 'heads' : 'tails',
    };
  },

  applyAction(state, playerId, action): ActionResult<CoinFlipState> {
    if (!state.players.some((player) => player.playerId === playerId)) {
      return { ok: false, error: 'not a participant in this game' };
    }

    if (state.picks[playerId] !== undefined) {
      return { ok: false, error: 'already picked' };
    }

    return {
      ok: true,
      state: { ...state, picks: { ...state.picks, [playerId]: action.side } },
    };
  },

  isRoundOver: isOver,

  getSettlementDeltas(state) {
    const [first, second] = state.players;
    const deltas: Record<PlayerId, number> = { [first.playerId]: 0, [second.playerId]: 0 };

    if (!isOver(state)) {
      return deltas;
    }

    const firstCorrect = state.picks[first.playerId] === state.flipResult;
    const secondCorrect = state.picks[second.playerId] === state.flipResult;

    if (firstCorrect === secondCorrect) {
      return deltas; // both matched (split) or both missed (push) — net zero either way
    }

    const winner = firstCorrect ? first : second;
    const loser = firstCorrect ? second : first;
    deltas[winner.playerId] = state.wager;
    deltas[loser.playerId] = -state.wager;

    return deltas;
  },

  getSnapshot(state, _viewerId): CoinFlipSnapshot {
    const hasPicked: Record<PlayerId, boolean> = {};
    for (const player of state.players) {
      hasPicked[player.playerId] = state.picks[player.playerId] !== undefined;
    }

    const revealed = isOver(state);

    if (!revealed) {
      return { wager: state.wager, hasPicked, revealed };
    }

    return {
      wager: state.wager,
      hasPicked,
      revealed,
      picks: state.picks,
      flipResult: state.flipResult,
    };
  },
};
