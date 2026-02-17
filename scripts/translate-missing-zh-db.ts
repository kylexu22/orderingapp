import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function translateEnglishChunk(en: string): string {
  const t = en.trim();
  const chooseDish = t.match(/^Choose\s+(\d+)\s+dishes?\s+from\s+Combo\s+Special\s+menu$/i);
  if (chooseDish) return `任選${chooseDish[1]}款菜式`;
  if (t === "Includes hot drink or soft drink. (Cold +$1.50)") {
    return "包熱飲或汽水（凍飲+$1.50）";
  }
  if (t === "Combo Special item") return "自選和菜菜式";

  const map: Record<string, string> = {
    "Choose Main": "選擇主食",
    "Choose Side": "選擇配菜",
    "Choose Meat": "選擇肉類",
    "Choose Sauce": "選擇醬汁",
    "Choose Satay": "選擇沙嗲",
    "Choose Noodle Type": "選擇麵類",
    "Choose Base": "選擇主食",
    "Choose Beef": "選擇牛肉",
    "Choose Balls": "選擇丸類",
    "Choose Any Two": "任選兩款",
    "Choose Two": "任選兩款",
    "Choose Spread": "選擇醬料",
    "Choose Protein": "選擇配料",
    "Choose Four": "任選四款",
    "Choose One": "任選一款"
  };
  return map[t] ?? "";
}

function replacePendingZh(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  const m = value.match(/^中文待翻譯\s*\|\s*(.+)$/);
  if (!m) return value;
  const en = m[1].trim();
  const zh = translateEnglishChunk(en);
  if (!zh) return value;
  return `${zh} | ${en}`;
}

async function main() {
  let updated = 0;

  const combos = await prisma.combo.findMany({ select: { id: true, description: true } });
  for (const row of combos) {
    const next = replacePendingZh(row.description);
    if (next !== row.description) {
      await prisma.combo.update({ where: { id: row.id }, data: { description: next } });
      updated += 1;
    }
  }

  const items = await prisma.item.findMany({ select: { id: true, description: true } });
  for (const row of items) {
    const next = replacePendingZh(row.description);
    if (next !== row.description) {
      await prisma.item.update({ where: { id: row.id }, data: { description: next } });
      updated += 1;
    }
  }

  const groups = await prisma.modifierGroup.findMany({ select: { id: true, name: true } });
  for (const row of groups) {
    const next = replacePendingZh(row.name);
    if (next !== row.name) {
      await prisma.modifierGroup.update({ where: { id: row.id }, data: { name: next as string } });
      updated += 1;
    }
  }

  console.log(`Translated pending Chinese placeholders. updated=${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
