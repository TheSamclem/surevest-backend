/*
  Warnings:

  - Added the required column `totalToRepay` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Made the column `loanTypeId` on table `Loan` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Loan" DROP CONSTRAINT "Loan_loanTypeId_fkey";

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "appliedCharges" JSONB,
ADD COLUMN     "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalToRepay" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "amountPaid" SET DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "loanTypeId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_loanTypeId_fkey" FOREIGN KEY ("loanTypeId") REFERENCES "LoanType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
