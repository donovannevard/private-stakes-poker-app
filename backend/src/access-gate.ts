import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const ACCESS_COOKIE_NAME = 'accessGranted';
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

/**
 * A site-wide barrier, separate from the per-table `sessionId` cookie in
 * session.ts — that one identifies which seat at which table a browser
 * owns; this one just says "this browser knows the site's access code" and
 * has no notion of tables at all. A no-op whenever ACCESS_CODE isn't set,
 * so local/LAN dev never needs this — only a WAN-reachable deployment that
 * sets it turns the gate on.
 */
export function isGateEnabled(): boolean {
  return Boolean(process.env.ACCESS_CODE);
}

export function hasAccess(request: FastifyRequest): boolean {
  if (!isGateEnabled()) {
    return true;
  }

  const raw = request.cookies[ACCESS_COOKIE_NAME];
  if (!raw) {
    return false;
  }

  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value === 'true';
}

export function setAccessGrantedCookie(reply: FastifyReply): void {
  reply.setCookie(ACCESS_COOKIE_NAME, 'true', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    signed: true,
    maxAge: NINETY_DAYS_SECONDS,
  });
}

/**
 * Constant-time so a wrong guess can't be timed to leak how many leading
 * digits matched. `timingSafeEqual` throws on a length mismatch rather than
 * returning false, so that's checked first (this only leaks *length*, and
 * every valid code is the same length anyway).
 */
export function checkAccessCode(submitted: string): boolean {
  const expected = process.env.ACCESS_CODE ?? '';
  if (!expected || submitted.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
}
