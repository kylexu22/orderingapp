import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PENDING_ZH = "中文待翻譯";
const cjkRegex = /[\u3400-\u9FFF]/;

function hasChinese(value: string): boolean {
  return cjkRegex.test(value);
}

function withPendingZh(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (hasChinese(trimmed)) return trimmed;
  if (trimmed.startsWith(`${PENDING_ZH} |`)) return trimmed;
  return `${PENDING_ZH} | ${trimmed}`;
}

type Counter = {
  touched: number;
  name: number;
  description: number;
};

async function main() {
  const counts: Record<string, Counter> = {
    category: { touched: 0, name: 0, description: 0 },
    item: { touched: 0, name: 0, description: 0 },
    modifierGroup: { touched: 0, name: 0, description: 0 },
    modifierOption: { touched: 0, name: 0, description: 0 },
    combo: { touched: 0, name: 0, description: 0 },
    comboGroup: { touched: 0, name: 0, description: 0 }
  };

  const categories = await prisma.category.findMany();
  for (const row of categories) {
    const nextName = withPendingZh(row.name);
    if (nextName !== row.name) {
      await prisma.category.update({ where: { id: row.id }, data: { name: nextName } });
      counts.category.touched += 1;
      counts.category.name += 1;
    }
  }

  const items = await prisma.item.findMany();
  for (const row of items) {
    const nextName = withPendingZh(row.name);
    const nextDescription = row.description ? withPendingZh(row.description) : row.description;
    if (nextName !== row.name || nextDescription !== row.description) {
      await prisma.item.update({
        where: { id: row.id },
        data: { name: nextName, description: nextDescription }
      });
      counts.item.touched += 1;
      if (nextName !== row.name) counts.item.name += 1;
      if (nextDescription !== row.description) counts.item.description += 1;
    }
  }

  const modifierGroups = await prisma.modifierGroup.findMany();
  for (const row of modifierGroups) {
    const nextName = withPendingZh(row.name);
    if (nextName !== row.name) {
      await prisma.modifierGroup.update({ where: { id: row.id }, data: { name: nextName } });
      counts.modifierGroup.touched += 1;
      counts.modifierGroup.name += 1;
    }
  }

  const modifierOptions = await prisma.modifierOption.findMany();
  for (const row of modifierOptions) {
    const nextName = withPendingZh(row.name);
    if (nextName !== row.name) {
      await prisma.modifierOption.update({ where: { id: row.id }, data: { name: nextName } });
      counts.modifierOption.touched += 1;
      counts.modifierOption.name += 1;
    }
  }

  const combos = await prisma.combo.findMany();
  for (const row of combos) {
    const nextName = withPendingZh(row.name);
    const nextDescription = row.description ? withPendingZh(row.description) : row.description;
    if (nextName !== row.name || nextDescription !== row.description) {
      await prisma.combo.update({
        where: { id: row.id },
        data: { name: nextName, description: nextDescription }
      });
      counts.combo.touched += 1;
      if (nextName !== row.name) counts.combo.name += 1;
      if (nextDescription !== row.description) counts.combo.description += 1;
    }
  }

  const comboGroups = await prisma.comboGroup.findMany();
  for (const row of comboGroups) {
    const nextName = withPendingZh(row.name);
    if (nextName !== row.name) {
      await prisma.comboGroup.update({ where: { id: row.id }, data: { name: nextName } });
      counts.comboGroup.touched += 1;
      counts.comboGroup.name += 1;
    }
  }

  console.log("Backfill complete.");
  for (const [model, c] of Object.entries(counts)) {
    console.log(
      `${model}: rows=${c.touched}, name=${c.name}${c.description ? `, description=${c.description}` : ""}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
