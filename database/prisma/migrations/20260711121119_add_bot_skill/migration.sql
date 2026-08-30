/*
  Warnings:

  - Added the required column `botSkill` to the `PersistedTable` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PersistedTable" ADD COLUMN     "botSkill" INTEGER NOT NULL;
