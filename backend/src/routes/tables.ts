import type { FastifyInstance } from 'fastify';
import { setSessionCookie } from '../session.js';
import { createTable, joinTable } from '../table-manager.js';

const MAX_NICKNAME_LENGTH = 24;

interface CreateTableBody {
  nickname?: unknown;
  maxSeats?: unknown;
  botCount?: unknown;
  smallBlind?: unknown;
  bigBlind?: unknown;
  startingStack?: unknown;
  turnTimeoutSeconds?: unknown;
  botSkill?: unknown;
  lightningAddress?: unknown;
}

interface JoinTableBody {
  nickname?: unknown;
  lightningAddress?: unknown;
}

interface JoinTableParams {
  tableId: string;
}

function parseNickname(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().slice(0, MAX_NICKNAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Loose format check only — real validity is proven by resolving it at settlement time. */
function parseLightningAddress(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  const parts = trimmed.split('@');
  return parts.length === 2 && parts[0]!.length > 0 && parts[1]!.includes('.')
    ? trimmed
    : undefined;
}

export async function registerTableRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateTableBody }>('/api/tables', async (request, reply) => {
    const nickname = parseNickname(request.body.nickname);
    if (!nickname) {
      return reply.code(400).send({ error: 'nickname is required' });
    }

    const maxSeats = parseNumber(request.body.maxSeats);
    const botCount = parseNumber(request.body.botCount);
    const smallBlind = parseNumber(request.body.smallBlind);
    const bigBlind = parseNumber(request.body.bigBlind);
    const startingStack = parseNumber(request.body.startingStack);
    const turnTimeoutSeconds = parseNumber(request.body.turnTimeoutSeconds);
    const botSkill = parseNumber(request.body.botSkill);
    const lightningAddress = parseLightningAddress(request.body.lightningAddress);

    const { tableId, playerId } = createTable({
      nickname,
      maxSeats,
      botCount,
      smallBlind,
      bigBlind,
      startingStack,
      turnTimeoutSeconds,
      botSkill,
      lightningAddress,
    });
    setSessionCookie(reply, { playerId, tableId });

    return { tableId, playerId };
  });

  app.post<{ Body: JoinTableBody; Params: JoinTableParams }>(
    '/api/tables/:tableId/join',
    async (request, reply) => {
      const nickname = parseNickname(request.body.nickname);
      if (!nickname) {
        return reply.code(400).send({ error: 'nickname is required' });
      }

      const lightningAddress = parseLightningAddress(request.body.lightningAddress);
      const result = joinTable(request.params.tableId, nickname, lightningAddress);
      if ('error' in result) {
        const status = result.error === 'table not found' ? 404 : 400;
        return reply.code(status).send({ error: result.error });
      }

      setSessionCookie(reply, { playerId: result.playerId, tableId: request.params.tableId });
      return { tableId: request.params.tableId, playerId: result.playerId };
    },
  );
}
