-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_fieldOfficerId_fkey" FOREIGN KEY ("fieldOfficerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
