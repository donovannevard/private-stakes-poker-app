import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('hand-history', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
  });

  it('no-ops when DATABASE_URL is unset', async () => {
    const { saveHandHistory } = await import('./hand-history.js');

    await expect(
      saveHandHistory({
        tableId: 't1',
        seed: 'seed',
        players: [{ playerId: 'p1', stack: 200 }],
        actionLog: [],
        winners: ['p1'],
        completedAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
