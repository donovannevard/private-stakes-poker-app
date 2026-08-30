import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

const ORIGINAL_ACCESS_CODE = process.env.ACCESS_CODE;

afterEach(() => {
  if (ORIGINAL_ACCESS_CODE === undefined) {
    delete process.env.ACCESS_CODE;
  } else {
    process.env.ACCESS_CODE = ORIGINAL_ACCESS_CODE;
  }
});

describe('GET /api/access', () => {
  it('reports granted when ACCESS_CODE is unset', async () => {
    delete process.env.ACCESS_CODE;
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/api/access' });

    expect(response.json()).toEqual({ granted: true });
  });

  it('reports not granted with no cookie when ACCESS_CODE is set', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/api/access' });

    expect(response.json()).toEqual({ granted: false });
  });
});

describe('POST /api/access', () => {
  it('sets the cookie and grants access on the correct code', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/access',
      payload: { code: '123456' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ granted: true });
    expect(response.cookies.some((c) => c.name === 'accessGranted')).toBe(true);
  });

  it('rejects the wrong code without setting a cookie', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/access',
      payload: { code: '000000' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.cookies.some((c) => c.name === 'accessGranted')).toBe(false);
  });

  it('rejects a non-6-digit code', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/access',
      payload: { code: '12' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rate-limits repeated attempts, independent of whether they are correct', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const attempt = () =>
      app.inject({ method: 'POST', url: '/api/access', payload: { code: '000000' } });

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await attempt());
    }

    expect(results.slice(0, 5).map((r) => r.statusCode)).toEqual([401, 401, 401, 401, 401]);
    expect(results[5]!.statusCode).toBe(429);
  });
});

describe('access gate enforcement on other routes', () => {
  it('rejects an otherwise-valid request when ACCESS_CODE is set and no cookie is presented', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'access code required' });
  });

  it('allows the same request through once the access cookie is presented', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const unlock = await app.inject({
      method: 'POST',
      url: '/api/access',
      payload: { code: '123456' },
    });
    const cookieHeader = unlock.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' },
      headers: { cookie: cookieHeader },
    });

    expect(response.statusCode).toBe(200);
  });

  it("never blocks anything when ACCESS_CODE is unset, matching today's LAN/dev behavior", async () => {
    delete process.env.ACCESS_CODE;
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { nickname: 'Alice' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('still allows /health through with no cookie when ACCESS_CODE is set', async () => {
    process.env.ACCESS_CODE = '123456';
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });
});
