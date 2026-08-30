import type { ServerMessage } from '@lightning-poker/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from './server.js';

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function startServer(): Promise<{ app: FastifyInstance; port: number }> {
  const app = await buildServer();
  openApps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a bound TCP address');
  }
  return { app, port: address.port };
}

async function createTableAndGetCookie(
  app: FastifyInstance,
): Promise<{ tableId: string; sessionCookie: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/tables',
    payload: { nickname: 'Alice' },
  });
  const { tableId } = response.json() as { tableId: string };
  const cookie = response.cookies.find((c) => c.name === 'sessionId')!;
  return { tableId, sessionCookie: `${cookie.name}=${cookie.value}` };
}

function connect(port: number, tableId: string, cookie: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/tables/${tableId}`, {
      headers: { cookie },
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve(JSON.parse(data.toString()) as ServerMessage));
  });
}

describe('WS message handling', () => {
  it('responds with an error and stays usable after a malformed frame', async () => {
    const { app, port } = await startServer();
    const { tableId, sessionCookie } = await createTableAndGetCookie(app);
    const socket = await connect(port, tableId, sessionCookie);

    const malformedFrames = [
      { type: 'action', action: null },
      { type: 'action' },
      { type: 'chat', text: 123 },
      { type: 'kick', playerId: 42 },
      { type: 'nonsense' },
      null,
      42,
    ];

    for (const frame of malformedFrames) {
      const pending = nextMessage(socket);
      socket.send(JSON.stringify(frame));
      const response = await pending;
      expect(response).toEqual({ type: 'error', message: 'malformed message' });
    }

    // Invalid JSON is silently dropped (no response), and must not crash the
    // connection either — prove the socket is still alive by sending one
    // more (this time well-formed) message right after.
    socket.send('not json{{{');

    const pending = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'chat', text: 'still here' }));
    const response = await pending;
    expect(response).toMatchObject({ type: 'chat', text: 'still here' });

    socket.close();
  });

  it('caps inbound message frequency per connection', async () => {
    const { app, port } = await startServer();
    const { tableId, sessionCookie } = await createTableAndGetCookie(app);
    const socket = await connect(port, tableId, sessionCookie);

    const received: ServerMessage[] = [];
    socket.on('message', (data) => received.push(JSON.parse(data.toString()) as ServerMessage));

    const TOTAL_SENT = 35; // above the 30-per-window limit
    for (let i = 0; i < TOTAL_SENT; i++) {
      socket.send(JSON.stringify({ type: 'chat', text: `msg ${i}` }));
    }

    // Give the server a moment to process and broadcast everything it will.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const chatEchoes = received.filter((m) => m.type === 'chat');
    expect(chatEchoes.length).toBeLessThan(TOTAL_SENT);
    expect(chatEchoes.length).toBeLessThanOrEqual(30);

    socket.close();
  });
});
