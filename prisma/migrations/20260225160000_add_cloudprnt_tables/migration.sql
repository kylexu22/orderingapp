-- CreateEnum
CREATE TYPE "PrintCopyType" AS ENUM ('FRONT', 'KITCHEN');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'DELIVERED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Printer" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "macAddress" TEXT NOT NULL,
  "uid" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "lastStatusJson" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
  "id" TEXT NOT NULL,
  "printerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderNumberSnapshot" TEXT NOT NULL,
  "copyType" "PrintCopyType" NOT NULL,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
  "jobToken" TEXT NOT NULL,
  "requestedMime" TEXT NOT NULL DEFAULT 'text/plain',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "payloadCache" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Printer_macAddress_key" ON "Printer"("macAddress");

-- CreateIndex
CREATE INDEX "Printer_isActive_idx" ON "Printer"("isActive");

-- CreateIndex
CREATE INDEX "Printer_lastSeenAt_idx" ON "Printer"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_jobToken_key" ON "PrintJob"("jobToken");

-- CreateIndex
CREATE INDEX "PrintJob_printerId_status_createdAt_idx" ON "PrintJob"("printerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_orderId_createdAt_idx" ON "PrintJob"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
