import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/**
 * Returns `null` whenever `DATABASE_URL` isn't set — every persistence
 * function in this package treats that as "persistence is disabled" and
 * no-ops immediately, with zero network attempts. This is what keeps the
 * rest of the workspace's test suites fast and DB-independent: tests never
 * set `DATABASE_URL`, so this path is never exercised there.
 */
export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
