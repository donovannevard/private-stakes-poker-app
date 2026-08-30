# Lightning Poker

Lightweight, open-source, self-hostable Texas Hold'em poker for low-stakes, informal games
among trusted players. See [`brief.md`](./brief.md) for the full project brief and
[`PHASES.md`](./PHASES.md) for the phased delivery roadmap.

## Status

Real-time multiplayer Texas Hold'em is playable end-to-end with configurable tables, a
solver-informed bot opponent, crash-recovery persistence, and Lightning settlement (net
position tracking, debt-netting, real invoices via Lightning Address or an optional linked
LNbits account). See [`PHASES.md`](./PHASES.md) for the phased delivery roadmap and
[`docs/settlement.md`](./docs/settlement.md) for how settlement works.

## Development

Requirements: Node.js 20+, pnpm 9+, Docker (for Postgres, and optionally the app itself — see
below).

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm test
```

Ports are fixed per-repo via [direnv](https://direnv.net) (`.envrc`, committed) so this app
never collides with other local projects: `BACKEND_PORT`/`PORT` (3031), `FRONTEND_PORT` (3032),
`POSTGRES_PORT` (5443). Run `direnv allow .` once after cloning. Without direnv active, backend,
frontend, and docker-compose all fall back to their original defaults (3000/5173/5432).

Postgres always needs to be running (crash-recovery persistence silently no-ops without it,
so the app still works without it, just without that safety net):

```bash
docker compose up -d postgres
```

### Option A: native dev servers

```bash
pnpm dev
```

Runs the backend (Fastify API + WebSocket, http://localhost:3031 with direnv active, else
:3000) and frontend (Vite, bound to the LAN so it's also reachable from another device like a
phone at `http://<this-machine's-LAN-IP>:3032`, else `:5173`) together in one foreground
process — **Ctrl+C stops both**. (Running them as two separate background commands works too,
but it's easy to lose track of one and leave it running — `pnpm dev` avoids that.)

### Option B: everything in Docker

```bash
docker compose up -d
docker compose logs -f backend frontend   # tail both
docker compose down                       # stop everything, cleanly
```

Builds and runs Postgres, the backend, and the frontend together. Source is bind-mounted for
hot reload (`tsx watch` / Vite HMR both work as normal); only `node_modules` is baked into the
image, so the containers always run Linux-native binaries (Prisma's engine, esbuild) regardless
of the host OS. `docker compose ps`/`down` make it easy to see and stop what's actually running
— use this if you'd rather not have Node dev processes running directly on your machine.

### Access gate (required once you're reachable outside your LAN)

Set `ACCESS_CODE` (a 6-digit code, e.g. `482913`) in `.env` and every browser has to enter it
once before reaching anything else — generate it yourself and share it with friends out-of-band
(text message, etc.). Backed by a strict rate limit on the code-check endpoint itself (5
attempts / 15 min per IP — the real defense, since it makes brute-forcing a 6-digit code
impractical) plus a more generous blanket rate limit over the rest of the API. Leave
`ACCESS_CODE` unset for local/LAN dev — the gate is a total no-op without it, exactly like
today.

## Workspace layout

| Package        | Purpose                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `frontend/`    | React + Vite + Tailwind client                                                    |
| `backend/`     | Fastify server, REST + WebSocket gameplay                                         |
| `shared/`      | Types and utilities shared across packages                                        |
| `game-engine/` | Deterministic, I/O-free poker engine                                              |
| `settlement/`  | Non-custodial settlement calculation + Lightning address resolution               |
| `database/`    | Postgres schema and data access (Prisma) — crash-recovery only, not a history log |
| `docs/`        | Project documentation                                                             |

## License

[MIT](./LICENSE)
