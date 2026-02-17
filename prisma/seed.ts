import { ComboOptionType, PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

type ScrapedCategory = {
  slug: string;
  label: string;
};

type ScrapedProduct = {
  slug: string;
  categories: string[];
  title?: string;
  listingTitle?: string;
  priceText?: string;
  descriptionText?: string;
};

type ScrapedMenu = {
  categories: ScrapedCategory[];
  products: ScrapedProduct[];
};

type ComboDish = {
  no: string;
  zh: string;
  en: string;
  premium?: boolean;
};

type ComboCategory = {
  key: string;
  categoryId: string;
  categoryName: string;
  dishes: ComboDish[];
};

type ComboMenu = {
  categories: ComboCategory[];
};

type SelectionRule = {
  idSuffix: string;
  match: (name: string) => boolean;
  groupName: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: string[];
};

const SCRAPED_MENU_PATH = path.join(process.cwd(), "data", "hongfarcafe-menu-scrape.json");
const COMBO_MENU_PATH = path.join(process.cwd(), "data", "combo-special-items.json");
const SPECIAL_SET_DESCRIPTION = "Includes hot drink or soft drink. (Cold +$1.50)";
const CONGEE_ADDON_NOTE_ZH = "(以上粥類可跟油條或牛脷酥加$2.00)";
const CONGEE_ADDON_NOTE_BILINGUAL =
  "(以上粥類可跟油條或牛脷酥加$2.00) Include fried dough sticks or ox-tongue pastry for $2.00";
const CONGEE_ADDON_PRICE_CENTS = 200;
const TEA_TIME_SELECTION_RULES: SelectionRule[] = [
  {
    idSuffix: "tea_time_instant_noodle_pick_two",
    match: (name) => /instant noodle in soup/i.test(name) && /choose two/i.test(name),
    groupName: "Choose Two",
    minSelect: 2,
    maxSelect: 2,
    sortOrder: 120,
    options: ["Egg", "Sausage", "Satay Beef", "Fillet", "Ham"]
  },
  {
    idSuffix: "tea_time_sandwich_pick_two",
    match: (name) => /sandwich/i.test(name) && /choose any two/i.test(name),
    groupName: "Choose Any Two",
    minSelect: 2,
    maxSelect: 2,
    sortOrder: 120,
    options: ["Ham", "Egg", "Luncheon Meat", "Corned Beef"]
  },
  {
    idSuffix: "tea_time_fried_combo_main",
    match: (name) =>
      /deep fried chicken wings\/pork chop\/fillet with salad/i.test(name),
    groupName: "Choose Main",
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 120,
    options: ["Fried Chicken Wings", "Pork Chop", "Fish Fillet"]
  },
  {
    idSuffix: "tea_time_fried_combo_side",
    match: (name) =>
      /deep fried chicken wings\/pork chop\/fillet with salad/i.test(name),
    groupName: "Choose Side",
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 121,
    options: ["French Fries", "Salad"]
  }
];
const SEED_MODE = process.env.SEED_MODE === "reset" ? "reset" : "sync";
const IS_RESET_MODE = SEED_MODE === "reset";

const manualDrinksCategory = {
  id: "cat_manual_drinks",
  name: "Drinks"
} as const;

const manualDrinks = [
  { id: "drink_soft", name: "Soft Drink", basePriceCents: 230 },
  { id: "drink_hk_milk_tea", name: "HK Style Milk Tea", basePriceCents: 330 },
  { id: "drink_coffee", name: "Coffee", basePriceCents: 330 },
  { id: "drink_mixed_coffee_tea", name: "Mixed Coffee & Tea", basePriceCents: 330 },
  { id: "drink_ovaltine", name: "Ovaltine", basePriceCents: 330 },
  { id: "drink_horlick", name: "Horlick", basePriceCents: 330 },
  { id: "drink_chocolate", name: "Chocolate Drink", basePriceCents: 330 },
  { id: "drink_almond", name: "Almond Drink", basePriceCents: 330 },
  { id: "drink_lemon_tea", name: "Lemon Tea", basePriceCents: 330 },
  { id: "drink_lemon_water", name: "Lemon Water", basePriceCents: 330 },
  { id: "drink_lemon_coffee", name: "Lemon Coffee", basePriceCents: 330 },
  { id: "drink_lemon_honey", name: "Lemon Honey", basePriceCents: 330 },
  { id: "drink_lemon_coke", name: "Lemon Coke", basePriceCents: 410 },
  { id: "drink_lemon_sprite", name: "Lemon Sprite", basePriceCents: 410 },
  { id: "drink_soy_milk", name: "Soy Milk", basePriceCents: 255 }
] as const;

const noSugarModifierDrinkIds = new Set([
  "drink_soft",
  "drink_soy_milk",
  "drink_lemon_sprite",
  "drink_lemon_coke",
  "drink_lemon_honey"
]);

const noTemperatureModifierDrinkIds = new Set([
  "drink_soft",
  "drink_lemon_sprite",
  "drink_lemon_coke"
]);

function hasDrinkIncludeDescription(description?: string | null): boolean {
  if (!description) return false;
  return /\bdrink(s)?\b/i.test(description);
}

function isSpecialSetCategory(categoryName: string): boolean {
  const upper = categoryName.toUpperCase();
  return (
    upper.includes("ALL DAY SPECIAL") ||
    upper.includes("TEA TIME SPECIAL") ||
    upper.includes("HOUSE SPECIAL") ||
    upper.includes("HOT PLATE COMBO") ||
    upper.includes("SAT AND SUN ONLY BREAKFAST")
  );
}

function normalizeCategoryName(label: string): string {
  return label.replace(/\s+\d+\s+Items?\s*$/i, "").trim();
}

function toStableId(prefix: string, value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `${prefix}_${cleaned || "x"}`;
}

function parsePriceCents(priceText?: string): number {
  if (!priceText) return 0;
  const match = priceText.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function normalizeDescription(value?: string): string | null {
  const text = (value ?? "")
    .replace(/\s+/g, " ")
    .replace(CONGEE_ADDON_NOTE_ZH, CONGEE_ADDON_NOTE_BILINGUAL)
    .trim();
  if (!text) return null;
  if (/^(?:price\s*[:\-]?\s*)?(?:\$|CAD\s*)?\d+(?:\.\d{1,2})?(?:\s*(?:each|ea))?$/i.test(text)) {
    return null;
  }
  return text.length > 500 ? text.slice(0, 500) : text;
}

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function main() {
  const scraped = await loadJson<ScrapedMenu>(SCRAPED_MENU_PATH);
  const comboMenu = await loadJson<ComboMenu>(COMBO_MENU_PATH);

  if (IS_RESET_MODE) {
    await prisma.orderSelection.deleteMany();
    await prisma.orderLine.deleteMany();
    await prisma.order.deleteMany();
    await prisma.comboOption.deleteMany();
    await prisma.comboGroup.deleteMany();
    await prisma.combo.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.item.deleteMany();
    await prisma.category.deleteMany();
  }

  const scrapedCategories = scraped.categories.map((category, index) => ({
    id: toStableId("cat", category.slug),
    slug: category.slug,
    name: normalizeCategoryName(category.label),
    sortOrder: index + 1
  }));

  const comboCategories = comboMenu.categories.map((category, index) => ({
    id: category.categoryId,
    name: category.categoryName,
    sortOrder: scrapedCategories.length + 1 + index + 1
  }));

  await prisma.category.createMany({
    data: [
      ...scrapedCategories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true
      })),
      {
        id: manualDrinksCategory.id,
        name: manualDrinksCategory.name,
        sortOrder: scrapedCategories.length + 1,
        isActive: true
      },
      ...comboCategories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true
      }))
    ],
    skipDuplicates: true
  });

  const categoryByName = new Map<string, string>();
  for (const category of scrapedCategories) {
    categoryByName.set(category.name, category.id);
  }

  const scrapedItems = scraped.products
    .map((product) => {
      const categoryName = normalizeCategoryName(product.categories[0] ?? "");
      const categoryId = categoryByName.get(categoryName);
      if (!categoryId) return null;
      const name = (product.title || product.listingTitle || product.slug).trim();
      if (!name) return null;
      return {
        id: toStableId("item", product.slug),
        name,
        description: isSpecialSetCategory(categoryName)
          ? SPECIAL_SET_DESCRIPTION
          : normalizeDescription(product.descriptionText),
        basePriceCents: parsePriceCents(product.priceText),
        categoryId,
        isComboOnly: false
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const comboItems = comboMenu.categories.flatMap((category) =>
    category.dishes.map((dish, index) => ({
      id: `combo_item_${category.key}_${String(index + 1).padStart(2, "0")}`,
      name: `${dish.no} ${dish.zh} | ${dish.en}`,
      description: "Combo Special item",
      basePriceCents: 0,
      categoryId: category.categoryId,
      premiumUpgradeCents: dish.premium ? 450 : 0,
      isComboOnly: true
    }))
  );

  await prisma.item.createMany({
    data: [
      ...scrapedItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        basePriceCents: item.basePriceCents,
        categoryId: item.categoryId,
        isActive: true,
        isComboOnly: item.isComboOnly
      })),
      ...manualDrinks.map((drink) => ({
        id: drink.id,
        name: drink.name,
        description: null,
        basePriceCents: drink.basePriceCents,
        categoryId: manualDrinksCategory.id,
        isActive: true,
        isComboOnly: false
      })),
      ...comboItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        basePriceCents: item.basePriceCents,
        categoryId: item.categoryId,
        isActive: true,
        isComboOnly: item.isComboOnly
      }))
    ],
    skipDuplicates: true
  });

  for (const drink of manualDrinks) {
    if (!noTemperatureModifierDrinkIds.has(drink.id)) {
      const groupId = `modgrp_temp_${drink.id}`;
      await prisma.modifierGroup.upsert({
        where: { id: groupId },
        create: {
          id: groupId,
          itemId: drink.id,
          name: "Temperature",
          required: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: 1
        },
        update: {}
      });
      await prisma.modifierOption.createMany({
        data: [
          {
            id: `modopt_hot_${drink.id}`,
            groupId,
            name: "Hot",
            priceDeltaCents: 0,
            sortOrder: 1,
            isDefault: true
          },
          {
            id: `modopt_cold_${drink.id}`,
            groupId,
            name: "Cold (+$1.10)",
            priceDeltaCents: 110,
            sortOrder: 2,
            isDefault: false
          }
        ],
        skipDuplicates: true
      });
    }

    if (!noSugarModifierDrinkIds.has(drink.id)) {
      const sugarGroupId = `modgrp_sugar_${drink.id}`;
      await prisma.modifierGroup.upsert({
        where: { id: sugarGroupId },
        create: {
          id: sugarGroupId,
          itemId: drink.id,
          name: "Sugar Level",
          required: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: 2
        },
        update: {}
      });
      await prisma.modifierOption.createMany({
        data: [
          {
            id: `modopt_sugar_regular_${drink.id}`,
            groupId: sugarGroupId,
            name: "Regular",
            priceDeltaCents: 0,
            sortOrder: 1,
            isDefault: true
          },
          {
            id: `modopt_sugar_less_${drink.id}`,
            groupId: sugarGroupId,
            name: "Less Sugar",
            priceDeltaCents: 0,
            sortOrder: 2,
            isDefault: false
          },
          {
            id: `modopt_sugar_none_${drink.id}`,
            groupId: sugarGroupId,
            name: "No Sugar",
            priceDeltaCents: 0,
            sortOrder: 3,
            isDefault: false
          }
        ],
        skipDuplicates: true
      });
    }

    if (drink.id === "drink_soft") {
      const softChoiceGroupId = `modgrp_soft_choice_${drink.id}`;
      await prisma.modifierGroup.upsert({
        where: { id: softChoiceGroupId },
        create: {
          id: softChoiceGroupId,
          itemId: drink.id,
          name: "Soft Drink Choice",
          required: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: 3
        },
        update: {}
      });
      await prisma.modifierOption.createMany({
        data: [
          {
            id: `modopt_soft_coke_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "Coke",
            priceDeltaCents: 0,
            sortOrder: 1,
            isDefault: true
          },
          {
            id: `modopt_soft_sprite_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "Sprite",
            priceDeltaCents: 0,
            sortOrder: 2,
            isDefault: false
          },
          {
            id: `modopt_soft_diet_coke_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "Diet Coke",
            priceDeltaCents: 0,
            sortOrder: 3,
            isDefault: false
          },
          {
            id: `modopt_soft_ginger_ale_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "Ginger Ale",
            priceDeltaCents: 0,
            sortOrder: 4,
            isDefault: false
          }
        ],
        skipDuplicates: true
      });
    }
  }

  if (IS_RESET_MODE) {
    await prisma.modifierGroup.deleteMany({
      where: {
        name: "Temperature",
        itemId: {
          in: ["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]
        }
      }
    });
  }

  const drinkBundleEligibleItems = scrapedItems.filter(
    (item) => !item.isComboOnly && hasDrinkIncludeDescription(item.description)
  );

  for (const item of drinkBundleEligibleItems) {
    const groupId = `modgrp_add_drink_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: groupId },
      create: {
        id: groupId,
        itemId: item.id,
        name: "Add Drink",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 99
      },
      update: {}
    });

    await prisma.modifierOption.createMany({
      data: manualDrinks.map((drink, idx) => ({
        id: `modopt_add_drink_${item.id}_${drink.id}`,
        groupId,
        name: drink.name,
        priceDeltaCents: 0,
        sortOrder: idx + 1,
        isDefault: false
      })),
      skipDuplicates: true
    });

    const tempGroupId = `modgrp_add_drink_temp_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: tempGroupId },
      create: {
        id: tempGroupId,
        itemId: item.id,
        name: "Add Drink Temperature",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 100
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_add_drink_temp_hot_${item.id}`,
          groupId: tempGroupId,
          name: "Hot",
          priceDeltaCents: 0,
          sortOrder: 1,
          isDefault: false
        },
        {
          id: `modopt_add_drink_temp_cold_${item.id}`,
          groupId: tempGroupId,
          name: "Cold",
          priceDeltaCents: 0,
          sortOrder: 2,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });

    const sugarGroupId = `modgrp_add_drink_sugar_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: sugarGroupId },
      create: {
        id: sugarGroupId,
        itemId: item.id,
        name: "Add Drink Sugar Level",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 101
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_add_drink_sugar_regular_${item.id}`,
          groupId: sugarGroupId,
          name: "Regular",
          priceDeltaCents: 0,
          sortOrder: 1,
          isDefault: false
        },
        {
          id: `modopt_add_drink_sugar_less_${item.id}`,
          groupId: sugarGroupId,
          name: "Less Sugar",
          priceDeltaCents: 0,
          sortOrder: 2,
          isDefault: false
        },
        {
          id: `modopt_add_drink_sugar_none_${item.id}`,
          groupId: sugarGroupId,
          name: "No Sugar",
          priceDeltaCents: 0,
          sortOrder: 3,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });
  }

  const congeeAddonEligibleItems = scrapedItems.filter(
    (item) =>
      !item.isComboOnly &&
      Boolean(item.description && item.description.includes(CONGEE_ADDON_NOTE_ZH))
  );

  for (const item of congeeAddonEligibleItems) {
    const friedGroupId = `modgrp_congee_fried_dough_qty_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: friedGroupId },
      create: {
        id: friedGroupId,
        itemId: item.id,
        name: "Add Fried Dough Sticks",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 110
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_congee_fried_dough_qty_1_${item.id}`,
          groupId: friedGroupId,
          name: "1 pc",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS,
          sortOrder: 1,
          isDefault: false
        },
        {
          id: `modopt_congee_fried_dough_qty_2_${item.id}`,
          groupId: friedGroupId,
          name: "2 pcs",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS * 2,
          sortOrder: 2,
          isDefault: false
        },
        {
          id: `modopt_congee_fried_dough_qty_3_${item.id}`,
          groupId: friedGroupId,
          name: "3 pcs",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS * 3,
          sortOrder: 3,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });

    const pastryGroupId = `modgrp_congee_oxtail_pastry_qty_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: pastryGroupId },
      create: {
        id: pastryGroupId,
        itemId: item.id,
        name: "Add Ox-tail Pastry",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 111
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_congee_oxtail_pastry_qty_1_${item.id}`,
          groupId: pastryGroupId,
          name: "1 pc",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS,
          sortOrder: 1,
          isDefault: false
        },
        {
          id: `modopt_congee_oxtail_pastry_qty_2_${item.id}`,
          groupId: pastryGroupId,
          name: "2 pcs",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS * 2,
          sortOrder: 2,
          isDefault: false
        },
        {
          id: `modopt_congee_oxtail_pastry_qty_3_${item.id}`,
          groupId: pastryGroupId,
          name: "3 pcs",
          priceDeltaCents: CONGEE_ADDON_PRICE_CENTS * 3,
          sortOrder: 3,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });
  }

  const teaTimeSelectionItems = scrapedItems.flatMap((item) =>
    TEA_TIME_SELECTION_RULES.filter((rule) => rule.match(item.name)).map((rule) => ({
      item,
      rule
    }))
  );

  for (const { item, rule } of teaTimeSelectionItems) {
    const groupId = `modgrp_${rule.idSuffix}_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: groupId },
      create: {
        id: groupId,
        itemId: item.id,
        name: rule.groupName,
        required: true,
        minSelect: rule.minSelect,
        maxSelect: rule.maxSelect,
        sortOrder: rule.sortOrder
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: rule.options.map((name, idx) => ({
        id: `modopt_${rule.idSuffix}_${item.id}_${idx + 1}`,
        groupId,
        name,
        priceDeltaCents: 0,
        sortOrder: idx + 1,
        isDefault: false
      })),
      skipDuplicates: true
    });
  }

  const combos = [
    { id: "combo_for_2", people: 2, basePriceCents: 3599 },
    { id: "combo_for_3", people: 3, basePriceCents: 5199 },
    { id: "combo_for_4", people: 4, basePriceCents: 6999 },
    { id: "combo_for_5", people: 5, basePriceCents: 8599 },
    { id: "combo_for_6", people: 6, basePriceCents: 10199 }
  ];

  for (const comboDef of combos) {
    const combo = await prisma.combo.upsert({
      where: { id: comboDef.id },
      create: {
        id: comboDef.id,
        name: `自選和菜（${comboDef.people}人） | Self-Selected Combo For ${comboDef.people}`,
        description: `Choose ${comboDef.people} dishes from Combo Special menu`,
        basePriceCents: comboDef.basePriceCents,
        isActive: true
      },
      update: IS_RESET_MODE
        ? {
            name: `自選和菜（${comboDef.people}人） | Self-Selected Combo For ${comboDef.people}`,
            description: `Choose ${comboDef.people} dishes from Combo Special menu`,
            basePriceCents: comboDef.basePriceCents,
            isActive: true
          }
        : {}
    });

    const group = await prisma.comboGroup.upsert({
      where: { id: `${combo.id}_dish_group` },
      create: {
        id: `${combo.id}_dish_group`,
        comboId: combo.id,
        name: `任選${comboDef.people}款菜式 | Choose ${comboDef.people}`,
        required: true,
        minSelect: comboDef.people,
        maxSelect: comboDef.people,
        sortOrder: 1
      },
      update: IS_RESET_MODE
        ? {
            name: `任選${comboDef.people}款菜式 | Choose ${comboDef.people}`,
            required: true,
            minSelect: comboDef.people,
            maxSelect: comboDef.people,
            sortOrder: 1
          }
        : {}
    });

    await prisma.comboOption.createMany({
      data: comboItems.map((item, index) => ({
        id: `${combo.id}_opt_${item.id}`,
        comboGroupId: group.id,
        optionType: ComboOptionType.ITEM,
        refId: item.id,
        priceDeltaCents: item.premiumUpgradeCents,
        allowModifiers: false,
        sortOrder: index + 1
      })),
      skipDuplicates: true
    });
  }

  await prisma.storeSettings.upsert({
    where: { id: "default" },
    update: IS_RESET_MODE
      ? {
          timezone: "America/Toronto",
          prepTimeMinutes: 25,
          slotIntervalMinutes: 10,
          storeHours: {
            "0": [{ open: "11:00", close: "21:00" }],
            "1": [{ open: "11:00", close: "21:00" }],
            "2": [{ open: "11:00", close: "21:00" }],
            "3": [{ open: "11:00", close: "21:00" }],
            "4": [{ open: "11:00", close: "22:00" }],
            "5": [{ open: "11:00", close: "22:00" }],
            "6": [{ open: "11:00", close: "21:00" }]
          },
          closedDates: []
        }
      : {},
    create: {
      id: "default",
      timezone: "America/Toronto",
      prepTimeMinutes: 25,
      slotIntervalMinutes: 10,
      storeHours: {
        "0": [{ open: "11:00", close: "21:00" }],
        "1": [{ open: "11:00", close: "21:00" }],
        "2": [{ open: "11:00", close: "21:00" }],
        "3": [{ open: "11:00", close: "21:00" }],
        "4": [{ open: "11:00", close: "22:00" }],
        "5": [{ open: "11:00", close: "22:00" }],
        "6": [{ open: "11:00", close: "21:00" }]
      },
      closedDates: []
    }
  });

  console.log(
    `Seeded (${SEED_MODE}) ${scrapedCategories.length} scraped categories, ${scrapedItems.length} scraped items, ${manualDrinks.length} drinks, ${comboItems.length} combo-only items, ${drinkBundleEligibleItems.length} drink-bundle items, ${congeeAddonEligibleItems.length} congee add-on items, ${teaTimeSelectionItems.length} tea-time selection items, and ${combos.length} combos.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
