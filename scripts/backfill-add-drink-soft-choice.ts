import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: { isActive: true, isComboOnly: false },
    include: {
      modifierGroups: {
        select: { id: true }
      }
    }
  });

  let groupsCreated = 0;
  let optionsCreated = 0;

  for (const item of items) {
    const addDrinkGroupId = `modgrp_add_drink_${item.id}`;
    const hasAddDrinkGroup = item.modifierGroups.some((g) => g.id === addDrinkGroupId);
    if (!hasAddDrinkGroup) continue;

    const softChoiceGroupId = `modgrp_add_drink_soft_choice_${item.id}`;
    const group = await prisma.modifierGroup.upsert({
      where: { id: softChoiceGroupId },
      create: {
        id: softChoiceGroupId,
        itemId: item.id,
        name: "Add Drink Soft Drink Choice",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 102
      },
      update: {}
    });
    if (group.id === softChoiceGroupId) groupsCreated += 1;

    const result = await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_add_drink_soft_choice_coke_${item.id}`,
          groupId: softChoiceGroupId,
          name: "Coke",
          priceDeltaCents: 0,
          sortOrder: 1,
          isDefault: true
        },
        {
          id: `modopt_add_drink_soft_choice_sprite_${item.id}`,
          groupId: softChoiceGroupId,
          name: "Sprite",
          priceDeltaCents: 0,
          sortOrder: 2,
          isDefault: false
        },
        {
          id: `modopt_add_drink_soft_choice_diet_coke_${item.id}`,
          groupId: softChoiceGroupId,
          name: "Diet Coke",
          priceDeltaCents: 0,
          sortOrder: 3,
          isDefault: false
        },
        {
          id: `modopt_add_drink_soft_choice_ginger_ale_${item.id}`,
          groupId: softChoiceGroupId,
          name: "Ginger Ale",
          priceDeltaCents: 0,
          sortOrder: 4,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });
    optionsCreated += result.count;
  }

  console.log(`Backfill complete. groups_checked=${groupsCreated}, options_created=${optionsCreated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
