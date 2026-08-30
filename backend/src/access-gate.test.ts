import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAccessCode, hasAccess, setAccessGrantedCookie } from './access-gate.js';

const ORIGINAL_ACCESS_CODE = process.env.ACCESS_CODE;

afterEach(() => {
  if (ORIGINAL_ACCESS_CODE === undefined) {
    delete process.env.ACCESS_CODE;
  } else {
    process.env.ACCESS_CODE = ORIGINAL_ACCESS_CODE;
  }
});

/** A minimal app with just cookie support — no gate hook, so probe routes are reachable directly. */
async function buildProbeApp() {
  const app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  let lastSeen: boolean | undefined;

  app.get('/set', async (_request, reply) => {
    setAccessGrantedCookie(reply);
    return {};
  });
  app.get('/probe', async (request) => {
    lastSeen = hasAccess(request);
    return {};
  });

  return { app, getLastSeen: () => lastSeen };
}

describe('hasAccess', () => {
  it('grants access with no cookie at all when ACCESS_CODE is unset', async () => {
    delete process.env.ACCESS_CODE;
    const { app, getLastSeen } = await buildProbeApp();

    await app.inject({ method: 'GET', url: '/probe' });

    expect(getLastSeen()).toBe(true);
  });

  it('denies access with no cookie when ACCESS_CODE is set', async () => {
    process.env.ACCESS_CODE = '123456';
    const { app, getLastSeen } = await buildProbeApp();

    await app.inject({ method: 'GET', url: '/probe' });

    expect(getLastSeen()).toBe(false);
  });

  it('grants access once the cookie set by setAccessGrantedCookie is presented back', async () => {
    process.env.ACCESS_CODE = '123456';
    const { app, getLastSeen } = await buildProbeApp();

    const setResponse = await app.inject({ method: 'GET', url: '/set' });
    const cookieHeader = setResponse.cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    await app.inject({ method: 'GET', url: '/probe', headers: { cookie: cookieHeader } });

    expect(getLastSeen()).toBe(true);
  });

  it('denies access given a garbage or unsigned cookie value', async () => {
    process.env.ACCESS_CODE = '123456';
    const { app, getLastSeen } = await buildProbeApp();

    await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { cookie: 'accessGranted=not-a-real-signed-value' },
    });

    expect(getLastSeen()).toBe(false);
  });
});

describe('checkAccessCode', () => {
  it('accepts the exact configured code and rejects everything else', () => {
    process.env.ACCESS_CODE = '123456';

    expect(checkAccessCode('123456')).toBe(true);
    expect(checkAccessCode('654321')).toBe(false);
    expect(checkAccessCode('12345')).toBe(false); // wrong length
    expect(checkAccessCode('1234567')).toBe(false); // wrong length
  });

  it('rejects everything when ACCESS_CODE is unset', () => {
    delete process.env.ACCESS_CODE;

    expect(checkAccessCode('123456')).toBe(false);
    expect(checkAccessCode('')).toBe(false);
  });
});
