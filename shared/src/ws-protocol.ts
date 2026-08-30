/**
 * WebSocket envelope shared by every game. Game-specific payloads (`action`,
 * `snapshot`) are `unknown` here on purpose — the transport layer never
 * interprets them, only whichever game module is registered for the table
 * does. See brief.md's "Game Module Architecture". Lobby/chat/leave are
 * table-management concerns, not game-specific, so they're fully typed here.
 */
export interface ClientActionMessage {
  readonly type: 'action';
  readonly action: unknown;
}

export interface ClientChatMessage {
  readonly type: 'chat';
  readonly text: string;
}

export interface ClientLeaveMessage {
  readonly type: 'leave';
}

/** Host-only: ends the table for every seated player (see ServerTableEndedMessage). */
export interface ClientCancelTableMessage {
  readonly type: 'cancelTable';
}

/** Host-only: seats a bot in the next open seat, if there is one. */
export interface ClientAddBotMessage {
  readonly type: 'addBot';
}

export interface ClientKickMessage {
  readonly type: 'kick';
  readonly playerId: string;
}

export interface ClientComputeSettlementMessage {
  readonly type: 'computeSettlement';
}

export interface ClientGenerateSettlementInvoiceMessage {
  readonly type: 'generateSettlementInvoice';
  readonly transferId: string;
}

export interface ClientMarkSettlementPaidMessage {
  readonly type: 'markSettlementPaid';
  readonly transferId: string;
}

export interface ClientLnbitsSettings {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export interface ClientUpdateLightningSettingsMessage {
  readonly type: 'updateLightningSettings';
  /** `null` clears a previously registered address. */
  readonly lightningAddress?: string | null;
  /** `null` clears previously linked LNbits credentials. */
  readonly lnbits?: ClientLnbitsSettings | null;
}

export type ClientMessage =
  | ClientActionMessage
  | ClientChatMessage
  | ClientLeaveMessage
  | ClientCancelTableMessage
  | ClientAddBotMessage
  | ClientKickMessage
  | ClientComputeSettlementMessage
  | ClientGenerateSettlementInvoiceMessage
  | ClientMarkSettlementPaidMessage
  | ClientUpdateLightningSettingsMessage;

export interface ServerSnapshotMessage {
  readonly type: 'snapshot';
  readonly snapshot: unknown;
  /**
   * Epoch ms the acting player's turn auto-folds at, or null if no timer is
   * running (bot's turn, no timeout configured, etc). Lives on the envelope
   * rather than inside `snapshot` — it's wall-clock/table-lifecycle data, not
   * game state, so it must stay out of anything that gets replayed.
   */
  readonly turnExpiresAt: number | null;
}

export interface ServerErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

export interface LobbyPlayer {
  readonly playerId: string;
  readonly nickname: string;
  readonly isBot: boolean;
  readonly connected: boolean;
}

export interface ServerLobbyMessage {
  readonly type: 'lobby';
  readonly players: readonly LobbyPlayer[];
  readonly maxSeats: number;
  /** Always the longest-seated player; migrates automatically if the host leaves. */
  readonly hostPlayerId: string;
  /** True whenever any bot is seated — no real stakes are implied or enforced. */
  readonly practiceMode: boolean;
}

export interface ServerChatMessage {
  readonly type: 'chat';
  readonly playerId: string;
  readonly nickname: string;
  readonly text: string;
  readonly sentAt: number;
}

export interface ServerKickedMessage {
  readonly type: 'kicked';
}

/**
 * Sent to every remaining player when the table ends because the host is
 * gone for good (deliberate cancel, or a disconnect that never reconnected
 * within the grace period) — distinct from `kicked`, which is a personal
 * removal by the host while the table keeps going. A `settlement` message
 * (if this wasn't a practice table) is broadcast immediately before this
 * one, so final balances are visible before the client navigates away.
 */
export interface ServerTableEndedMessage {
  readonly type: 'tableEnded';
}

export type SettlementPayoutMethod = 'lnbits' | 'lnurl' | 'manual';

export interface SettlementTransferView {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  readonly payoutMethod: SettlementPayoutMethod;
  readonly invoice?: { readonly bolt11: string; readonly expiresAt?: number };
  readonly paid: boolean;
}

export interface ServerSettlementMessage {
  readonly type: 'settlement';
  readonly netPositions: Readonly<Record<string, number>>;
  readonly transfers: readonly SettlementTransferView[];
  /** "chips" for practice-mode (any-bot) tables, "sats" otherwise. */
  readonly unit: 'sats' | 'chips';
}

export interface ServerSettlementErrorMessage {
  readonly type: 'settlementError';
  /** Absent when the error applies to the whole computation, not one transfer. */
  readonly transferId?: string;
  readonly message: string;
}

export type ServerMessage =
  | ServerSnapshotMessage
  | ServerErrorMessage
  | ServerLobbyMessage
  | ServerChatMessage
  | ServerKickedMessage
  | ServerTableEndedMessage
  | ServerSettlementMessage
  | ServerSettlementErrorMessage;
