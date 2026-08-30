import type { InvoiceProvider, InvoiceResult } from './invoice-provider.js';

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LnbitsCreateInvoiceResponse {
  readonly payment_hash?: string;
  readonly payment_request?: string;
}

interface LnbitsPaymentStatusResponse {
  readonly paid?: boolean;
}

export interface LnbitsCredentials {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://legend.lnbits.com';

/**
 * Creates real invoices via a player's own linked LNbits wallet (a free,
 * instant-signup hosted API — not a node, no channel/liquidity management)
 * and can confirm payment by polling, unlike Lightning Address resolution.
 * Entirely optional per player; only used when they've explicitly linked
 * credentials.
 */
export class LnbitsInvoiceProvider implements InvoiceProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly credentials: LnbitsCredentials,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = (credentials.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async createInvoice(amountSats: number, memo: string): Promise<InvoiceResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.credentials.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ out: false, amount: amountSats, memo }),
    });

    if (!response.ok) {
      throw new Error(`LNbits invoice creation failed with status ${response.status}`);
    }

    const data = (await response.json()) as LnbitsCreateInvoiceResponse;
    if (!data.payment_request || !data.payment_hash) {
      throw new Error('LNbits did not return a payment_request/payment_hash');
    }

    return { bolt11: data.payment_request, paymentHash: data.payment_hash };
  }

  async checkPaid(paymentHash: string): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/payments/${paymentHash}`, {
      method: 'GET',
      headers: { 'X-Api-Key': this.credentials.apiKey },
    });

    if (!response.ok) {
      throw new Error(`LNbits payment status check failed with status ${response.status}`);
    }

    const data = (await response.json()) as LnbitsPaymentStatusResponse;
    return data.paid === true;
  }
}
