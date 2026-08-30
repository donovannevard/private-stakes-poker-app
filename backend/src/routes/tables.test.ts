import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

describe('POST /api/tables', () => {
  it('creates a table, returns tableId/playerId, and sets a session cookie', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('tableId');
    expect(body).toHaveProperty('playerId');
    expect(response.cookies.some((c) => c.name === 'sessionId')).toBe(true);
  });

  it('rejects a missing nickname', async () => {
    const app = await buildServer();

    const response = await app.inject({ method: 'POST', url: '/api/tables', payload: {} });

    expect(response.statusCode).toBe(400);
  });

  it('creates a solo-vs-bot table when fillWithBot is set', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice', maxSeats: 2, fillWithBot: true },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('POST /api/tables/:tableId/join', () => {
  it('joins an existing table and sets a session cookie', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' },
    });
    const { tableId } = created.json();

    const response = await app.inject({
      method: 'POST',
      url: `/api/tables/${tableId}/join`,
      payload: { nickname: 'Bob' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tableId });
    expect(response.cookies.some((c) => c.name === 'sessionId')).toBe(true);
  });

  it('returns 404 for a table that does not exist', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables/does-not-exist/join',
      payload: { nickname: 'Bob' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 400 when the table is full', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice', maxSeats: 2 },
    });
    const { tableId } = created.json();
    await app.inject({
      method: 'POST',
      url: `/api/tables/${tableId}/join`,
      payload: { nickname: 'Bob' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/tables/${tableId}/join`,
      payload: { nickname: 'Carol' },
    });

    expect(response.statusCode).toBe(400);
  });
});
