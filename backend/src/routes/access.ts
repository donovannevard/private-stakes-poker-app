import type { FastifyInstance } from 'fastify';
import { checkAccessCode, hasAccess, setAccessGrantedCookie } from '../access-gate.js';

const ACCESS_CODE_PATTERN = /^\d{6}$/;

interface SubmitAccessBody {
  code?: unknown;
}

export async function registerAccessRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/access', async (request) => {
    return { granted: hasAccess(request) };
  });

  app.post<{ Body: SubmitAccessBody }>(
    '/api/access',
    {
      config: {
        rateLimit: {
          // The real defense: 1,000,000 possible codes at 5 attempts / 15 min
          // is roughly 500 days to exhaust by brute force.
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const code = request.body.code;
      if (typeof code !== 'string' || !ACCESS_CODE_PATTERN.test(code) || !checkAccessCode(code)) {
        return reply.code(401).send({ error: 'incorrect code' });
      }

      setAccessGrantedCookie(reply);
      return { granted: true };
    },
  );
}
