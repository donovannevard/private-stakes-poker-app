import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { hasAccess } from './access-gate.js';
import { registerAccessRoutes } from './routes/access.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerTableRoutes } from './routes/tables.js';
import { bootstrapFromDatabase } from './table-manager.js';
import { registerWebSocketRoute } from './ws.js';

// Reachable without passing the access gate — the last two are literally
// how a browser passes it in the first place.
const GATE_EXEMPT_PATHS = new Set(['/health', '/api/access']);

// Matches the Vite dev server on localhost, 127.0.0.1, or a raw LAN IPv4
// address (e.g. accessing the app from a phone on the same network). The
// port is deliberately unconstrained — FRONTEND_PORT (see docker-compose.yml)
// can move it off the 5173 default when that's already taken on the host.
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}):\d+$/;

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true); // non-browser requests (curl, server-to-server)
        return;
      }
      const allowed = process.env.FRONTEND_ORIGIN
        ? origin === process.env.FRONTEND_ORIGIN
        : DEV_ORIGIN_PATTERN.test(origin);
      callback(null, allowed);
    },
    credentials: true,
  });
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-only-insecure-secret-change-me',
  });
  await app.register(rateLimit, {
    // The sensible blanket layer over the whole API — table create/join,
    // session lookup, etc. POST /api/access overrides this with its own,
    // much stricter limit (see routes/access.ts) since that's the route
    // that's actually meant to withstand brute-forcing.
    max: 100,
    timeWindow: '1 minute',
  });
  await app.register(websocket);

  // A site-wide barrier separate from the per-table session cookie (see
  // session.ts) — a no-op whenever ACCESS_CODE isn't configured, so this
  // never affects local/LAN dev. Runs before routing-specific hooks so
  // nothing past it (including the WebSocket upgrade) is reachable without
  // the cookie it sets.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (GATE_EXEMPT_PATHS.has(path) || hasAccess(request)) {
      return;
    }
    reply.code(401).send({ error: 'access code required' });
  });

  await registerAccessRoutes(app);
  await registerTableRoutes(app);
  await registerSessionRoutes(app);
  await registerWebSocketRoute(app);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await bootstrapFromDatabase();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
