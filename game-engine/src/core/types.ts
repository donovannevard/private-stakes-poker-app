export type PlayerId = string;

export interface SeatedPlayer {
  readonly playerId: PlayerId;
  readonly stack: number;
}

export type ActionResult<TState> = { ok: true; state: TState } | { ok: false; error: string };

/**
 * The contract every game (Texas Hold'em, future poker variants, and eventually
 * non-poker games) must implement. Table management, networking, and settlement
 * code depend only on this interface, never on a specific game's rules.
 *
 * Seating (who's allowed to sit, when) is a between-round, table-management
 * concern handled by the caller: it decides which players to pass into
 * `createInitialState` for the next round. There are deliberately no
 * join/leave methods on this contract.
 */
export interface GameModule<TState, TAction> {
  readonly gameType: string;

  createInitialState(players: SeatedPlayer[], seed: string, previousState?: TState): TState;

  applyAction(state: TState, playerId: PlayerId, action: TAction): ActionResult<TState>;

  isRoundOver(state: TState): boolean;

  /** Net chip change per player for this round, relative to what they brought in. */
  getSettlementDeltas(state: TState): Record<PlayerId, number>;

  /** `viewerId` of `null` means a spectator: no player's hidden information is revealed. */
  getSnapshot(state: TState, viewerId: PlayerId | null): unknown;
}
