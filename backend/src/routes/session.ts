import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, getSession } from '../session.js';
import { findRosterEntry } from '../table-manager.js';

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/session', async (request, reply) => {
    const session = getSession(request);
    const entry = session ? findRosterEntry(session.tableId, session.playerId) : undefined;

    if (!session || !entry) {
      clearSessionCookie(reply);
      return reply.code(401).send({ error: 'no active session' });
    }

    return { tableId: session.tableId, playerId: session.playerId, nickname: entry.nickname };
  });
}
