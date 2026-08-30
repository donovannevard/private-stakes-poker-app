import type { TexasHoldemAction, TexasHoldemSnapshot } from '@lightning-poker/game-engine';
import type { ClientLnbitsSettings } from '@lightning-poker/shared';
import { useEffect, useRef } from 'react';
import { connectToTable, type TableConnection } from '../lib/socket';
import { useTableStore } from '../store/tableStore';

export interface TableConnectionActions {
  sendAction(action: TexasHoldemAction): void;
  sendChat(text: string): void;
  kickPlayer(playerId: string): void;
  computeSettlement(): void;
  generateSettlementInvoice(transferId: string): void;
  markSettlementPaid(transferId: string): void;
  updateLightningSettings(
    lightningAddress: string | null | undefined,
    lnbits: ClientLnbitsSettings | null | undefined,
  ): void;
  leaveTable(): void;
  cancelTable(): void;
  addBot(): void;
}

const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Opens the table WebSocket while `tableId` is set, and returns actions to
 * send over it. Reconnects a handful of times on an unexpected drop (screen
 * lock, network blip) — comfortably within the server's disconnect-timeout
 * grace period — rather than leaving the tab silently dead.
 */
export function useTableConnection(tableId: string | null): TableConnectionActions {
  const connectionRef = useRef<TableConnection | null>(null);
  const setSnapshot = useTableStore((state) => state.setSnapshot);
  const setLobby = useTableStore((state) => state.setLobby);
  const addChatMessage = useTableStore((state) => state.addChatMessage);
  const setError = useTableStore((state) => state.setError);
  const setKicked = useTableStore((state) => state.setKicked);
  const setTableEnded = useTableStore((state) => state.setTableEnded);
  const setSettlement = useTableStore((state) => state.setSettlement);
  const setSettlementError = useTableStore((state) => state.setSettlementError);

  useEffect(() => {
    if (!tableId) {
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    function connect() {
      if (!tableId) {
        return;
      }

      const connection = connectToTable(tableId, {
        onSnapshot: (snapshot, turnExpiresAt) =>
          setSnapshot(snapshot as TexasHoldemSnapshot | null, turnExpiresAt),
        onLobby: (lobby) => setLobby(lobby, lobby.hostPlayerId),
        onChat: (chat) =>
          addChatMessage({
            playerId: chat.playerId,
            nickname: chat.nickname,
            text: chat.text,
            sentAt: chat.sentAt,
          }),
        onError: (message) => setError(message),
        onKicked: () => setKicked(),
        onTableEnded: () => setTableEnded(),
        onSettlement: (message) => setSettlement(message),
        onSettlementError: (message) => setSettlementError(message.message),
        onOpen: () => {
          attempts = 0;
        },
        onDisconnect: () => {
          if (cancelled) {
            return;
          }
          if (attempts >= MAX_RECONNECT_ATTEMPTS) {
            setError('Lost connection to the table.');
            return;
          }
          attempts += 1;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        },
      });
      connectionRef.current = connection;
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [
    tableId,
    setSnapshot,
    setLobby,
    addChatMessage,
    setError,
    setKicked,
    setTableEnded,
    setSettlement,
    setSettlementError,
  ]);

  return {
    sendAction: (action) => connectionRef.current?.sendAction(action),
    sendChat: (text) => connectionRef.current?.sendChat(text),
    kickPlayer: (playerId) => connectionRef.current?.sendKick(playerId),
    computeSettlement: () => connectionRef.current?.sendComputeSettlement(),
    generateSettlementInvoice: (transferId) =>
      connectionRef.current?.sendGenerateInvoice(transferId),
    markSettlementPaid: (transferId) => connectionRef.current?.sendMarkPaid(transferId),
    updateLightningSettings: (lightningAddress, lnbits) =>
      connectionRef.current?.sendUpdateLightningSettings(lightningAddress, lnbits),
    leaveTable: () => connectionRef.current?.leave(),
    cancelTable: () => connectionRef.current?.cancelTable(),
    addBot: () => connectionRef.current?.addBot(),
  };
}
