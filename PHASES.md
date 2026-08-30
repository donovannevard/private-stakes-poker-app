# Lightning Poker — Phased Roadmap

This document breaks `brief.md` into sequenced, demoable phases. Each phase has a goal,
key deliverables, the primary module(s) it touches, and a concrete "done when" criterion.
Phases are ordered so there's always something runnable/demoable at the end of it, rather
than one long build-up to a single big-bang integration.

Tooling decisions locked in for this roadmap: **pnpm workspaces** for the monorepo, and a
**non-custodial settlement model** — the app never holds or transmits funds. In-session
balances are informal points; at settlement time the app computes net amounts owed and
hands each player a Lightning payment request to pay one another directly. Real Lightning
address resolution is built behind an abstract interface, starting with a stub, so it never
blocks getting the game itself working.

---

## Phase 0 — Repo & tooling scaffold ✅ Done

**Goal:** An empty-but-wired monorepo that builds, lints, and tests green.

- pnpm workspace root (`pnpm-workspace.yaml`)
- Packages: `frontend/`, `backend/`, `shared/`, `game-engine/`, `settlement/`, `database/`, `docs/`
- Shared TypeScript config, ESLint + Prettier, Vitest wired at the workspace level
- Docker Compose with Postgres for local dev
- GitHub Actions CI: install, lint, typecheck, test on every push
- `git init` + initial commit

**Done when:** `pnpm install && pnpm -r build && pnpm -r test` succeeds on the empty skeleton, and CI is green on a pushed branch.

---

## Phase 1 — Game module contract + Texas Hold'em (`game-engine/`) ✅ Done

**Goal:** A generic, game-agnostic module contract, proven out by a fully tested, deterministic
Texas Hold'em implementation with zero I/O dependencies.

- `game-engine/src/core/`: the generic game-module contract — seat/turn lifecycle, action
  submission + validation, state snapshot (for clients/spectators/replay), deterministic replay
  from a recorded action log, end-of-game point deltas for the settlement layer
- `game-engine/src/games/texas-holdem/`: Texas Hold'em implemented against that contract —
  deck construction and cryptographically secure shuffle, hand evaluation (all standard ranks,
  correct tie-breaking), betting round state machine (fold/check/call/bet/raise, legality
  checks), dealer rotation, small/big blinds, side-pot calculation for all-in scenarios, winner
  determination and payout split
- A second, deliberately trivial stub game module implemented against the same contract in
  tests only, to prove the contract isn't accidentally poker-shaped

**Done when:** A full 2–8 player Texas Hold'em hand can be simulated headlessly in a test suite,
including multi-way all-ins with side pots, with correct pot distribution and high unit test
coverage — and the stub game module can be driven end-to-end through the same generic contract.

---

## Phase 2 — Playable in-memory vertical slice ✅ Done

**Goal:** The engine is playable end-to-end with fake chips, no persistence yet.

Delivered in three passes — a solo bot demo first to prove the vertical slice fastest, then
generalized into real multiplayer, then reconnection once phone testing surfaced the gap:

- Fastify backend: WebSocket channel for gameplay, REST for table create/join; table creation
  takes a game type and the backend drives whichever module is registered for it, through the
  Phase 1 generic contract only (no poker-specific code in the backend itself)
- WebSocket gameplay envelope carries a game-agnostic action payload (opaque to the transport
  layer, interpreted only by the selected game module), plus table-management concerns (chat,
  lobby roster, leave) that aren't game-specific
- In-memory table/session state; server-authoritative, driving the Phase 1 engine. A roster
  (who's joined, persists across hands) is tracked separately from the engine state (the
  current hand, or none while waiting for players) — a table waits in a lobby until ≥2 players
  are seated, and a mid-session joiner is dealt into the next hand rather than the current one
- Create a table (2–8 seats) and get a shareable invite link, or "Play vs Bot" for an instant
  solo demo against a weighted-random bot opponent
- Table chat, leave-between-hands (matches the brief's rule — disabled mid-hand), and a
  disconnected player is auto-folded after a grace period so one dropped connection can't
  stall the table for everyone else
- Session-cookie based reconnection: a refresh, backgrounded tab, or brief WebSocket drop
  resumes the same seat rather than dropping the player back to the home screen
- Dev servers configured for LAN access (not just localhost), so the app can be tested from a
  phone or another device on the same network
- React + Vite + Tailwind frontend: nickname join/create, table visualization, betting
  controls, chat, lobby view
- TanStack Query for REST state, Zustand for client game state

**Done when:** Two independent players (verified via two separate browser contexts, and
separately over a real phone on the LAN) can create/join the same table via a shareable link
and play a complete hand with fake chips, start to finish, including automatic progression to
the next hand and resuming a dropped connection mid-hand.

---

## Phase 3 — Persistence & identity (`database/`)

**Goal:** State survives restarts; hands are recorded and replayable from storage.

- Postgres schema via Prisma: players, tables, hands, actions
- Move table/session state from in-memory to DB-backed
- Hand history and audit log storage
- Deterministic replay served from stored logs (using Phase 1's replay support)

**Done when:** A server restart does not lose completed-hand history, and any stored hand
can be replayed to reproduce the same outcome.

---

## Phase 4 — Settlement layer, stub resolver (`settlement/`)

**Goal:** The full point-tracking → settlement-prompt flow works end-to-end without any real Lightning calls.

- Net settlement calculation: given per-player point deltas for a session, compute a minimal set of transfers (who pays whom, how much)
- Abstract `LightningAddressResolver` interface: turn a player's registered Lightning address into a payable request
- Stub/dev implementation of that interface (fake payable link, no network calls)
- Wire settlement prompts into backend + frontend UI: end-of-session summary, "you owe / you're owed" breakdown, per-player "pay now" action
- Self-reported "marked as paid" bookkeeping (unenforced, for players' own record-keeping)
- Idempotent settlement records so a repeated prompt or page reload never double-counts a settlement

**Done when:** At the end of a played session, each player sees a correct net settlement breakdown
and a "pay" prompt for what they owe, entirely through the UI, with no real money or network calls involved.

---

## Phase 5 — Fairness & security hardening

**Goal:** Close out the brief's fairness/security requirements as a dedicated pass.

- Input validation and rate limiting on all REST endpoints and WS messages
- Server re-validates every client action against authoritative state (never trusts client state)
- Shuffle audit trail structured to be commit-reveal-ready for future distributed shuffling
- Complete audit logging of every hand and action
- Basic anti-cheat checks (action timing, legality re-verification)

**Done when:** A security-focused test suite passes: invalid/out-of-turn actions are rejected,
duplicate settlement records are prevented, and replayed audit logs match recorded outcomes.

---

## Phase 6 — Real Lightning address resolution

**Goal:** Turn settlement prompts into real, payable Lightning requests without the app ever custodying funds.

- Real `LightningAddressResolver` implementation: resolve a player's registered Lightning address / LNURL-pay address into an actual invoice or `lightning:` payment URI
- QR code and deep-link generation so the payer's own wallet handles the actual payment
- Optional LNURL support
- Validated first against real Lightning addresses on testnet/regtest-friendly wallets before wider use

**Done when:** A player who owes sats can tap "pay" and land in their own Lightning wallet
with the correct amount and recipient pre-filled, using the same UI built in Phase 4 —
with the app never touching or holding the funds at any point.

---

## Phase 7 — Polish, docs, deployment

**Goal:** Ready for others to self-host and contribute.

- Full Docker Compose (frontend + backend + db) for one-command self-hosting
- CI extended to cover build/test/e2e on every PR
- Documentation: local development, deployment, API reference, architecture, game flow, settlement & Lightning payment requests, contribution guide
- End-to-end tests for join/play flows
- Mobile/responsive and accessibility pass on the UI

**Done when:** A fresh clone can be brought up with one documented command, and the docs
cover every area listed in the brief.

---

## Backlog / future roadmap (not scheduled)

Carried over from the brief as explicit out-of-scope-for-now items — architecture in the
phases above should avoid foreclosing these, but none are scheduled work yet:

- Tournament mode, Sit & Go tables
- Cash games with configurable blinds
- Spectator mode
- Player profiles, hand history browsing, statistics
- Multi-table support
- Additional poker variants (e.g. Omaha) as new game modules
- Other turn-based games (e.g. chess) via the same game-module architecture — long-term stretch goal, not near-term scope
- Federated/self-hosted server discovery
- Nostr-based authentication
- Community plugins
