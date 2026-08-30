import { describe, expect, it } from 'vitest';
import { buildServer } from './server';

describe('GET /health', () => {
  it('returns ok status', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('CORS', () => {
  it('allows the Vite dev server on any localhost/127.0.0.1/LAN-IP port, not just 5173', async () => {
    const app = await buildServer();

    for (const origin of [
      'http://localhost:5173',
      'http://localhost:5174', // e.g. when 5173 is already taken on the host
      'http://127.0.0.1:4000',
      'http://192.168.0.35:5173',
    ]) {
      const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('rejects an origin that is not localhost, 127.0.0.1, or a LAN IP', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
