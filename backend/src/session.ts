import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE_NAME = 'sessionId';

export interface Session {
  readonly playerId: string;
  readonly tableId: string;
}

/**
 * The session is the cookie itself — {playerId, tableId} signed and stored
 * client-side, not looked up server-side. This is what makes a returning
 * player's session survive a server restart (crash recovery) with no
 * separate session store to lose or rehydrate.
 */
export function setSessionCookie(reply: FastifyReply, session: Session): void {
  reply.setCookie(SESSION_COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    signed: true,
  });
}

export function getSession(request: FastifyRequest): Session | null {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (!raw) {
    return null;
  }

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(unsigned.value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Session).playerId === 'string' &&
      typeof (parsed as Session).tableId === 'string'
    ) {
      return parsed as Session;
    }
  } catch {
    // fall through to null below
  }

  return null;
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
