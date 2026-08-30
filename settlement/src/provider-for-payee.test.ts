import { describe, expect, it } from 'vitest';
import { LnbitsInvoiceProvider } from './lnbits-provider.js';
import { Lud16InvoiceProvider } from './lud16-provider.js';
import { payoutMethodForPayee, providerForPayee } from './provider-for-payee.js';

describe('payoutMethodForPayee', () => {
  it('prefers lnbits over a lightning address when both are present', () => {
    expect(payoutMethodForPayee({ lightningAddress: 'a@b.com', lnbits: { apiKey: 'k' } })).toBe(
      'lnbits',
    );
  });

  it('falls back to lnurl when only a lightning address is present', () => {
    expect(payoutMethodForPayee({ lightningAddress: 'a@b.com' })).toBe('lnurl');
  });

  it('falls back to manual when neither is present', () => {
    expect(payoutMethodForPayee({})).toBe('manual');
  });
});

describe('providerForPayee', () => {
  it('returns an LnbitsInvoiceProvider when lnbits credentials are linked', () => {
    const provider = providerForPayee({ lnbits: { apiKey: 'k' } });
    expect(provider).toBeInstanceOf(LnbitsInvoiceProvider);
  });

  it('returns a Lud16InvoiceProvider when only a lightning address is linked', () => {
    const provider = providerForPayee({ lightningAddress: 'a@b.com' });
    expect(provider).toBeInstanceOf(Lud16InvoiceProvider);
  });

  it('returns null when nothing is linked', () => {
    expect(providerForPayee({})).toBeNull();
  });
});
