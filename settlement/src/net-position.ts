export type PlayerId = string;

export interface RosterLike {
  readonly playerId: PlayerId;
  readonly stack: number;
}

/**
 * Net win/loss for the whole session so far, per player — `stack` already
 * carries forward across every hand played at a table, so this is just the
 * difference from what everyone started with (a single shared starting
 * stack, per how tables are configured).
 */
export function computeNetPositions(
  roster: readonly RosterLike[],
  startingStack: number,
): Record<PlayerId, number> {
  return Object.fromEntries(roster.map((entry) => [entry.playerId, entry.stack - startingStack]));
}
