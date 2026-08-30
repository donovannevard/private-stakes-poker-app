import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';
import { requestLeave } from '../table-manager.js';

describe('GET /api/session', () => {
  it('returns 401 when there is no session cookie', async () => {
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/api/session' });

    expect(response.statusCode).toBe(401);
  });

  it('returns the session for a valid, still-seated cookie', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice', maxSeats: 2, fillWithBot: true },
    });
    const { tableId, playerId } = created.json();
    const sessionCookie = created.cookies.find((c) => c.name === 'sessionId')!;

    const response = await app.inject({
      method: 'GET',
      url: '/api/session',
      cookies: { sessionId: sessionCookie.value },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tableId, playerId, nickname: 'Alice' });
  });

  it('returns 401 and clears the cookie once the player has left the table', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' }, // solo lobby: leave is applied immediately
    });
    const { tableId, playerId } = created.json();
    const sessionCookie = created.cookies.find((c) => c.name === 'sessionId')!;

    requestLeave(tableId, playerId);

    const response = await app.inject({
      method: 'GET',
      url: '/api/session',
      cookies: { sessionId: sessionCookie.value },
    });

    expect(response.statusCode).toBe(401);
    const cleared = response.cookies.find((c) => c.name === 'sessionId');
    expect(cleared?.value).toBe('');
  });
});
