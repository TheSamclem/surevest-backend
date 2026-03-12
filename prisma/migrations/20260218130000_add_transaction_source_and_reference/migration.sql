-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual_collection',
ADD COLUMN "reference" TEXT;
