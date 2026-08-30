import { describe, expect, it } from 'vitest';
import { Lud16InvoiceProvider } from './lud16-provider.js';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('Lud16InvoiceProvider', () => {
  it('resolves an address into a payable invoice via the LNURL-pay flow', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url === 'https://example.com/.well-known/lnurlp/alice') {
        return jsonResponse(200, {
          tag: 'payRequest',
          callback: 'https://example.com/lnurlp/cb/alice',
          minSendable: 1000,
          maxSendable: 100_000_000,
        });
      }
      if (url === 'https://example.com/lnurlp/cb/alice?amount=5000') {
        return jsonResponse(200, { pr: 'lnbc50u1invoice' });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const provider = new Lud16InvoiceProvider('alice@example.com', fetchImpl);
    const result = await provider.createInvoice(5, 'settling up');

    expect(result).toEqual({ bolt11: 'lnbc50u1invoice' });
    expect(calls).toEqual([
      'https://example.com/.well-known/lnurlp/alice',
      'https://example.com/lnurlp/cb/alice?amount=5000',
    ]);
  });

  it('appends a comment when the payee supports LUD-12 comments', async () => {
    let callbackUrl = '';
    const fetchImpl = async (url: string) => {
      if (url.includes('.well-known')) {
        return jsonResponse(200, {
          tag: 'payRequest',
          callback: 'https://example.com/cb',
          minSendable: 1000,
          maxSendable: 100_000_000,
          commentAllowed: 20,
        });
      }
      callbackUrl = url;
      return jsonResponse(200, { pr: 'lnbc1invoice' });
    };

    const provider = new Lud16InvoiceProvider('bob@example.com', fetchImpl);
    await provider.createInvoice(3, 'settling up after poker night');

    expect(callbackUrl).toContain('comment=settling%20up%20after%20po');
  });

  it('rejects an address without exactly one @', async () => {
    const provider = new Lud16InvoiceProvider('not-an-address', async () => {
      throw new Error('should not fetch');
    });

    await expect(provider.createInvoice(5, 'memo')).rejects.toThrow('invalid Lightning Address');
  });

  it('rejects a response that is not a valid payRequest', async () => {
    const provider = new Lud16InvoiceProvider('alice@example.com', async () =>
      jsonResponse(200, { tag: 'withdrawRequest' }),
    );

    await expect(provider.createInvoice(5, 'memo')).rejects.toThrow('valid LNURL payRequest');
  });

  it('rejects an amount outside the payable range', async () => {
    const provider = new Lud16InvoiceProvider('alice@example.com', async () =>
      jsonResponse(200, {
        tag: 'payRequest',
        callback: 'https://example.com/cb',
        minSendable: 1_000_000,
        maxSendable: 2_000_000,
      }),
    );

    await expect(provider.createInvoice(5, 'memo')).rejects.toThrow('outside');
  });

  it('rejects a non-ok HTTP response', async () => {
    const provider = new Lud16InvoiceProvider('alice@example.com', async () =>
      jsonResponse(404, {}),
    );

    await expect(provider.createInvoice(5, 'memo')).rejects.toThrow('status 404');
  });

  it('rejects a callback response with no invoice', async () => {
    const fetchImpl = async (url: string) =>
      url.includes('.well-known')
        ? jsonResponse(200, {
            tag: 'payRequest',
            callback: 'https://example.com/cb',
            minSendable: 1000,
            maxSendable: 100_000_000,
          })
        : jsonResponse(200, {});

    const provider = new Lud16InvoiceProvider('alice@example.com', fetchImpl);

    await expect(provider.createInvoice(5, 'memo')).rejects.toThrow('did not return an invoice');
  });
});
