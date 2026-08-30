import type { ActionResult, GameModule, PlayerId, SeatedPlayer } from './types.js';

export interface ActionLogEntry<TAction> {
  readonly playerId: PlayerId;
  readonly action: TAction;
}

export type ReplayResult<TState> =
  { ok: true; state: TState } | { ok: false; error: string; failedAt: number };

/**
 * Rebuilds the final state of a round from scratch: the initial players, the
 * seed used for that round, and the recorded sequence of actions. Deterministic
 * because the only randomness (the shuffle) is derived from the seed.
 *
 * `previousState`, if given, is threaded straight through to
 * `createInitialState` exactly as it would be for a live deal — required for
 * games (like Texas Hold'em) whose initial state depends on what came before
 * (e.g. button rotation). Omit it only when replaying a round that's truly
 * the first of a table's lifetime.
 */
export function replayActions<TState, TAction>(
  module: GameModule<TState, TAction>,
  players: SeatedPlayer[],
  seed: string,
  actionLog: ReadonlyArray<ActionLogEntry<TAction>>,
  previousState?: TState,
): ReplayResult<TState> {
  let state = module.createInitialState(players, seed, previousState);

  for (const [index, entry] of actionLog.entries()) {
    const result: ActionResult<TState> = module.applyAction(state, entry.playerId, entry.action);

    if (!result.ok) {
      return { ok: false, error: result.error, failedAt: index };
    }

    state = result.state;
  }

  return { ok: true, state };
}
