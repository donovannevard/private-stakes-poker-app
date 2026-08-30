import { describe, expect, it } from 'vitest';
import { LnbitsInvoiceProvider } from './lnbits-provider.js';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('LnbitsInvoiceProvider', () => {
  it('creates an invoice via the LNbits API using the given credentials', async () => {
    const calls: Array<{ url: string; init?: unknown }> = [];
    const fetchImpl = async (url: string, init?: unknown) => {
      calls.push({ url, init });
      return jsonResponse(200, { payment_hash: 'hash123', payment_request: 'lnbc1invoice' });
    };

    const provider = new LnbitsInvoiceProvider({ apiKey: 'key123' }, fetchImpl);
    const result = await provider.createInvoice(10, 'settling up');

    expect(result).toEqual({ bolt11: 'lnbc1invoice', paymentHash: 'hash123' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://legend.lnbits.com/api/v1/payments');
    expect(calls[0]!.init).toMatchObject({
      method: 'POST',
      headers: { 'X-Api-Key': 'key123' },
    });
  });

  it('uses a custom baseUrl when given, without a trailing slash', async () => {
    let usedUrl = '';
    const fetchImpl = async (url: string) => {
      usedUrl = url;
      return jsonResponse(200, { payment_hash: 'h', payment_request: 'pr' });
    };

    const provider = new LnbitsInvoiceProvider(
      { apiKey: 'key', baseUrl: 'https://my-instance.example.com/' },
      fetchImpl,
    );
    await provider.createInvoice(1, 'memo');

    expect(usedUrl).toBe('https://my-instance.example.com/api/v1/payments');
  });

  it('rejects a non-ok response from invoice creation', async () => {
    const provider = new LnbitsInvoiceProvider({ apiKey: 'key' }, async () =>
      jsonResponse(401, {}),
    );

    await expect(provider.createInvoice(1, 'memo')).rejects.toThrow('status 401');
  });

  it('checkPaid reports true once the LNbits API reports paid', async () => {
    const provider = new LnbitsInvoiceProvider({ apiKey: 'key' }, async () =>
      jsonResponse(200, { paid: true }),
    );

    await expect(provider.checkPaid('hash123')).resolves.toBe(true);
  });

  it('checkPaid reports false while unpaid', async () => {
    const provider = new LnbitsInvoiceProvider({ apiKey: 'key' }, async () =>
      jsonResponse(200, { paid: false }),
    );

    await expect(provider.checkPaid('hash123')).resolves.toBe(false);
  });
});
