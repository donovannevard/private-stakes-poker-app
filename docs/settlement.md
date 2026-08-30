# Settlement & Lightning Payments

How players settle up after playing — computed by the app, paid directly between players,
never touching the app itself. See `brief.md`'s "Settlement (Non-Custodial)" section for the
non-negotiable constraint this is built against: the app never holds, deposits, or transmits
funds.

## How it works

1. **Net position** (`settlement/src/net-position.ts`): each player's `stack - startingStack`
   for the whole session so far — already tracked by the game, no new bookkeeping needed.
2. **Debt netting** (`settlement/src/transfers.ts`): the net positions are resolved into the
   _minimum_ set of pairwise transfers (who pays whom, how much) via a greedy
   largest-debtor-vs-largest-creditor match — the same approach tools like Splitwise use. Not
   provably minimal in the general case, but at this app's max table size (8 seats) the worst
   case is one avoidable extra transfer, which isn't worth an exact solver.
3. **Invoicing** (`settlement/src/*-provider.ts`): for each transfer, the _payee's_ registered
   Lightning method resolves into a real, payable BOLT11 invoice:
   - **Lightning Address** (`Lud16InvoiceProvider`) — the `user@domain.com` identifier almost
     every modern wallet already provides. Resolves via the public LNURL-pay (LUD-16) HTTP
     convention — no signup, no credentials, works with any wallet that has one. Can't confirm
     payment (LNURL has no mechanism for that), so these settle on the honor system: "Mark as
     paid" is a self-report, unenforced, per brief.md.
   - **LNbits** (`LnbitsInvoiceProvider`) — optional, per-player. A player who wants automatic
     "paid ✓" confirmation instead of a manual mark can link a free, instant-signup LNbits
     account (e.g. legend.lnbits.com) — not a node, no channel/liquidity management. The backend
     polls payment status every 4s (capped at ~15 minutes) and confirms automatically the moment
     it's paid.
   - **Manual** — no Lightning method registered at all. Just the amount and a manual "Mark as
     paid" button.
4. **Departed players**: a player's final net position is snapshotted the moment they leave
   (`table-manager.ts`'s `snapshotDeparted`) — otherwise settlement would silently lose anyone
   who already left before the table settled up.

Nobody is required to run anything. A table with zero linked Lightning info still gets a
correct running tally and manual settlement; each optional method layers on top.

## What's persisted vs. not

- `lightningAddress` is **persisted** (`PersistedPlayer.lightningAddress`) — it's not a secret,
  like an email address.
- LNbits credentials are **never persisted** — only kept in memory for the table's lifetime.
  Postgres here exists solely for crash-recovery of live game state, not a permanent store, and
  an LNbits API key (especially if a player pastes their **Admin** key instead of their
  **Invoice/Read** key by mistake) is a real secret that shouldn't sit at rest. If the server
  restarts, a player just re-links it — no game state or money-tracking is lost.
- Settlement state itself (`Table.settlement`, computed transfers/invoices/paid flags) is
  in-memory only, same as chat and the action log.

## Manual verification checklist

Everything below except the last two items is exercised by the automated test suite
(`pnpm -r test`) with injected fakes — no real network calls. The last two genuinely need a
real external wallet identity and can't be automated:

- [x] Net position + debt-netting math, including the departed-player ledger — covered by
      `settlement/src/transfers.test.ts` and `backend/src/table-manager.test.ts`'s `settlement`
      describe block.
- [x] LUD-16 resolution logic against injected fixtures (happy path, wrong tag, out-of-range
      amount, non-200, missing invoice) — `settlement/src/lud16-provider.test.ts`.
- [x] LNbits invoice creation + payment polling against injected fixtures —
      `settlement/src/lnbits-provider.test.ts`, `backend/src/table-manager.test.ts`.
- [x] Authorization (`generateSettlementInvoice`/`markSettlementPaid` reject anyone not party to
      the transfer) — `backend/src/table-manager.test.ts`.
- [x] Live end-to-end backend check (this phase's manual pass): a real 2-player table played a
      full hand, `computeSettlement` correctly netted the result (including a player who'd
      already disconnected/left), `generateSettlementInvoice` made a **real** HTTP call to a
      registered address's `.well-known/lnurlp/` endpoint and surfaced the failure gracefully
      when it didn't resolve, and `markSettlementPaid` correctly updated and re-broadcast state.
- [ ] **Needs a real Lightning Address you control**: register it when creating/joining a table,
      have another player generate an invoice for a transfer owed to you, and confirm your own
      wallet shows a valid, payable invoice for the right amount when scanning the QR / opening
      the `lightning:` link.
- [ ] **Needs a real (free) LNbits account**: sign up at a public instance, link the
      Invoice/Read key (never the Admin key) via "Settle Up" → "Link Lightning info", have
      another player generate an invoice for a transfer owed to you, pay it from any wallet, and
      confirm the UI flips to "Paid ✓" automatically within a few seconds — no page reload,
      no manual click.
