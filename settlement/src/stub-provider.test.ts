import { describe, expect, it } from 'vitest';
import { StubInvoiceProvider } from './stub-provider.js';

describe('StubInvoiceProvider', () => {
  it('returns a deterministic fake invoice with no paymentHash by default', async () => {
    const provider = new StubInvoiceProvider();
    const result = await provider.createInvoice(42, 'memo');

    expect(result).toEqual({ bolt11: 'lnbcstub42stub', paymentHash: undefined });
  });

  it('includes a paymentHash when configured to support paid checks', async () => {
    const provider = new StubInvoiceProvider(true);
    const result = await provider.createInvoice(42, 'memo');

    expect(result.paymentHash).toBe('stub-hash-42');
  });

  it('reports unpaid until markPaidForTesting is called', async () => {
    const provider = new StubInvoiceProvider(true);

    await expect(provider.checkPaid()).resolves.toBe(false);
    provider.markPaidForTesting();
    await expect(provider.checkPaid()).resolves.toBe(true);
  });
});
