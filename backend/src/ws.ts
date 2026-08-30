import type { TexasHoldemAction } from '@lightning-poker/game-engine';
import type { ServerMessage } from '@lightning-poker/shared';
import type { FastifyInstance } from 'fastify';
import { getSession } from './session.js';
import {
  addBot,
  attachSocket,
  cancelTable,
  computeSettlement,
  detachSocket,
  generateSettlementInvoice,
  getTable,
  handleClientAction,
  kickPlayer,
  markSettlementPaid,
  requestLeave,
  sendChatMessage,
  updateLightningSettings,
} from './table-manager.js';
import { parseClientMessage } from './ws-validation.js';

interface TableParams {
  tableId: string;
}

// Per-connection token bucket: caps inbound message frequency so a spammed
// socket can't hammer DB writes (each action persists) or chat broadcasts.
// Real gameplay pacing never comes close to this.
const RATE_LIMIT_MAX_MESSAGES = 30;
const RATE_LIMIT_WINDOW_MS = 10_000;

function createMessageLimiter(): () => boolean {
  let windowStart = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= RATE_LIMIT_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= RATE_LIMIT_MAX_MESSAGES;
  };
}

export async function registerWebSocketRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: TableParams }>(
    '/ws/tables/:tableId',
    { websocket: true },
    (socket, request) => {
      const { tableId } = request.params;
      const session = getSession(request);

      if (!session || session.tableId !== tableId || !getTable(tableId)) {
        const message: ServerMessage = { type: 'error', message: 'not authorized for this table' };
        socket.send(JSON.stringify(message));
        socket.close();
        return;
      }

      const { playerId } = session;
      attachSocket(tableId, playerId, socket);

      const allowMessage = createMessageLimiter();

      socket.on('message', (raw: Buffer) => {
        try {
          if (!allowMessage()) {
            return;
          }

          let rawParsed: unknown;
          try {
            rawParsed = JSON.parse(raw.toString());
          } catch {
            return;
          }

          const parsed = parseClientMessage(rawParsed);
          if (!parsed) {
            const message: ServerMessage = { type: 'error', message: 'malformed message' };
            socket.send(JSON.stringify(message));
            return;
          }

          switch (parsed.type) {
            case 'action':
              handleClientAction(tableId, playerId, parsed.action as TexasHoldemAction);
              break;
            case 'chat':
              sendChatMessage(tableId, playerId, parsed.text);
              break;
            case 'leave':
              requestLeave(tableId, playerId);
              break;
            case 'cancelTable':
              cancelTable(tableId, playerId);
              break;
            case 'addBot':
              addBot(tableId, playerId);
              break;
            case 'kick':
              kickPlayer(tableId, playerId, parsed.playerId);
              break;
            case 'computeSettlement':
              computeSettlement(tableId, playerId);
              break;
            case 'generateSettlementInvoice':
              void generateSettlementInvoice(tableId, playerId, parsed.transferId);
              break;
            case 'markSettlementPaid':
              markSettlementPaid(tableId, playerId, parsed.transferId);
              break;
            case 'updateLightningSettings':
              updateLightningSettings(tableId, playerId, {
                lightningAddress: parsed.lightningAddress,
                lnbits: parsed.lnbits,
              });
              break;
          }
        } catch (error) {
          // A handler bug must never take down every table's connection with it.
          console.error('[ws] error handling message:', error);
        }
      });

      socket.on('close', () => {
        detachSocket(tableId, playerId);
      });
    },
  );
}
