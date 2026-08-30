# Project Brief: Lightning Poker

## Overview

Build a lightweight, modern, open-source online poker application that allows players to create and join poker tables for low-stakes, informal wagers among trusted players, settled directly between them over Bitcoin Lightning. The application itself never holds, deposits, or transmits funds — it tracks in-game balances only and helps players settle up with each other afterward, on the honor system.

The goal is to create a simple, enjoyable experience rather than a feature-heavy gambling platform. The application should prioritize clean architecture, maintainability, transparency, and an excellent user experience.

Texas Hold'em is the first game the platform supports, but the platform itself should not be hard-wired to poker. Table management, networking, and settlement should be built against a generic, pluggable game-module interface, so additional poker variants (Omaha, etc.) — and, much further down the line, entirely different turn-based games (e.g. chess) — can be added as self-contained modules without rewriting core platform code.

## Core Objectives

* Lightweight and fast
* Fully open source
* Self-hostable
* Modern, responsive UI
* Low operational complexity
* Lightning-native settlement (non-custodial — the app never holds funds)
* Fair and transparent game logic
* Modular, pluggable game architecture — new games are added as self-contained modules, not by changing platform code

## Core Features

### Player Experience

* Join with a nickname (minimal friction)
* Create public or private poker tables
* Join existing tables
* Sit down or leave at any time between hands
* Chat at the table
* View player balances and current pot
* Mobile-friendly interface

### Poker (First Game Module)

Initial implementation should support:

* Texas Hold'em No Limit
* 2–8 players
* Dealer rotation
* Small and big blinds
* Betting rounds
* Side pots
* Hand evaluation
* Winner determination
* Automatic next hand

Texas Hold'em is built as one implementation of the platform's generic game-module interface (see Game Module Architecture). Additional poker variants, and eventually non-poker games, should be addable as new modules without changing table management, networking, or settlement code.

## Game Module Architecture

The platform should not assume poker is the only game it will ever run. Table management, networking, and settlement code should depend only on a shared, generic **game module** contract — never on any specific game's rules.

A game module is responsible for:

* Seat/turn lifecycle (players joining, sitting, leaving, turn order)
* Accepting and validating game-specific player actions
* Producing a state snapshot for clients, spectators, and replay
* Deterministic replay from a recorded action log
* Producing end-of-game point deltas that feed the settlement layer, regardless of what game produced them

A table is created with a chosen game type, and only registered game modules can be selected. Texas Hold'em is the first module built against this contract; additional poker variants (Omaha, etc.) and, much further in the future, other turn-based games (e.g. chess) can be added as new modules implementing the same interface.

## Settlement (Non-Custodial)

Bitcoin Lightning is used only to help players settle up directly with each other after playing — the application never holds, deposits, or transmits funds. Balances during a session are informal points ("fake sats") tracking game outcomes; nobody deposits into or is owed by the app itself.

Requirements:

* Track a running in-game point balance per player for the session (not real money, no deposit step)
* Players may optionally register a personal Lightning address (LNURL-pay / lightning address) to receive settlements
* At the end of a hand, session, or when a player leaves, compute net settlement between players, minimizing the number of transfers where possible
* Present each player with what they owe (or are owed) and a one-tap way to pay the recipient directly, via a deep link or QR to the recipient's registered Lightning address
* Settlement is always optional and unenforced — a player may mark a settlement as paid for their own record-keeping, but the app cannot compel or verify payment
* Small denomination support (sats)
* Handle unresolved or failed settlement requests gracefully (there is no custody to reconcile, since none exists)

The settlement layer should be abstract so different ways of resolving a Lightning address into a payable request (LNURL-pay, lightning address, static QR, etc.) can be swapped without affecting game logic.

## Fairness

The game should be transparent and trustworthy.

Consider:

* Cryptographically secure shuffling
* Server-seeded randomness initially
* Architecture ready for commit-reveal or distributed shuffling later
* Full audit logs of completed hands
* Deterministic hand replay support

## Suggested Technical Stack

Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* TanStack Query
* Zustand (or equivalent lightweight state management)

Backend

* Node.js
* TypeScript
* Fastify
* WebSockets for live gameplay
* PostgreSQL
* Prisma ORM

Infrastructure

* Docker
* Docker Compose
* Environment-based configuration
* GitHub Actions CI

## Architecture

Structure the project into clear modules.

Example:

* frontend/
* backend/
* shared/
* game-engine/
* settlement/
* database/
* docs/

Concrete games should be isolated from networking and settlement code, and implemented behind the shared game-module interface so new games can be added without changing platform code. `game-engine/` holds the generic game-module contract and orchestration, plus each concrete game (Texas Hold'em first) as a self-contained module behind that contract.

Avoid tightly coupling components.

## Development Principles

* Strong TypeScript typing
* Small, reusable modules
* Clear interfaces
* Dependency injection where appropriate
* Comprehensive error handling
* Clean code over clever code
* Favor composition over inheritance
* New games are added as self-contained modules implementing the shared game-module interface — no changes to networking, table management, or settlement code

## User Interface

Aim for a polished but minimal aesthetic.

Design goals:

* Dark theme by default
* Poker table visualization
* Smooth card animations
* Responsive layout
* Accessible controls
* Clear betting controls
* Minimal clicks to join a game

Avoid excessive visual effects or unnecessary complexity.

## API Design

Prefer a clean separation between:

* Authentication
* Table management
* Gameplay
* Settlement
* Administration

Gameplay should primarily use WebSockets, while REST endpoints handle setup and account-related actions.

## Security

Implement:

* Input validation
* Rate limiting
* Secure session handling
* Server-authoritative game state
* Anti-cheat protections
* Validation of all client actions
* Idempotent, tamper-evident settlement records (no duplicate or double-counted settlements)

Never trust client-side state.

## Testing

Include:

* Unit tests for poker logic
* Integration tests for gameplay
* Hand evaluation tests
* Settlement calculation tests
* End-to-end tests for joining and playing

The poker engine should achieve high test coverage due to its deterministic nature.

## Documentation

Maintain documentation for:

* Local development
* Deployment
* API
* Architecture
* Game flow
* Settlement & Lightning payment requests
* Contribution guidelines

## Future Roadmap

Design the architecture to support future additions without major rewrites.

Potential future features include:

* Tournament mode
* Sit & Go tables
* Cash games with configurable blinds
* Spectator mode
* Player profiles
* Hand history
* Statistics
* Multi-table support
* Additional poker variants (e.g. Omaha) as new game modules
* Other turn-based games (e.g. chess) via the same game-module architecture — a long-term stretch goal, not near-term scope
* Federated/self-hosted server discovery
* Nostr-based authentication
* Community plugins

## Coding Expectations for Claude

When implementing this project:

* Produce production-quality code.
* Explain architectural decisions when introducing new abstractions.
* Keep files focused and reasonably sized.
* Avoid unnecessary dependencies.
* Favor readability over premature optimization.
* Write tests alongside new functionality where practical.
* Keep commits logically scoped.
* Document public APIs and complex algorithms.
* If multiple implementation approaches exist, choose the simplest solution that satisfies the current requirements while allowing future extensibility.
