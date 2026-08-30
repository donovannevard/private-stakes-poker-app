import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('table-persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
  });

  it('no-ops every write and returns an empty list from loadAllTables when DATABASE_URL is unset', async () => {
    const {
      upsertTableMeta,
      upsertPlayer,
      removePlayer,
      deleteTable,
      saveCurrentHand,
      clearCurrentHand,
      loadAllTables,
    } = await import('./table-persistence.js');

    await expect(
      upsertTableMeta({
        id: 't1',
        gameType: 'texas-holdem',
        maxSeats: 6,
        smallBlind: 1,
        bigBlind: 2,
        startingStack: 200,
        turnTimeoutSeconds: null,
        botSkill: 70,
        buttonIndex: 0,
      }),
    ).resolves.toBeUndefined();
    await expect(
      upsertPlayer('t1', {
        playerId: 'p1',
        nickname: 'Alice',
        isBot: false,
        stack: 200,
        joinOrder: 0,
        handsPlayed: 0,
        handsWon: 0,
        handsFolded: 0,
        lightningAddress: null,
      }),
    ).resolves.toBeUndefined();
    await expect(removePlayer('t1', 'p1')).resolves.toBeUndefined();
    await expect(deleteTable('t1')).resolves.toBeUndefined();
    await expect(
      saveCurrentHand('t1', { seed: 'seed', players: [], actionLog: [] }),
    ).resolves.toBeUndefined();
    await expect(clearCurrentHand('t1')).resolves.toBeUndefined();
    await expect(loadAllTables()).resolves.toEqual([]);
  });
});
