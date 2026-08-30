import type { TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import type { LobbyPlayer, ServerSettlementMessage } from '@lightning-poker/shared';
import { create } from 'zustand';

export interface LobbyState {
  readonly players: readonly LobbyPlayer[];
  readonly maxSeats: number;
  /** True whenever any bot is seated — no real stakes are implied or enforced. */
  readonly practiceMode: boolean;
}

export interface ChatLogEntry {
  readonly playerId: string;
  readonly nickname: string;
  readonly text: string;
  readonly sentAt: number;
}

export interface PlayerDirectoryEntry {
  readonly nickname: string;
  readonly isBot: boolean;
  readonly connected: boolean;
}

interface TableStoreState {
  readonly tableId: string | null;
  readonly playerId: string | null;
  readonly nickname: string | null;
  readonly snapshot: TexasHoldemSnapshot | null;
  readonly turnExpiresAt: number | null;
  readonly lobby: LobbyState | null;
  readonly hostPlayerId: string | null;
  readonly playerDirectory: Readonly<Record<string, PlayerDirectoryEntry>>;
  readonly chatLog: readonly ChatLogEntry[];
  readonly error: string | null;
  readonly wasKicked: boolean;
  readonly tableEnded: boolean;
  readonly settlement: ServerSettlementMessage | null;
  readonly settlementError: string | null;
  join(tableId: string, playerId: string, nickname: string): void;
  setSnapshot(snapshot: TexasHoldemSnapshot | null, turnExpiresAt: number | null): void;
  setLobby(lobby: LobbyState, hostPlayerId: string): void;
  addChatMessage(entry: ChatLogEntry): void;
  setError(message: string): void;
  setKicked(): void;
  setTableEnded(): void;
  setSettlement(message: ServerSettlementMessage): void;
  setSettlementError(message: string): void;
  reset(): void;
}

const EMPTY_STATE = {
  tableId: null,
  playerId: null,
  nickname: null,
  snapshot: null,
  turnExpiresAt: null,
  lobby: null,
  hostPlayerId: null,
  playerDirectory: {},
  chatLog: [],
  error: null,
  wasKicked: false,
  tableEnded: false,
  settlement: null,
  settlementError: null,
} as const;

export const useTableStore = create<TableStoreState>((set) => ({
  ...EMPTY_STATE,
  join: (tableId, playerId, nickname) => set({ ...EMPTY_STATE, tableId, playerId, nickname }),
  setSnapshot: (snapshot, turnExpiresAt) => set({ snapshot, turnExpiresAt, error: null }),
  setLobby: (lobby, hostPlayerId) =>
    set((state) => ({
      lobby,
      hostPlayerId,
      error: null,
      playerDirectory: {
        ...state.playerDirectory,
        ...Object.fromEntries(
          lobby.players.map((player) => [
            player.playerId,
            { nickname: player.nickname, isBot: player.isBot, connected: player.connected },
          ]),
        ),
      },
    })),
  addChatMessage: (entry) => set((state) => ({ chatLog: [...state.chatLog, entry].slice(-100) })),
  setError: (message) => set({ error: message }),
  setKicked: () => set({ wasKicked: true }),
  setTableEnded: () => set({ tableEnded: true }),
  setSettlement: (message) => set({ settlement: message, settlementError: null }),
  setSettlementError: (message) => set({ settlementError: message }),
  reset: () => set({ ...EMPTY_STATE }),
}));
