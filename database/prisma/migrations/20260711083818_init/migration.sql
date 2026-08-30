-- CreateTable
CREATE TABLE "PersistedTable" (
    "id" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "maxSeats" INTEGER NOT NULL,
    "smallBlind" INTEGER NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "buttonIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersistedTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistedPlayer" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL,
    "stack" INTEGER NOT NULL,
    "joinOrder" INTEGER NOT NULL,
    "handsPlayed" INTEGER NOT NULL DEFAULT 0,
    "handsWon" INTEGER NOT NULL DEFAULT 0,
    "handsFolded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PersistedPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistedHand" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "actionLog" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersistedHand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersistedPlayer_tableId_playerId_key" ON "PersistedPlayer"("tableId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PersistedHand_tableId_key" ON "PersistedHand"("tableId");

-- AddForeignKey
ALTER TABLE "PersistedPlayer" ADD CONSTRAINT "PersistedPlayer_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PersistedTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistedHand" ADD CONSTRAINT "PersistedHand_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PersistedTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
