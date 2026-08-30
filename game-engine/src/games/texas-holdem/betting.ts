import type { PlayerHandState, TexasHoldemAction } from './types.js';

export interface BettingUpdate {
  readonly players: readonly PlayerHandState[];
  readonly currentBet: number;
  readonly minRaise: number;
}

export type BettingActionResult =
  | { readonly ok: true; readonly update: BettingUpdate }
  | { readonly ok: false; readonly error: string };

/**
 * Applies one player's action within a single betting round. Does not decide
 * whose turn is next or whether the street is over — see `getNextActiveIndex`
 * and `isStreetComplete`, which module.ts composes with this.
 *
 * Simplification: a short all-in raise (below `minRaise`) is accepted, but this
 * engine doesn't model the real-rule nuance that it shouldn't let players who
 * already matched the previous bet re-raise again — they're allowed to. Kept
 * simple deliberately; see PHASES.md Phase 1 for context.
 */
export function applyBettingAction(
  players: readonly PlayerHandState[],
  actingIndex: number,
  currentBet: number,
  minRaise: number,
  action: TexasHoldemAction,
): BettingActionResult {
  const player = players[actingIndex];
  if (!player || player.status !== 'active') {
    return { ok: false, error: 'this player cannot act right now' };
  }

  switch (action.type) {
    case 'fold':
      return {
        ok: true,
        update: {
          players: replacePlayer(players, actingIndex, {
            ...player,
            status: 'folded',
            hasActedThisStreet: true,
          }),
          currentBet,
          minRaise,
        },
      };

    case 'check': {
      if (player.committedThisStreet !== currentBet) {
        return { ok: false, error: 'cannot check facing a bet' };
      }
      return {
        ok: true,
        update: {
          players: replacePlayer(players, actingIndex, { ...player, hasActedThisStreet: true }),
          currentBet,
          minRaise,
        },
      };
    }

    case 'call': {
      if (currentBet <= player.committedThisStreet) {
        return { ok: false, error: 'nothing to call — use check instead' };
      }

      const callAmount = Math.min(currentBet - player.committedThisStreet, player.stack);
      const updated: PlayerHandState = {
        ...player,
        stack: player.stack - callAmount,
        committed: player.committed + callAmount,
        committedThisStreet: player.committedThisStreet + callAmount,
        status: player.stack - callAmount === 0 ? 'all-in' : 'active',
        hasActedThisStreet: true,
      };

      return {
        ok: true,
        update: { players: replacePlayer(players, actingIndex, updated), currentBet, minRaise },
      };
    }

    case 'raise': {
      if (action.toAmount <= currentBet) {
        return { ok: false, error: 'raise must exceed the current bet' };
      }

      const delta = action.toAmount - player.committedThisStreet;
      if (delta > player.stack) {
        return { ok: false, error: 'insufficient stack for this raise' };
      }

      const isAllIn = delta === player.stack;
      const increment = action.toAmount - currentBet;
      if (increment < minRaise && !isAllIn) {
        return { ok: false, error: 'raise is below the minimum raise size' };
      }

      const updated: PlayerHandState = {
        ...player,
        stack: player.stack - delta,
        committed: player.committed + delta,
        committedThisStreet: action.toAmount,
        status: isAllIn ? 'all-in' : 'active',
        hasActedThisStreet: true,
      };

      return {
        ok: true,
        update: {
          players: replacePlayer(players, actingIndex, updated),
          currentBet: action.toAmount,
          minRaise: increment >= minRaise ? increment : minRaise,
        },
      };
    }
  }
}

/** True once every still-active player has both matched `currentBet` and acted this street. */
export function isStreetComplete(players: readonly PlayerHandState[], currentBet: number): boolean {
  const activePlayers = players.filter((player) => player.status === 'active');
  if (activePlayers.length === 0) {
    return true;
  }
  return activePlayers.every(
    (player) => player.hasActedThisStreet && player.committedThisStreet === currentBet,
  );
}

/** Next player (wrapping) with status 'active', searching strictly after `fromIndex`. */
export function getNextActiveIndex(
  players: readonly PlayerHandState[],
  fromIndex: number,
): number | null {
  for (let offset = 1; offset <= players.length; offset++) {
    const index = (fromIndex + offset) % players.length;
    if (players[index]!.status === 'active') {
      return index;
    }
  }
  return null;
}

function replacePlayer(
  players: readonly PlayerHandState[],
  index: number,
  next: PlayerHandState,
): PlayerHandState[] {
  const copy = [...players];
  copy[index] = next;
  return copy;
}
