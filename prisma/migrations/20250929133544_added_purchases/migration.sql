-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUIRES_PAYMENT', 'SUCCEEDED', 'CANCELED', 'REFUNDED');

-- AlterTable
ALTER TABLE "cockpits" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "isForSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceCents" INTEGER;

-- CreateTable
CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cockpitId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_userId_cockpitId_key" ON "purchases"("userId", "cockpitId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cockpitId_fkey" FOREIGN KEY ("cockpitId") REFERENCES "cockpits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
