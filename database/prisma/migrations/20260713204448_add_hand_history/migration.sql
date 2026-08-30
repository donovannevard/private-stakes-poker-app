-- CreateTable
CREATE TABLE "HandHistory" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "actionLog" JSONB NOT NULL,
    "winners" JSONB,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandHistory_tableId_idx" ON "HandHistory"("tableId");
