/**
 * A continuous stand-in for the traditional discrete early/middle/late
 * position tiers: 0 = earliest (tightest range), 1 = on the button (loosest
 * range). Scales cleanly across any table size (heads-up to 8-max) without
 * needing a hand-tuned tier lookup per seat count.
 *
 * Simplification: real preflop action order lets the blinds close the
 * betting round despite sitting right after the button, which this doesn't
 * model — a deliberate trade-off for a simple, smooth positional signal
 * rather than exact seat-by-seat action order.
 */
export function positionLooseness(
  actingIndex: number,
  buttonIndex: number,
  playerCount: number,
): number {
  if (playerCount <= 2) {
    return actingIndex === buttonIndex ? 0.7 : 0.5; // heads-up: both ranges are wide regardless
  }
  const seatsUntilButton = (buttonIndex - actingIndex + playerCount) % playerCount;
  return 1 - seatsUntilButton / (playerCount - 1);
}
