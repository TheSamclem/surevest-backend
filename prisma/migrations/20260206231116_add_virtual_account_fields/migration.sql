-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "paystackCustomerId" TEXT,
ADD COLUMN     "virtualAccountBank" TEXT,
ADD COLUMN     "virtualAccountNumber" TEXT,
ADD COLUMN     "virtualAccountProvider" TEXT DEFAULT 'paystack';
