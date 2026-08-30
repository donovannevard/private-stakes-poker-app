import type { InvoiceProvider, InvoiceResult } from './invoice-provider.js';

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LnurlPayMetadata {
  readonly tag?: string;
  readonly callback?: string;
  readonly minSendable?: number;
  readonly maxSendable?: number;
  /** LUD-12: max length of an optional `comment` the callback will accept, if any. */
  readonly commentAllowed?: number;
}

interface LnurlPayCallbackResponse {
  readonly pr?: string;
}

/**
 * Resolves a Lightning Address (LUD-16, the `user@domain.com` identifier
 * most modern Lightning wallets already provide) into a real, payable BOLT11
 * invoice. Needs zero infrastructure or credentials from the payee — this is
 * a public, unauthenticated HTTPS convention their own wallet already
 * exposes. Can't confirm payment (no `checkPaid`) — LNURL alone has no way
 * to report that back, which is exactly why unlinked settlements stay
 * self-reported.
 */
export class Lud16InvoiceProvider implements InvoiceProvider {
  constructor(
    private readonly lightningAddress: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async createInvoice(amountSats: number, memo: string): Promise<InvoiceResult> {
    const [localPart, domain] = this.lightningAddress.split('@');
    if (!localPart || !domain || this.lightningAddress.split('@').length !== 2) {
      throw new Error(`invalid Lightning Address: ${this.lightningAddress}`);
    }

    const metadata = await this.fetchJson<LnurlPayMetadata>(
      `https://${domain}/.well-known/lnurlp/${localPart}`,
    );

    if (metadata.tag !== 'payRequest' || !metadata.callback) {
      throw new Error(`${this.lightningAddress} did not return a valid LNURL payRequest`);
    }

    const amountMillisats = amountSats * 1000;
    if (
      metadata.minSendable !== undefined &&
      metadata.maxSendable !== undefined &&
      (amountMillisats < metadata.minSendable || amountMillisats > metadata.maxSendable)
    ) {
      throw new Error(`${amountSats} sats is outside ${this.lightningAddress}'s payable range`);
    }

    const separator = metadata.callback.includes('?') ? '&' : '?';
    let callbackUrl = `${metadata.callback}${separator}amount=${amountMillisats}`;
    if (metadata.commentAllowed && metadata.commentAllowed > 0) {
      const comment = memo.slice(0, metadata.commentAllowed);
      callbackUrl += `&comment=${encodeURIComponent(comment)}`;
    }

    const callbackResponse = await this.fetchJson<LnurlPayCallbackResponse>(callbackUrl);

    if (!callbackResponse.pr) {
      throw new Error(`${this.lightningAddress}'s LNURL callback did not return an invoice`);
    }

    return { bolt11: callbackResponse.pr };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`request to ${url} failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
