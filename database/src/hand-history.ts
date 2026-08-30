import { Prisma } from '@prisma/client';
import { getPrisma } from './client.js';

export interface HandHistoryData {
  readonly tableId: string;
  readonly seed: string;
  readonly players: ReadonlyArray<{ playerId: string; stack: number }>;
  readonly actionLog: ReadonlyArray<{ playerId: string; action: unknown }>;
  readonly winners: readonly string[] | null;
  readonly completedAt: Date;
}

function logError(operation: string, error: unknown): void {
  console.error(`[database] ${operation} failed:`, error);
}

export async function saveHandHistory(entry: HandHistoryData): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    return;
  }
  try {
    await prisma.handHistory.create({
      data: {
        tableId: entry.tableId,
        seed: entry.seed,
        players: entry.players as object,
        actionLog: entry.actionLog as object,
        winners: entry.winners ? (entry.winners as object) : Prisma.JsonNull,
        completedAt: entry.completedAt,
      },
    });
  } catch (error) {
    logError('saveHandHistory', error);
  }
}
