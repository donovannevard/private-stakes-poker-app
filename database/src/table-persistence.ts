import { getPrisma } from './client.js';

export interface PersistedPlayerData {
  readonly playerId: string;
  readonly nickname: string;
  readonly isBot: boolean;
  readonly stack: number;
  readonly joinOrder: number;
  readonly handsPlayed: number;
  readonly handsWon: number;
  readonly handsFolded: number;
  /**
   * Not a secret — safe to persist. LNbits credentials are never persisted
   * (see backend). Always explicitly `string | null` (never `undefined`) so
   * a cleared address actually overwrites the stored value instead of
   * Prisma silently skipping an `undefined` field on update.
   */
  readonly lightningAddress: string | null;
}

export interface PersistedTableMeta {
  readonly id: string;
  readonly gameType: string;
  readonly maxSeats: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly turnTimeoutSeconds: number | null;
  readonly botSkill: number;
  readonly buttonIndex: number;
}

export interface PersistedHandData {
  readonly seed: string;
  readonly players: ReadonlyArray<{ playerId: string; stack: number }>;
  readonly actionLog: ReadonlyArray<{ playerId: string; action: unknown }>;
}

export interface PersistedTableSnapshot extends PersistedTableMeta {
  readonly players: readonly PersistedPlayerData[];
  readonly currentHand: PersistedHandData | null;
}

function logError(operation: string, error: unknown): void {
  console.error(`[database] ${operation} failed:`, error);
}

export async function upsertTableMeta(meta: PersistedTableMeta): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.persistedTable.upsert({
      where: { id: meta.id },
      create: meta,
      update: {
        gameType: meta.gameType,
        maxSeats: meta.maxSeats,
        smallBlind: meta.smallBlind,
        bigBlind: meta.bigBlind,
        startingStack: meta.startingStack,
        turnTimeoutSeconds: meta.turnTimeoutSeconds,
        botSkill: meta.botSkill,
        buttonIndex: meta.buttonIndex,
      },
    });
  } catch (error) {
    logError('upsertTableMeta', error);
  }
}

export async function upsertPlayer(tableId: string, player: PersistedPlayerData): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.persistedPlayer.upsert({
      where: { tableId_playerId: { tableId, playerId: player.playerId } },
      create: { tableId, ...player },
      update: {
        nickname: player.nickname,
        isBot: player.isBot,
        stack: player.stack,
        joinOrder: player.joinOrder,
        handsPlayed: player.handsPlayed,
        handsWon: player.handsWon,
        handsFolded: player.handsFolded,
        lightningAddress: player.lightningAddress,
      },
    });
  } catch (error) {
    logError('upsertPlayer', error);
  }
}

export async function removePlayer(tableId: string, playerId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.persistedPlayer.deleteMany({ where: { tableId, playerId } });
  } catch (error) {
    logError('removePlayer', error);
  }
}

export async function deleteTable(tableId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.persistedTable.delete({ where: { id: tableId } });
  } catch (error) {
    logError('deleteTable', error);
  }
}

export async function saveCurrentHand(tableId: string, hand: PersistedHandData): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    const players = hand.players as object;
    const actionLog = hand.actionLog as object;
    await prisma.persistedHand.upsert({
      where: { tableId },
      create: { tableId, seed: hand.seed, players, actionLog },
      update: { seed: hand.seed, players, actionLog },
    });
  } catch (error) {
    logError('saveCurrentHand', error);
  }
}

export async function clearCurrentHand(tableId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.persistedHand.deleteMany({ where: { tableId } });
  } catch (error) {
    logError('clearCurrentHand', error);
  }
}

export async function loadAllTables(): Promise<PersistedTableSnapshot[]> {
  const prisma = getPrisma();
  if (!prisma) {
    return [];
  }
  try {
    const tables = await prisma.persistedTable.findMany({
      include: {
        players: { orderBy: { joinOrder: 'asc' } },
        currentHand: true,
      },
    });

    return tables.map((table) => ({
      id: table.id,
      gameType: table.gameType,
      maxSeats: table.maxSeats,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
      startingStack: table.startingStack,
      turnTimeoutSeconds: table.turnTimeoutSeconds,
      botSkill: table.botSkill,
      buttonIndex: table.buttonIndex,
      players: table.players.map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        isBot: player.isBot,
        stack: player.stack,
        joinOrder: player.joinOrder,
        handsPlayed: player.handsPlayed,
        handsWon: player.handsWon,
        handsFolded: player.handsFolded,
        lightningAddress: player.lightningAddress,
      })),
      currentHand: table.currentHand
        ? {
            seed: table.currentHand.seed,
            players: table.currentHand.players as Array<{ playerId: string; stack: number }>,
            actionLog: table.currentHand.actionLog as Array<{
              playerId: string;
              action: unknown;
            }>,
          }
        : null,
    }));
  } catch (error) {
    logError('loadAllTables', error);
    return [];
  }
}
