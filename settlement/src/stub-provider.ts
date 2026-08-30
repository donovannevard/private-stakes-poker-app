import type { InvoiceProvider, InvoiceResult } from './invoice-provider.js';

/**
 * No network calls, deterministic fake values — used by every backend/
 * frontend test and local dev so nothing ever depends on a live wallet.
 */
export class StubInvoiceProvider implements InvoiceProvider {
  private paid = false;

  constructor(private readonly supportsPaidCheck: boolean = false) {}

  async createInvoice(amountSats: number, _memo: string): Promise<InvoiceResult> {
    return {
      bolt11: `lnbcstub${amountSats}stub`,
      paymentHash: this.supportsPaidCheck ? `stub-hash-${amountSats}` : undefined,
    };
  }

  async checkPaid(): Promise<boolean> {
    return this.paid;
  }

  /** Test helper — flips what the next `checkPaid` call returns. */
  markPaidForTesting(): void {
    this.paid = true;
  }
}
