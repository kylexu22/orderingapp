import { PrismaClient } from "@prisma/client";

const sourceUrl =
  process.env.SOURCE_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/ordering_system?schema=public";
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!targetUrl) {
  throw new Error("TARGET_DATABASE_URL is required");
}

const source = new PrismaClient({
  datasources: {
    db: {
      url: sourceUrl
    }
  }
});

const target = new PrismaClient({
  datasources: {
    db: {
      url: targetUrl
    }
  }
});

async function main() {
  const [
    categories,
    items,
    modifierGroups,
    modifierOptions,
    combos,
    comboGroups,
    comboOptions,
    storeSettings,
    orders,
    orderLines,
    orderSelections
  ] = await Promise.all([
    source.category.findMany(),
    source.item.findMany(),
    source.modifierGroup.findMany(),
    source.modifierOption.findMany(),
    source.combo.findMany(),
    source.comboGroup.findMany(),
    source.comboOption.findMany(),
    source.storeSettings.findMany(),
    source.order.findMany(),
    source.orderLine.findMany(),
    source.orderSelection.findMany()
  ]);

  await target.orderSelection.deleteMany();
  await target.orderLine.deleteMany();
  await target.order.deleteMany();
  await target.comboOption.deleteMany();
  await target.comboGroup.deleteMany();
  await target.combo.deleteMany();
  await target.modifierOption.deleteMany();
  await target.modifierGroup.deleteMany();
  await target.item.deleteMany();
  await target.category.deleteMany();
  await target.storeSettings.deleteMany();

  if (categories.length) await target.category.createMany({ data: categories });
  if (items.length) await target.item.createMany({ data: items });
  if (modifierGroups.length) await target.modifierGroup.createMany({ data: modifierGroups });
  if (modifierOptions.length) await target.modifierOption.createMany({ data: modifierOptions });
  if (combos.length) await target.combo.createMany({ data: combos });
  if (comboGroups.length) await target.comboGroup.createMany({ data: comboGroups });
  if (comboOptions.length) await target.comboOption.createMany({ data: comboOptions });
  if (storeSettings.length) {
    for (const s of storeSettings) {
      await target.storeSettings.create({
        data: {
          id: s.id,
          timezone: s.timezone,
          prepTimeMinutes: s.prepTimeMinutes,
          slotIntervalMinutes: s.slotIntervalMinutes,
          storeHours: s.storeHours as any,
          closedDates: s.closedDates as any
        }
      });
    }
  }
  if (orders.length) await target.order.createMany({ data: orders });
  if (orderLines.length) await target.orderLine.createMany({ data: orderLines });
  if (orderSelections.length) await target.orderSelection.createMany({ data: orderSelections });

  console.log(
    `Copied data: categories=${categories.length}, items=${items.length}, modifierGroups=${modifierGroups.length}, modifierOptions=${modifierOptions.length}, combos=${combos.length}, comboGroups=${comboGroups.length}, comboOptions=${comboOptions.length}, storeSettings=${storeSettings.length}, orders=${orders.length}, orderLines=${orderLines.length}, orderSelections=${orderSelections.length}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  });
