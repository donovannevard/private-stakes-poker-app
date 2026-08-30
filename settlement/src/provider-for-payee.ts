import type { InvoiceProvider } from './invoice-provider.js';
import { LnbitsInvoiceProvider, type LnbitsCredentials } from './lnbits-provider.js';
import { Lud16InvoiceProvider } from './lud16-provider.js';

export interface PayeeLightningSettings {
  readonly lightningAddress?: string;
  readonly lnbits?: LnbitsCredentials;
}

export type PayoutMethod = 'lnbits' | 'lnurl' | 'manual';

export function payoutMethodForPayee(payee: PayeeLightningSettings): PayoutMethod {
  if (payee.lnbits) return 'lnbits';
  if (payee.lightningAddress) return 'lnurl';
  return 'manual';
}

/** `null` means no Lightning method is registered — manual settlement only. */
export function providerForPayee(payee: PayeeLightningSettings): InvoiceProvider | null {
  if (payee.lnbits) {
    return new LnbitsInvoiceProvider(payee.lnbits);
  }
  if (payee.lightningAddress) {
    return new Lud16InvoiceProvider(payee.lightningAddress);
  }
  return null;
}
