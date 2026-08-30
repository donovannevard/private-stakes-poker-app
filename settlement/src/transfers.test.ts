import { describe, expect, it } from 'vitest';
import { computeTransfers } from './transfers.js';

describe('computeTransfers', () => {
  it('produces a single transfer for a 2-player result', () => {
    const result = computeTransfers({ alice: 50, bob: -50 });

    expect(result).toEqual({
      ok: true,
      transfers: [{ id: 'bob:alice', from: 'bob', to: 'alice', amount: 50 }],
    });
  });

  it('nets a mix of winners and losers into the minimum transfers in the common case', () => {
    // alice +70, bob -50, carol -20 -> bob and carol each pay alice directly.
    const result = computeTransfers({ alice: 70, bob: -50, carol: -20 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers.every((t) => t.to === 'alice')).toBe(true);
    expect(result.transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(70);
  });

  it('returns no transfers when everyone is exactly even', () => {
    expect(computeTransfers({ alice: 0, bob: 0 })).toEqual({ ok: true, transfers: [] });
  });

  it('ignores zero balances mixed in with real ones', () => {
    const result = computeTransfers({ alice: 10, bob: -10, carol: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transfers).toEqual([{ id: 'bob:alice', from: 'bob', to: 'alice', amount: 10 }]);
  });

  it('rejects a non-integer net position', () => {
    expect(computeTransfers({ alice: 10.5, bob: -10.5 })).toEqual({
      ok: false,
      error: 'non-integer net position for player alice',
    });
  });

  it('rejects net positions that do not sum to zero', () => {
    expect(computeTransfers({ alice: 10, bob: -5 })).toEqual({
      ok: false,
      error: 'net positions do not sum to zero',
    });
  });

  it('handles a full 8-seat table', () => {
    const netPositions = {
      p1: 100,
      p2: 50,
      p3: -20,
      p4: -20,
      p5: -20,
      p6: -20,
      p7: -20,
      p8: -50,
    };

    const result = computeTransfers(netPositions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Chip-conservation check: every debtor's total outgoing equals their debt,
    // every creditor's total incoming equals their credit.
    const totalsByPlayer: Record<string, number> = {};
    for (const transfer of result.transfers) {
      totalsByPlayer[transfer.from] = (totalsByPlayer[transfer.from] ?? 0) - transfer.amount;
      totalsByPlayer[transfer.to] = (totalsByPlayer[transfer.to] ?? 0) + transfer.amount;
    }
    expect(totalsByPlayer).toEqual(netPositions);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const netPositions = { alice: 30, bob: -10, carol: -20 };

    const first = computeTransfers(netPositions);
    const second = computeTransfers(netPositions);

    expect(first).toEqual(second);
  });
});
