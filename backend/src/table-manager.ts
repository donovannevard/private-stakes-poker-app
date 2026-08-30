import { randomUUID } from 'node:crypto';
import {
  createTexasHoldemModule,
  generateSeed,
  replayActions,
  type GameModule,
  type PlayerId,
  type SeatedPlayer,
  type TexasHoldemAction,
  type TexasHoldemState,
} from '@lightning-poker/game-engine';
import {
  clearCurrentHand,
  deleteTable as deletePersistedTable,
  loadAllTables,
  removePlayer as removePersistedPlayer,
  saveCurrentHand,
  saveHandHistory,
  upsertPlayer,
  upsertTableMeta,
  type PersistedPlayerData,
  type PersistedTableMeta,
} from '@lightning-poker/database';
import {
  computeNetPositions,
  computeTransfers,
  payoutMethodForPayee,
  providerForPayee,
  type InvoiceProvider,
  type InvoiceResult,
  type PayeeLightningSettings,
} from '@lightning-poker/settlement';
import type { ServerMessage, SettlementTransferView } from '@lightning-poker/shared';
import { chooseBotAction, DEFAULT_BOT_SKILL } from './bot/decision.js';

export interface Socket {
  send(data: string): void;
}

export interface RosterEntry {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly isBot: boolean;
  readonly joinOrder: number;
  stack: number;
  socket: Socket | null;
  connected: boolean;
  leaveRequested: boolean;
  /** Timed out or kicked — fold this player instantly whenever it's their turn. */
  forcedOut: boolean;
  handsPlayed: number;
  handsWon: number;
  handsFolded: number;
  /** Not a secret — persisted like any other roster field. */
  lightningAddress?: string;
  /** Optional, in-memory only — never persisted (see database/table-persistence.ts comments). */
  lnbits?: { apiKey: string; baseUrl?: string };
}

interface DepartedPlayer {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly netPosition: number;
  readonly lightningAddress?: string;
}

interface SettlementTransferState {
  readonly id: string;
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: number;
  payoutMethod: 'lnbits' | 'lnurl' | 'manual';
  invoice: InvoiceResult | null;
  paid: boolean;
}

interface TableSettlementState {
  readonly netPositions: Readonly<Record<PlayerId, number>>;
  readonly transfers: SettlementTransferState[];
}

export interface ChatEntry {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly text: string;
  readonly sentAt: number;
}

export interface Table {
  readonly id: string;
  readonly module: GameModule<TexasHoldemState, TexasHoldemAction>;
  readonly maxSeats: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  /** Seconds a connected human has to act before auto-fold; `null` = no limit. */
  readonly turnTimeoutSeconds: number | null;
  /** 0-100: how closely bots at this table follow the equity-optimal line vs. playing looser/noisier. */
  readonly botSkill: number;
  state: TexasHoldemState | null;
  roster: RosterEntry[];
  chat: ChatEntry[];
  nextHandScheduled: boolean;
  /** The action log for the *current* hand only — reset each deal, never accumulated. */
  actionLog: Array<{ playerId: PlayerId; action: TexasHoldemAction }>;
  /** The SeatedPlayer[] snapshot passed to createInitialState for the current hand. */
  handStartPlayers: SeatedPlayer[] | null;
  nextJoinOrder: number;
  /** Epoch ms the current human turn auto-folds at, or null if no timer is running. */
  turnExpiresAt: number | null;
  /**
   * Final net position of anyone who has already left, snapshotted at the
   * moment their RosterEntry is removed — otherwise settlement would
   * silently lose them the instant they depart. In-memory only.
   */
  departedPlayers: DepartedPlayer[];
  /** The last computed settlement, if anyone has requested one this session. In-memory only. */
  settlement: TableSettlementState | null;
}

const DEFAULT_SMALL_BLIND = 1;
const DEFAULT_BIG_BLIND = 2;
const DEFAULT_STARTING_STACK = 200;
const MIN_TURN_TIMEOUT_SECONDS = 10;
const MAX_TURN_TIMEOUT_SECONDS = 120;
const DEFAULT_MAX_SEATS = 6;
const MIN_SEATS = 2;
const MAX_SEATS = 8;
const MAX_CHAT_LENGTH = 280;
const MAX_CHAT_HISTORY = 100;

export const BOT_ACTION_DELAY_MS = 1000;
export const NEXT_HAND_DELAY_MS = 3000;
export const DISCONNECT_TIMEOUT_MS = 60000;

const tables = new Map<string, Table>();

// Fire-and-forget persistence calls must still land in the order they were
// issued — e.g. a table's row has to exist before its players' rows (foreign
// key), and a later hand snapshot must not be overtaken in flight by an
// earlier one. Each table gets its own promise chain so writes serialize
// without ever blocking the game loop that queues them.
const persistenceQueues = new Map<string, Promise<void>>();

function enqueuePersist(tableId: string, task: () => Promise<void>): void {
  const previous = persistenceQueues.get(tableId) ?? Promise.resolve();
  persistenceQueues.set(tableId, previous.then(task));
}

export interface CreateTableOptions {
  readonly nickname: string;
  readonly maxSeats?: number;
  /** How many bot seats to fill immediately (0 up to maxSeats - 1). */
  readonly botCount?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  readonly startingStack?: number;
  /** Seconds a connected human has to act before auto-fold; unset/null = no limit. */
  readonly turnTimeoutSeconds?: number | null;
  /** 0-100: how closely bots at this table follow the equity-optimal line vs. playing looser/noisier. */
  readonly botSkill?: number;
  readonly lightningAddress?: string;
}

export function createTable(options: CreateTableOptions): { tableId: string; playerId: string } {
  const tableId = randomUUID();
  const playerId = randomUUID();
  const maxSeats = Math.min(Math.max(options.maxSeats ?? DEFAULT_MAX_SEATS, MIN_SEATS), MAX_SEATS);
  const smallBlind = Math.max(options.smallBlind ?? DEFAULT_SMALL_BLIND, 1);
  const bigBlind = Math.max(options.bigBlind ?? DEFAULT_BIG_BLIND, smallBlind);
  const startingStack = Math.max(options.startingStack ?? DEFAULT_STARTING_STACK, bigBlind);
  const turnTimeoutSeconds =
    options.turnTimeoutSeconds == null
      ? null
      : Math.min(
          Math.max(options.turnTimeoutSeconds, MIN_TURN_TIMEOUT_SECONDS),
          MAX_TURN_TIMEOUT_SECONDS,
        );
  const botCount = Math.min(Math.max(options.botCount ?? 0, 0), maxSeats - 1);
  const botSkill = Math.min(Math.max(options.botSkill ?? DEFAULT_BOT_SKILL, 0), 100);

  const table: Table = {
    id: tableId,
    module: createTexasHoldemModule({ smallBlind, bigBlind }),
    maxSeats,
    smallBlind,
    bigBlind,
    startingStack,
    turnTimeoutSeconds,
    botSkill,
    state: null,
    roster: [
      makeRosterEntry(
        playerId,
        options.nickname,
        false,
        0,
        startingStack,
        options.lightningAddress,
      ),
    ],
    chat: [],
    nextHandScheduled: false,
    actionLog: [],
    handStartPlayers: null,
    nextJoinOrder: 1,
    turnExpiresAt: null,
    departedPlayers: [],
    settlement: null,
  };

  for (let i = 0; i < botCount; i++) {
    const nickname = botCount === 1 ? 'Bot' : `Bot ${i + 1}`;
    const botEntry = makeRosterEntry(
      randomUUID(),
      nickname,
      true,
      table.nextJoinOrder++,
      startingStack,
    );
    botEntry.connected = true;
    table.roster.push(botEntry);
  }

  tables.set(tableId, table);

  const meta = tableMeta(table);
  enqueuePersist(table.id, () => upsertTableMeta(meta));
  for (const entry of table.roster) {
    const data = playerData(entry);
    enqueuePersist(table.id, () => upsertPlayer(table.id, data));
  }

  tryStartHand(table);

  return { tableId, playerId };
}

export function joinTable(
  tableId: string,
  nickname: string,
  lightningAddress?: string,
): { playerId: string } | { error: string } {
  const table = tables.get(tableId);
  if (!table) {
    return { error: 'table not found' };
  }

  const activeCount = table.roster.filter((entry) => !entry.leaveRequested).length;
  if (activeCount >= table.maxSeats) {
    return { error: 'table is full' };
  }

  const playerId = randomUUID();
  const entry = makeRosterEntry(
    playerId,
    nickname,
    false,
    table.nextJoinOrder++,
    table.startingStack,
    lightningAddress,
  );
  table.roster.push(entry);
  const data = playerData(entry);
  enqueuePersist(table.id, () => upsertPlayer(table.id, data));

  tryStartHand(table);
  // Unconditional, in addition to whatever tryStartHand did: already-connected
  // sockets otherwise have no way to learn the new player's nickname, since a
  // dealt hand's snapshot carries player ids only, not nicknames.
  broadcastLobby(table);

  return { playerId };
}

/** Host-only: seats a bot in the next open seat, if there is one. */
export function addBot(tableId: string, requesterId: PlayerId): void {
  const table = tables.get(tableId);
  if (!table) {
    return;
  }

  const isHost = table.roster[0]?.playerId === requesterId;
  if (!isHost) {
    return;
  }

  const activeCount = table.roster.filter((entry) => !entry.leaveRequested).length;
  if (activeCount >= table.maxSeats) {
    return;
  }

  const entry = makeRosterEntry(
    randomUUID(),
    `Bot ${table.nextJoinOrder}`,
    true,
    table.nextJoinOrder++,
    table.startingStack,
  );
  entry.connected = true;
  table.roster.push(entry);
  enqueuePersist(table.id, () => upsertPlayer(table.id, playerData(entry)));

  tryStartHand(table);
  broadcastLobby(table);
}

export function requestLeave(tableId: string, playerId: PlayerId): void {
  const table = tables.get(tableId);
  const entry = table?.roster.find((r) => r.playerId === playerId);
  if (!table || !entry) {
    return;
  }

  if (table.state === null) {
    snapshotDeparted(table, entry);
    table.roster = table.roster.filter((r) => r.playerId !== playerId);
    enqueuePersist(table.id, () => removePersistedPlayer(table.id, playerId));
    maybeDeleteEmptyTable(table);
    tryStartHand(table);
    return;
  }

  // A hand is either in progress or just completed and about to transition —
  // either way, the single `afterStateChange` next-hand timer is what applies
  // roster removals, so we only flag intent here to avoid a double-deal race.
  entry.leaveRequested = true;
}

export function attachSocket(tableId: string, playerId: PlayerId, socket: Socket): void {
  const table = tables.get(tableId);
  const entry = table?.roster.find((r) => r.playerId === playerId);
  if (!table || !entry) {
    return;
  }

  entry.socket = socket;
  entry.connected = true;

  // Broadcast the roster to everyone (it's the only place nicknames/connection
  // status travel — game snapshots are intentionally game-agnostic and carry
  // player ids only) — this reaches the reconnector too, not just everyone
  // else who needs to see them un-dull.
  broadcastLobby(table);
  if (table.state) {
    sendSnapshot(table, entry);
  }
}

export function detachSocket(tableId: string, playerId: PlayerId): void {
  const table = tables.get(tableId);
  const entry = table?.roster.find((r) => r.playerId === playerId);
  if (!table || !entry) {
    return;
  }

  entry.socket = null;
  entry.connected = false;
  broadcastLobby(table); // dulled icon, immediately, for everyone still connected

  setTimeout(() => {
    if (entry.connected || entry.forcedOut) {
      return; // reconnected, or already handled (e.g. kicked) in the meantime
    }

    // The host never reconnected within the grace period — this is a
    // permanent departure, not a blip, so the table ends for everyone
    // rather than quietly handing the host label to the next player.
    if (table.roster[0]?.playerId === playerId) {
      endTable(table);
      return;
    }

    entry.forcedOut = true;
    entry.leaveRequested = true;
    broadcastLobby(table);

    if (getActingRosterEntry(table)?.playerId === playerId) {
      applyActionInternal(table, playerId, { type: 'fold' });
    }
  }, DISCONNECT_TIMEOUT_MS);
}

export function kickPlayer(tableId: string, requesterId: PlayerId, targetPlayerId: PlayerId): void {
  const table = tables.get(tableId);
  if (!table) {
    return;
  }

  const isHost = table.roster[0]?.playerId === requesterId;
  if (!isHost || requesterId === targetPlayerId) {
    return;
  }

  const target = table.roster.find((r) => r.playerId === targetPlayerId);
  if (!target) {
    return;
  }

  const kickedMessage: ServerMessage = { type: 'kicked' };
  target.socket?.send(JSON.stringify(kickedMessage));
  target.socket = null;
  target.connected = false;

  if (table.state === null) {
    snapshotDeparted(table, target);
    table.roster = table.roster.filter((r) => r.playerId !== targetPlayerId);
    enqueuePersist(table.id, () => removePersistedPlayer(table.id, targetPlayerId));
    maybeDeleteEmptyTable(table);
    tryStartHand(table);
    return;
  }

  target.forcedOut = true;
  target.leaveRequested = true;

  broadcastLobby(table);

  if (getActingRosterEntry(table)?.playerId === targetPlayerId) {
    applyActionInternal(table, targetPlayerId, { type: 'fold' });
  }
}

/**
 * Ends the table for everyone — the host is gone for good, either by
 * deliberately cancelling or by never reconnecting within the disconnect
 * grace period. Distinct from a normal leave/kick: nobody else gets to keep
 * playing afterward. Real-money tables get a final `settlement` broadcast
 * (computeSettlement already includes departed players, so it reflects the
 * whole session) before everyone is sent home.
 */
function endTable(table: Table): void {
  if (!table.roster.some((entry) => entry.isBot)) {
    computeSettlement(table.id, table.roster[0]!.playerId);
  }

  const ended: ServerMessage = { type: 'tableEnded' };
  for (const entry of table.roster) {
    entry.socket?.send(JSON.stringify(ended));
    entry.socket = null;
  }

  table.roster = [];
  tables.delete(table.id);
  enqueuePersist(table.id, () => deletePersistedTable(table.id));
  persistenceQueues.delete(table.id);
}

/** Host-only: ends the table for every seated player. See `endTable`. */
export function cancelTable(tableId: string, requesterId: PlayerId): void {
  const table = tables.get(tableId);
  if (!table) {
    return;
  }

  const isHost = table.roster[0]?.playerId === requesterId;
  if (!isHost) {
    return;
  }

  endTable(table);
}

export function handleClientAction(
  tableId: string,
  playerId: PlayerId,
  action: TexasHoldemAction,
): void {
  const table = tables.get(tableId);
  if (!table || !table.state) {
    return;
  }
  applyActionInternal(table, playerId, action);
}

export function sendChatMessage(tableId: string, playerId: PlayerId, text: string): void {
  const table = tables.get(tableId);
  const sender = table?.roster.find((r) => r.playerId === playerId);
  const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
  if (!table || !sender || trimmed.length === 0) {
    return;
  }

  const entry: ChatEntry = {
    playerId,
    nickname: sender.nickname,
    text: trimmed,
    sentAt: Date.now(),
  };
  table.chat.push(entry);
  if (table.chat.length > MAX_CHAT_HISTORY) {
    table.chat.shift();
  }

  const message: ServerMessage = { type: 'chat', ...entry };
  for (const rosterEntry of table.roster) {
    rosterEntry.socket?.send(JSON.stringify(message));
  }
}

export function getTable(tableId: string): Table | undefined {
  return tables.get(tableId);
}

export function findRosterEntry(tableId: string, playerId: PlayerId): RosterEntry | undefined {
  return tables.get(tableId)?.roster.find((entry) => entry.playerId === playerId);
}

/**
 * Rebuilds in-memory tables from whatever was persisted (crash recovery). A
 * no-op when persistence is disabled (`DATABASE_URL` unset) — `loadAllTables`
 * just returns an empty array in that case. Call once, before the server
 * starts accepting connections.
 */
export async function bootstrapFromDatabase(): Promise<void> {
  const persistedTables = await loadAllTables();

  for (const persisted of persistedTables) {
    const module = createTexasHoldemModule({
      smallBlind: persisted.smallBlind,
      bigBlind: persisted.bigBlind,
    });

    const roster: RosterEntry[] = persisted.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      isBot: player.isBot,
      joinOrder: player.joinOrder,
      stack: player.stack,
      socket: null,
      // Bots are always "present"; humans start disconnected until they
      // reconnect — nothing survives a process restart but the data itself.
      connected: player.isBot,
      leaveRequested: false,
      forcedOut: false,
      handsPlayed: player.handsPlayed,
      handsWon: player.handsWon,
      handsFolded: player.handsFolded,
      lightningAddress: player.lightningAddress ?? undefined,
    }));

    const table: Table = {
      id: persisted.id,
      module,
      maxSeats: persisted.maxSeats,
      smallBlind: persisted.smallBlind,
      bigBlind: persisted.bigBlind,
      startingStack: persisted.startingStack,
      turnTimeoutSeconds: persisted.turnTimeoutSeconds,
      botSkill: persisted.botSkill,
      state: null,
      roster,
      chat: [],
      nextHandScheduled: false,
      actionLog: [],
      handStartPlayers: null,
      nextJoinOrder: roster.reduce((max, entry) => Math.max(max, entry.joinOrder + 1), 0),
      turnExpiresAt: null,
      departedPlayers: [],
      settlement: null,
    };

    if (persisted.currentHand) {
      const seatedPlayers = persisted.currentHand.players as SeatedPlayer[];
      const actionLog = persisted.currentHand.actionLog as Array<{
        playerId: PlayerId;
        action: TexasHoldemAction;
      }>;
      // createInitialState derives a fresh hand's button from
      // `previousState.buttonIndex + 1` (mod player count) — replaying a
      // single hand in isolation needs a stand-in previousState with just
      // enough shape (buttonIndex only) to reproduce the persisted button
      // exactly, since we don't have the full prior hand's state to hand it.
      const priorButtonIndex =
        (persisted.buttonIndex - 1 + seatedPlayers.length) % seatedPlayers.length;
      const previousButtonState = { buttonIndex: priorButtonIndex } as TexasHoldemState;
      const replay = replayActions(
        module,
        seatedPlayers,
        persisted.currentHand.seed,
        actionLog,
        previousButtonState,
      );

      if (replay.ok) {
        table.state = replay.state;
        table.handStartPlayers = seatedPlayers;
        table.actionLog = actionLog;
      } else {
        console.error(
          `[table-manager] could not replay the in-progress hand for table ${table.id}: ${replay.error}`,
        );
      }
    }

    tables.set(table.id, table);

    if (table.state === null) {
      // No hand was in flight — deal one now if enough players are waiting
      // (tryStartHand handles snapshotting + afterStateChange itself).
      tryStartHand(table);
    } else {
      afterStateChange(table); // reschedules a pending bot turn, if the acting seat is one
    }
  }
}

function tableMeta(table: Table): PersistedTableMeta {
  return {
    id: table.id,
    gameType: table.module.gameType,
    maxSeats: table.maxSeats,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    startingStack: table.startingStack,
    turnTimeoutSeconds: table.turnTimeoutSeconds,
    botSkill: table.botSkill,
    buttonIndex: table.state?.buttonIndex ?? 0,
  };
}

function playerData(entry: RosterEntry): PersistedPlayerData {
  return {
    playerId: entry.playerId,
    nickname: entry.nickname,
    isBot: entry.isBot,
    stack: entry.stack,
    joinOrder: entry.joinOrder,
    handsPlayed: entry.handsPlayed,
    handsWon: entry.handsWon,
    handsFolded: entry.handsFolded,
    lightningAddress: entry.lightningAddress ?? null,
  };
}

/**
 * Captures a leaving player's final net position before their RosterEntry is
 * removed — without this, settlement would silently lose anyone who already
 * left. LNbits credentials deliberately do not carry over (see RosterEntry);
 * a departed player's incoming payments fall back to Lightning-Address
 * resolution if they'd linked one.
 */
function snapshotDeparted(table: Table, entry: RosterEntry): void {
  table.departedPlayers.push({
    playerId: entry.playerId,
    nickname: entry.nickname,
    netPosition: entry.stack - table.startingStack,
    lightningAddress: entry.lightningAddress,
  });
}

function maybeDeleteEmptyTable(table: Table): void {
  if (table.roster.length === 0) {
    tables.delete(table.id);
    enqueuePersist(table.id, () => deletePersistedTable(table.id));
    persistenceQueues.delete(table.id);
  }
}

function makeRosterEntry(
  playerId: PlayerId,
  nickname: string,
  isBot: boolean,
  joinOrder: number,
  startingStack: number,
  lightningAddress?: string,
): RosterEntry {
  return {
    playerId,
    nickname,
    isBot,
    joinOrder,
    stack: startingStack,
    socket: null,
    connected: false,
    leaveRequested: false,
    forcedOut: false,
    handsPlayed: 0,
    handsWon: 0,
    handsFolded: 0,
    lightningAddress,
  };
}

function tryStartHand(table: Table): void {
  if (table.nextHandScheduled) {
    return;
  }
  if (table.state !== null && !table.module.isRoundOver(table.state)) {
    return; // a hand is actively in progress; joins/leaves wait for it to finish
  }

  const activeRoster = table.roster.filter((entry) => !entry.leaveRequested);
  if (activeRoster.length < MIN_SEATS) {
    table.state = null;
    table.handStartPlayers = null;
    table.actionLog = [];
    enqueuePersist(table.id, () => clearCurrentHand(table.id));
    // Tell already-connected clients to drop their stale last-known hand —
    // sendSnapshot() no-ops once table.state is null, so without this a
    // client that had a hand cached would stay frozen on it instead of
    // falling back to the lobby view.
    const cleared: ServerMessage = { type: 'snapshot', snapshot: null, turnExpiresAt: null };
    for (const entry of table.roster) {
      entry.socket?.send(JSON.stringify(cleared));
    }
    broadcastLobby(table);
    return;
  }

  const seatedPlayers: SeatedPlayer[] = activeRoster.map((entry) => ({
    playerId: entry.playerId,
    stack: entry.stack,
  }));
  const previousState = table.state ?? undefined;

  table.state = table.module.createInitialState(seatedPlayers, generateSeed(), previousState);
  table.handStartPlayers = seatedPlayers;
  table.actionLog = [];

  const meta = tableMeta(table);
  const seed = table.state.seed;
  enqueuePersist(table.id, () => upsertTableMeta(meta));
  enqueuePersist(table.id, () =>
    saveCurrentHand(table.id, { seed, players: seatedPlayers, actionLog: [] }),
  );

  afterStateChange(table);
  broadcastSnapshots(table);
}

function afterStateChange(table: Table): void {
  const state = table.state;
  if (!state) {
    return;
  }

  if (table.module.isRoundOver(state)) {
    table.turnExpiresAt = null;
    syncRosterAfterHand(table);
    const meta = tableMeta(table);
    enqueuePersist(table.id, () => clearCurrentHand(table.id));
    enqueuePersist(table.id, () => upsertTableMeta(meta));
    enqueuePersist(table.id, () =>
      saveHandHistory({
        tableId: table.id,
        seed: state.seed,
        players: table.handStartPlayers ?? [],
        actionLog: table.actionLog,
        winners: state.winners,
        completedAt: new Date(),
      }),
    );

    table.nextHandScheduled = true;
    setTimeout(() => {
      table.nextHandScheduled = false;
      const leaving = table.roster.filter((entry) => entry.leaveRequested);
      table.roster = table.roster.filter((entry) => !entry.leaveRequested);
      for (const entry of leaving) {
        snapshotDeparted(table, entry);
        enqueuePersist(table.id, () => removePersistedPlayer(table.id, entry.playerId));
      }
      maybeDeleteEmptyTable(table);
      if (table.roster.length > 0) {
        tryStartHand(table);
      }
    }, NEXT_HAND_DELAY_MS);
    return;
  }

  const actingEntry = getActingRosterEntry(table);
  if (actingEntry?.isBot) {
    table.turnExpiresAt = null;
    setTimeout(() => runBotTurn(table), BOT_ACTION_DELAY_MS);
  } else if (actingEntry?.forcedOut) {
    // Already timed out or kicked earlier (possibly while it wasn't their
    // turn yet) — fold instantly now rather than waiting for anything.
    table.turnExpiresAt = null;
    applyActionInternal(table, actingEntry.playerId, { type: 'fold' });
  } else if (actingEntry && table.turnTimeoutSeconds !== null) {
    scheduleTurnTimeout(table, actingEntry.playerId, table.turnTimeoutSeconds);
  } else {
    table.turnExpiresAt = null;
  }
}

/**
 * Auto-folds a connected human who hasn't acted in time — distinct from the
 * disconnect timeout: this only forfeits the current hand, it never sets
 * `forcedOut`/`leaveRequested`. Self-guards against staleness the same way
 * the bot-turn/disconnect timers do, but also compares the captured deadline
 * (not just player identity) since the same player can be back on the clock
 * again later in the same hand.
 */
function scheduleTurnTimeout(table: Table, playerId: PlayerId, turnTimeoutSeconds: number): void {
  const expiresAt = Date.now() + turnTimeoutSeconds * 1000;
  table.turnExpiresAt = expiresAt;

  setTimeout(() => {
    if (table.turnExpiresAt !== expiresAt) {
      return; // superseded by a newer turn before this one fired
    }
    if (getActingRosterEntry(table)?.playerId !== playerId) {
      return;
    }
    applyActionInternal(table, playerId, { type: 'fold' });
  }, turnTimeoutSeconds * 1000);
}

function runBotTurn(table: Table): void {
  if (!table.state || table.module.isRoundOver(table.state)) {
    return;
  }

  const actingEntry = getActingRosterEntry(table);
  if (!actingEntry?.isBot) {
    return;
  }

  const action = chooseBotAction({
    state: table.state,
    actingIndex: table.state.actingIndex!,
    actionLog: table.actionLog,
    skill: table.botSkill,
  });
  applyActionInternal(table, actingEntry.playerId, action);
}

function applyActionInternal(table: Table, playerId: PlayerId, action: TexasHoldemAction): void {
  const result = table.module.applyAction(table.state!, playerId, action);
  if (!result.ok) {
    const entry = table.roster.find((r) => r.playerId === playerId);
    if (entry) {
      sendError(entry, result.error);
    }
    return;
  }

  table.state = result.state;
  table.actionLog.push({ playerId, action });

  if (table.handStartPlayers) {
    const seed = table.state.seed;
    const players = table.handStartPlayers;
    const actionLog = table.actionLog;
    enqueuePersist(table.id, () => saveCurrentHand(table.id, { seed, players, actionLog }));
  }

  afterStateChange(table);
  broadcastSnapshots(table);
}

function syncRosterAfterHand(table: Table): void {
  const state = table.state;
  if (!state) {
    return;
  }

  for (const entry of table.roster) {
    const player = state.players.find((p) => p.playerId === entry.playerId);
    if (!player) {
      continue;
    }

    entry.stack = player.stack + (state.potPayouts?.[entry.playerId] ?? 0);
    entry.handsPlayed += 1;
    if (state.winners?.includes(entry.playerId)) {
      entry.handsWon += 1;
    }
    if (player.status === 'folded') {
      entry.handsFolded += 1;
    }

    const data = playerData(entry);
    enqueuePersist(table.id, () => upsertPlayer(table.id, data));
  }
}

function getActingRosterEntry(table: Table): RosterEntry | undefined {
  const state = table.state;
  if (!state || state.actingIndex === null) {
    return undefined;
  }
  const playerId = state.players[state.actingIndex]!.playerId;
  return table.roster.find((r) => r.playerId === playerId);
}

function broadcastSnapshots(table: Table): void {
  for (const entry of table.roster) {
    sendSnapshot(table, entry);
  }
}

function sendSnapshot(table: Table, entry: RosterEntry): void {
  if (!entry.socket || !table.state) {
    return;
  }
  const snapshot = table.module.getSnapshot(table.state, entry.playerId);
  const message: ServerMessage = { type: 'snapshot', snapshot, turnExpiresAt: table.turnExpiresAt };
  entry.socket.send(JSON.stringify(message));
}

function broadcastLobby(table: Table): void {
  for (const entry of table.roster) {
    sendLobby(table, entry);
  }
}

function sendLobby(table: Table, entry: RosterEntry): void {
  if (!entry.socket) {
    return;
  }
  const message: ServerMessage = {
    type: 'lobby',
    players: table.roster.map((r) => ({
      playerId: r.playerId,
      nickname: r.nickname,
      isBot: r.isBot,
      connected: r.connected,
    })),
    maxSeats: table.maxSeats,
    hostPlayerId: table.roster[0]!.playerId,
    practiceMode: table.roster.some((r) => r.isBot),
  };
  entry.socket.send(JSON.stringify(message));
}

function sendError(entry: RosterEntry, error: string): void {
  if (!entry.socket) {
    return;
  }
  const message: ServerMessage = { type: 'error', message: error };
  entry.socket.send(JSON.stringify(message));
}

const SETTLEMENT_POLL_INTERVAL_MS = 4000;
const SETTLEMENT_POLL_MAX_ATTEMPTS = 225; // ~15 minutes at 4s each

function lightningSettingsFor(table: Table, playerId: PlayerId): PayeeLightningSettings {
  const entry = table.roster.find((r) => r.playerId === playerId);
  if (entry) {
    return { lightningAddress: entry.lightningAddress, lnbits: entry.lnbits };
  }
  const departed = table.departedPlayers.find((d) => d.playerId === playerId);
  return { lightningAddress: departed?.lightningAddress };
}

/**
 * Computes (or recomputes) the current settlement: net positions plus the
 * minimal set of pairwise transfers, over everyone still seated *and* anyone
 * who already left this session (see `departedPlayers`). Read-only/derived —
 * callable by anyone connected, since it creates no new information, just
 * surfaces what's already implied by current stacks.
 */
export function computeSettlement(tableId: string, requesterId: PlayerId): void {
  const table = tables.get(tableId);
  if (!table) {
    return;
  }

  if (table.roster.some((r) => r.isBot)) {
    sendSettlementError(
      table,
      requesterId,
      undefined,
      'settlement is not available for practice tables',
    );
    return;
  }

  const combinedRoster = [
    ...table.roster.map((entry) => ({ playerId: entry.playerId, stack: entry.stack })),
    ...table.departedPlayers.map((departed) => ({
      playerId: departed.playerId,
      stack: table.startingStack + departed.netPosition,
    })),
  ];
  const netPositions = computeNetPositions(combinedRoster, table.startingStack);
  const result = computeTransfers(netPositions);
  if (!result.ok) {
    console.error(
      `[table-manager] settlement computation failed for table ${table.id}: ${result.error}`,
    );
    sendSettlementError(table, requesterId, undefined, result.error);
    return;
  }

  const previousTransfers = new Map(table.settlement?.transfers.map((t) => [t.id, t]) ?? []);
  const transfers: SettlementTransferState[] = result.transfers.map((transfer) => {
    const existing = previousTransfers.get(transfer.id);
    return {
      id: transfer.id,
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
      payoutMethod: payoutMethodForPayee(lightningSettingsFor(table, transfer.to)),
      invoice: existing?.invoice ?? null,
      paid: existing?.paid ?? false,
    };
  });

  table.settlement = { netPositions, transfers };
  broadcastSettlement(table);
}

/**
 * Generates a real invoice for one transfer, on demand (not eagerly for
 * every transfer — invoices expire, no point creating ones nobody's about
 * to pay). Only the payer or payee may trigger this for their own transfer.
 */
export async function generateSettlementInvoice(
  tableId: string,
  requesterId: PlayerId,
  transferId: string,
  // Injectable so tests never make a real network call — production callers
  // (ws.ts) never pass this, defaulting to the real resolver.
  resolveProvider: (settings: PayeeLightningSettings) => InvoiceProvider | null = providerForPayee,
): Promise<void> {
  const table = tables.get(tableId);
  const transfer = table?.settlement?.transfers.find((t) => t.id === transferId);
  if (!table || !transfer) {
    return;
  }

  if (transfer.from !== requesterId && transfer.to !== requesterId) {
    sendSettlementError(table, requesterId, transferId, 'not authorized for this transfer');
    return;
  }

  const provider = resolveProvider(lightningSettingsFor(table, transfer.to));
  if (!provider) {
    sendSettlementError(
      table,
      requesterId,
      transferId,
      'no Lightning method registered for the recipient',
    );
    return;
  }

  try {
    const memo = `Lightning Poker settlement: ${transfer.amount} sats`;
    const invoice = await provider.createInvoice(transfer.amount, memo);
    transfer.invoice = invoice;
    broadcastSettlement(table);

    if (provider.checkPaid && invoice.paymentHash) {
      schedulePaymentPolling(table, transferId, provider, invoice.paymentHash);
    }
  } catch (error) {
    sendSettlementError(
      table,
      requesterId,
      transferId,
      error instanceof Error ? error.message : 'failed to generate invoice',
    );
  }
}

function schedulePaymentPolling(
  table: Table,
  transferId: string,
  provider: InvoiceProvider,
  paymentHash: string,
  attempt = 0,
): void {
  if (attempt >= SETTLEMENT_POLL_MAX_ATTEMPTS) {
    return;
  }

  setTimeout(() => {
    const transfer = table.settlement?.transfers.find((t) => t.id === transferId);
    if (!transfer || transfer.paid || transfer.invoice?.paymentHash !== paymentHash) {
      return; // settlement recomputed, invoice replaced, or already paid — stop polling
    }

    provider.checkPaid!(paymentHash)
      .then((paid) => {
        if (paid) {
          transfer.paid = true;
          broadcastSettlement(table);
          return;
        }
        schedulePaymentPolling(table, transferId, provider, paymentHash, attempt + 1);
      })
      .catch((error: unknown) => {
        console.error(`[table-manager] LNbits payment check failed for table ${table.id}:`, error);
        schedulePaymentPolling(table, transferId, provider, paymentHash, attempt + 1);
      });
  }, SETTLEMENT_POLL_INTERVAL_MS);
}

/** Self-reported, unenforced — the app never verifies a real payment happened. */
export function markSettlementPaid(
  tableId: string,
  requesterId: PlayerId,
  transferId: string,
): void {
  const table = tables.get(tableId);
  const transfer = table?.settlement?.transfers.find((t) => t.id === transferId);
  if (!table || !transfer) {
    return;
  }

  if (transfer.from !== requesterId && transfer.to !== requesterId) {
    sendSettlementError(table, requesterId, transferId, 'not authorized for this transfer');
    return;
  }

  transfer.paid = true;
  broadcastSettlement(table);
}

export interface LightningSettingsUpdate {
  /** `null` clears a previously registered address. */
  readonly lightningAddress?: string | null;
  /** `null` clears previously linked LNbits credentials. */
  readonly lnbits?: { apiKey: string; baseUrl?: string } | null;
}

export function updateLightningSettings(
  tableId: string,
  playerId: PlayerId,
  update: LightningSettingsUpdate,
): void {
  const table = tables.get(tableId);
  const entry = table?.roster.find((r) => r.playerId === playerId);
  if (!table || !entry) {
    return;
  }

  if (update.lightningAddress !== undefined) {
    entry.lightningAddress = update.lightningAddress ?? undefined;
    const data = playerData(entry);
    enqueuePersist(table.id, () => upsertPlayer(table.id, data));
  }
  if (update.lnbits !== undefined) {
    entry.lnbits = update.lnbits ?? undefined;
  }
}

function broadcastSettlement(table: Table): void {
  if (!table.settlement) {
    return;
  }
  const unit: 'sats' | 'chips' = table.roster.some((r) => r.isBot) ? 'chips' : 'sats';
  const message: ServerMessage = {
    type: 'settlement',
    netPositions: table.settlement.netPositions,
    transfers: table.settlement.transfers.map((transfer): SettlementTransferView => ({
      id: transfer.id,
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
      payoutMethod: transfer.payoutMethod,
      invoice: transfer.invoice
        ? { bolt11: transfer.invoice.bolt11, expiresAt: transfer.invoice.expiresAt }
        : undefined,
      paid: transfer.paid,
    })),
    unit,
  };
  for (const entry of table.roster) {
    entry.socket?.send(JSON.stringify(message));
  }
}

function sendSettlementError(
  table: Table,
  targetPlayerId: PlayerId,
  transferId: string | undefined,
  message: string,
): void {
  const entry = table.roster.find((r) => r.playerId === targetPlayerId);
  if (!entry?.socket) {
    return;
  }
  const errorMessage: ServerMessage = { type: 'settlementError', transferId, message };
  entry.socket.send(JSON.stringify(errorMessage));
}
