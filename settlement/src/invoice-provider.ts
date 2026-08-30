export interface InvoiceResult {
  readonly bolt11: string;
  /** Only present when the issuer also supports paid-status polling (LNbits). */
  readonly paymentHash?: string;
  readonly expiresAt?: number;
}

/**
 * Abstracts how a payable Lightning invoice gets produced for a settlement
 * transfer, so different resolution strategies (Lightning Address, a linked
 * LNbits wallet, a no-op stub for tests) are swappable without touching game
 * or settlement-computation logic — per brief.md's "settlement layer should
 * be abstract" requirement.
 */
export interface InvoiceProvider {
  createInvoice(amountSats: number, memo: string): Promise<InvoiceResult>;
  /** Only implemented by providers capable of confirming payment. */
  checkPaid?(paymentHash: string): Promise<boolean>;
}
