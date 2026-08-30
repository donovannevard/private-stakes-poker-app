import type {
  ClientLnbitsSettings,
  ClientMessage,
  ServerChatMessage,
  ServerLobbyMessage,
  ServerMessage,
  ServerSettlementErrorMessage,
  ServerSettlementMessage,
} from '@lightning-poker/shared';

// Derived from whatever host served this page — see lib/api.ts.
const WS_BASE_URL = `ws://${window.location.hostname}:${import.meta.env.VITE_BACKEND_PORT ?? 3000}`;

export interface TableConnectionHandlers {
  onSnapshot(snapshot: unknown, turnExpiresAt: number | null): void;
  onLobby(message: ServerLobbyMessage): void;
  onChat(message: ServerChatMessage): void;
  onError(message: string): void;
  onSettlement(message: ServerSettlementMessage): void;
  onSettlementError(message: ServerSettlementErrorMessage): void;
  /** Fired once the socket is actually open — a good point to reset any reconnect backoff. */
  onOpen(): void;
  /** Fired only when the socket closes without `close()` having been called intentionally. */
  onDisconnect(): void;
  onKicked(): void;
  onTableEnded(): void;
}

export interface TableConnection {
  sendAction(action: unknown): void;
  sendChat(text: string): void;
  sendKick(playerId: string): void;
  sendComputeSettlement(): void;
  sendGenerateInvoice(transferId: string): void;
  sendMarkPaid(transferId: string): void;
  sendUpdateLightningSettings(
    lightningAddress: string | null | undefined,
    lnbits: ClientLnbitsSettings | null | undefined,
  ): void;
  leave(): void;
  cancelTable(): void;
  addBot(): void;
  close(): void;
}

export function connectToTable(
  tableId: string,
  handlers: TableConnectionHandlers,
): TableConnection {
  const socket = new WebSocket(`${WS_BASE_URL}/ws/tables/${tableId}`);
  let intentionalClose = false;

  socket.addEventListener('open', () => {
    handlers.onOpen();
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data as string) as ServerMessage;
    switch (message.type) {
      case 'snapshot':
        handlers.onSnapshot(message.snapshot, message.turnExpiresAt);
        break;
      case 'lobby':
        handlers.onLobby(message);
        break;
      case 'chat':
        handlers.onChat(message);
        break;
      case 'error':
        handlers.onError(message.message);
        break;
      case 'kicked':
        handlers.onKicked();
        break;
      case 'tableEnded':
        handlers.onTableEnded();
        break;
      case 'settlement':
        handlers.onSettlement(message);
        break;
      case 'settlementError':
        handlers.onSettlementError(message);
        break;
    }
  });

  socket.addEventListener('close', () => {
    if (!intentionalClose) {
      handlers.onDisconnect();
    }
  });

  function send(message: ClientMessage) {
    socket.send(JSON.stringify(message));
  }

  return {
    sendAction: (action) => send({ type: 'action', action }),
    sendChat: (text) => send({ type: 'chat', text }),
    sendKick: (playerId) => send({ type: 'kick', playerId }),
    sendComputeSettlement: () => send({ type: 'computeSettlement' }),
    sendGenerateInvoice: (transferId) => send({ type: 'generateSettlementInvoice', transferId }),
    sendMarkPaid: (transferId) => send({ type: 'markSettlementPaid', transferId }),
    sendUpdateLightningSettings: (lightningAddress, lnbits) =>
      send({ type: 'updateLightningSettings', lightningAddress, lnbits }),
    leave: () => send({ type: 'leave' }),
    cancelTable: () => send({ type: 'cancelTable' }),
    addBot: () => send({ type: 'addBot' }),
    close: () => {
      intentionalClose = true;
      socket.close();
    },
  };
}
