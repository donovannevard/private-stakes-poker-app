/*
  Warnings:

  - Added the required column `startingStack` to the `PersistedTable` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PersistedTable" ADD COLUMN     "startingStack" INTEGER NOT NULL,
ADD COLUMN     "turnTimeoutSeconds" INTEGER;
