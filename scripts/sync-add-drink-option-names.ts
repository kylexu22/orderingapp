import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const drinks = await prisma.item.findMany({
    where: {
      isActive: true,
      id: {
        in: [
          "drink_soft",
          "drink_hk_milk_tea",
          "drink_coffee",
          "drink_mixed_coffee_tea",
          "drink_ovaltine",
          "drink_horlick",
          "drink_chocolate",
          "drink_almond",
          "drink_lemon_tea",
          "drink_lemon_water",
          "drink_lemon_coffee",
          "drink_lemon_honey",
          "drink_lemon_coke",
          "drink_lemon_sprite",
          "drink_soy_milk"
        ]
      }
    },
    select: { id: true, name: true }
  });

  const drinkNameById = new Map(drinks.map((d) => [d.id, d.name]));

  const addDrinkOptions = await prisma.modifierOption.findMany({
    where: {
      id: {
        startsWith: "modopt_add_drink_"
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  let updated = 0;
  for (const opt of addDrinkOptions) {
    if (opt.id.endsWith("_none")) {
      const noneName = "不需要飲品 | None";
      if (opt.name !== noneName) {
        await prisma.modifierOption.update({
          where: { id: opt.id },
          data: { name: noneName }
        });
        updated += 1;
      }
      continue;
    }

    const matchedDrinkId = Array.from(drinkNameById.keys()).find((drinkId) =>
      opt.id.endsWith(`_${drinkId}`)
    );
    if (!matchedDrinkId) continue;

    const nextName = drinkNameById.get(matchedDrinkId);
    if (!nextName || nextName === opt.name) continue;

    await prisma.modifierOption.update({
      where: { id: opt.id },
      data: { name: nextName }
    });
    updated += 1;
  }

  const addDrinkGroups = await prisma.modifierGroup.findMany({
    where: { id: { startsWith: "modgrp_add_drink_" } },
    select: { id: true, name: true }
  });
  for (const group of addDrinkGroups) {
    let nextName = group.name;
    if (group.id.startsWith("modgrp_add_drink_temp_")) {
      nextName = "加配飲品：溫度 | Add Drink Temperature";
    } else if (group.id.startsWith("modgrp_add_drink_sugar_")) {
      nextName = "加配飲品：甜度 | Add Drink Sugar Level";
    } else if (group.id.startsWith("modgrp_add_drink_soft_choice_")) {
      nextName = "加配飲品：汽水選擇 | Add Drink Soft Drink Choice";
    } else {
      nextName = "加配飲品 | Add Drink";
    }
    if (nextName !== group.name) {
      await prisma.modifierGroup.update({
        where: { id: group.id },
        data: { name: nextName }
      });
      updated += 1;
    }
  }

  const tempAndSugarOptions = await prisma.modifierOption.findMany({
    where: {
      OR: [
        { id: { startsWith: "modopt_add_drink_temp_" } },
        { id: { startsWith: "modopt_add_drink_sugar_" } }
      ]
    },
    select: { id: true, name: true }
  });
  for (const option of tempAndSugarOptions) {
    let nextName = option.name;
    if (option.id.startsWith("modopt_add_drink_temp_hot_")) nextName = "熱 | Hot";
    if (option.id.startsWith("modopt_add_drink_temp_cold_")) nextName = "凍 | Cold";
    if (option.id.startsWith("modopt_add_drink_sugar_regular_")) nextName = "正常甜 | Regular";
    if (option.id.startsWith("modopt_add_drink_sugar_less_")) nextName = "少甜 | Less Sugar";
    if (option.id.startsWith("modopt_add_drink_sugar_none_")) nextName = "無糖 | No Sugar";
    if (nextName !== option.name) {
      await prisma.modifierOption.update({
        where: { id: option.id },
        data: { name: nextName }
      });
      updated += 1;
    }
  }

  const softChoiceUpdates = [
    { key: "coke", name: "可口可樂 | Coke" },
    { key: "sprite", name: "雪碧 | Sprite" },
    { key: "diet_coke", name: "健怡可樂 | Diet Coke" },
    { key: "ginger_ale", name: "薑汁汽水 | Ginger Ale" }
  ];
  const softChoiceGroups = await prisma.modifierGroup.findMany({
    where: { id: { startsWith: "modgrp_add_drink_soft_choice_" } },
    select: { id: true, name: true }
  });
  for (const group of softChoiceGroups) {
    const groupName = "加配飲品：汽水選擇 | Add Drink Soft Drink Choice";
    if (group.name === groupName) continue;
    await prisma.modifierGroup.update({
      where: { id: group.id },
      data: { name: groupName }
    });
    updated += 1;
  }
  const softOptions = await prisma.modifierOption.findMany({
    where: { id: { startsWith: "modopt_add_drink_soft_choice_" } },
    select: { id: true, name: true }
  });
  for (const option of softOptions) {
    const hit = softChoiceUpdates.find((u) => option.id.includes(`_${u.key}_`));
    if (!hit || option.name === hit.name) continue;
    await prisma.modifierOption.update({
      where: { id: option.id },
      data: { name: hit.name }
    });
    updated += 1;
  }

  console.log(`Synced add-drink option names. updated=${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
