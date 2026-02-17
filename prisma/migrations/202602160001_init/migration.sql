-- CreateEnum
CREATE TYPE "ComboOptionType" AS ENUM ('ITEM', 'CATEGORY');
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'READY', 'PICKED_UP', 'CANCELLED');
CREATE TYPE "PickupType" AS ENUM ('ASAP', 'SCHEDULED');
CREATE TYPE "OrderLineType" AS ENUM ('ITEM', 'COMBO');
CREATE TYPE "SelectionKind" AS ENUM ('COMBO_PICK', 'MODIFIER');

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "basePriceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModifierGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "minSelect" INTEGER NOT NULL DEFAULT 0,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "itemId" TEXT,
  CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModifierOption" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Combo" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "basePriceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboGroup" (
  "id" TEXT NOT NULL,
  "comboId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "minSelect" INTEGER NOT NULL DEFAULT 0,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ComboGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboOption" (
  "id" TEXT NOT NULL,
  "comboGroupId" TEXT NOT NULL,
  "optionType" "ComboOptionType" NOT NULL,
  "refId" TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "allowModifiers" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ComboOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreSettings" (
  "id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "prepTimeMinutes" INTEGER NOT NULL,
  "slotIntervalMinutes" INTEGER NOT NULL,
  "storeHours" JSONB NOT NULL,
  "closedDates" JSONB NOT NULL,
  CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
  "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "notes" TEXT,
  "pickupType" "PickupType" NOT NULL,
  "pickupTime" TIMESTAMP(3),
  "estimatedReadyTime" TIMESTAMP(3),
  "subtotalCents" INTEGER NOT NULL,
  "taxCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lineType" "OrderLineType" NOT NULL,
  "refId" TEXT NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "basePriceSnapshotCents" INTEGER NOT NULL,
  "qty" INTEGER NOT NULL,
  "lineTotalCents" INTEGER NOT NULL,
  CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderSelection" (
  "id" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "selectionKind" "SelectionKind" NOT NULL,
  "label" TEXT NOT NULL,
  "selectedItemNameSnapshot" TEXT,
  "selectedItemId" TEXT,
  "selectedModifierOptionNameSnapshot" TEXT,
  "selectedModifierOptionId" TEXT,
  "priceDeltaSnapshotCents" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrderSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Category_sortOrder_idx" ON "Category"("sortOrder");
CREATE INDEX "Item_categoryId_idx" ON "Item"("categoryId");
CREATE INDEX "ModifierGroup_itemId_idx" ON "ModifierGroup"("itemId");
CREATE INDEX "ModifierOption_groupId_idx" ON "ModifierOption"("groupId");
CREATE INDEX "ComboGroup_comboId_idx" ON "ComboGroup"("comboId");
CREATE INDEX "ComboOption_comboGroupId_idx" ON "ComboOption"("comboGroupId");
CREATE INDEX "ComboOption_refId_idx" ON "ComboOption"("refId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderSelection_orderLineId_idx" ON "OrderSelection"("orderLineId");

ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "ModifierGroup_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboGroup" ADD CONSTRAINT "ComboGroup_comboId_fkey"
  FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboOption" ADD CONSTRAINT "ComboOption_comboGroupId_fkey"
  FOREIGN KEY ("comboGroupId") REFERENCES "ComboGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderSelection" ADD CONSTRAINT "OrderSelection_orderLineId_fkey"
  FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
