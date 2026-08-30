import type { PlayerId } from './net-position.js';

export interface Transfer {
  /** Deterministic, not random — re-running the computation must not change existing ids,
   *  since a frontend may already have an invoice/paid-status attached to one. */
  readonly id: string;
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: number;
}

export type TransferResult =
  | { readonly ok: true; readonly transfers: readonly Transfer[] }
  | { readonly ok: false; readonly error: string };

/**
 * Greedy largest-debtor-vs-largest-creditor debt netting (the same approach
 * tools like Splitwise use): minimizes the transfer count in most cases, but
 * is not a provably minimal solution in general — a real counterexample
 * exists where two independent zero-sum clusters get bridged by a tie-break,
 * costing one extra transfer. Not worth an exact solver at the table sizes
 * this app supports (max 8 seats): worst case is one avoidable transfer
 * among at most 8 people.
 */
export function computeTransfers(netPositions: Readonly<Record<PlayerId, number>>): TransferResult {
  const entries = Object.entries(netPositions).filter(([, amount]) => amount !== 0);

  for (const [playerId, amount] of entries) {
    if (!Number.isInteger(amount)) {
      return { ok: false, error: `non-integer net position for player ${playerId}` };
    }
  }

  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  if (total !== 0) {
    return { ok: false, error: 'net positions do not sum to zero' };
  }

  const creditors = entries
    .filter(([, amount]) => amount > 0)
    .map(([playerId, amount]) => ({ playerId, remaining: amount }))
    .sort((a, b) => b.remaining - a.remaining || a.playerId.localeCompare(b.playerId));
  const debtors = entries
    .filter(([, amount]) => amount < 0)
    .map(([playerId, amount]) => ({ playerId, remaining: -amount }))
    .sort((a, b) => b.remaining - a.remaining || a.playerId.localeCompare(b.playerId));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  // A static single pass over both pre-sorted arrays is sufficient: remaining
  // amounts only ever shrink and one side hits exactly zero each iteration,
  // so the next not-yet-exhausted element is always still the current
  // largest — nothing needs to be re-sorted mid-walk.
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i]!;
    const debtor = debtors[j]!;
    const amount = Math.min(creditor.remaining, debtor.remaining);

    transfers.push({
      id: `${debtor.playerId}:${creditor.playerId}`,
      from: debtor.playerId,
      to: creditor.playerId,
      amount,
    });

    creditor.remaining -= amount;
    debtor.remaining -= amount;
    if (creditor.remaining === 0) i++;
    if (debtor.remaining === 0) j++;
  }

  return { ok: true, transfers };
}
