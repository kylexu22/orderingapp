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

type ItemModifierRule = {
  idSuffix: string;
  match: (name: string) => boolean;
  groupName: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: Array<{ name: string; priceDeltaCents?: number; isDefault?: boolean }>;
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

const ITEM_MODIFIER_RULES: ItemModifierRule[] = [
  {
    idSuffix: "satay_choice",
    match: (name) =>
      /satay beef satay chicken\s*\/\s*noodles or rice noodles/i.test(name),
    groupName: "Choose Satay",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 40,
    options: [{ name: "Satay Beef" }, { name: "Satay Chicken" }]
  },
  {
    idSuffix: "satay_noodle_choice",
    match: (name) =>
      /satay beef satay chicken\s*\/\s*noodles or rice noodles/i.test(name),
    groupName: "Choose Noodle Type",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 41,
    options: [{ name: "Egg Noodles" }, { name: "Rice Noodles" }]
  },
  {
    idSuffix: "lo_mein_beef_or_wonton",
    match: (name) => /lo mein\s*\(beef brisket or wonton\)/i.test(name),
    groupName: "Choose Protein",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 42,
    options: [{ name: "Wonton" }, { name: "Beef Brisket" }]
  },
  {
    idSuffix: "beef_brisket_tendon_choice",
    match: (name) => /beef brisket\/beef tendon\/noodles or rice noodles/i.test(name),
    groupName: "Choose Beef",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 43,
    options: [{ name: "Beef Brisket" }, { name: "Beef Tendon" }]
  },
  {
    idSuffix: "beef_brisket_tendon_noodle_choice",
    match: (name) => /beef brisket\/beef tendon\/noodles or rice noodles/i.test(name),
    groupName: "Choose Noodle Type",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 44,
    options: [{ name: "Egg Noodles" }, { name: "Rice Noodles" }]
  },
  {
    idSuffix: "balls_choice",
    match: (name) =>
      /fish balls\/\s*beef balls\/\s*cattle fish balls noodles\s*\/rice noodles/i.test(name),
    groupName: "Choose Balls",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 45,
    options: [{ name: "Fish Balls" }, { name: "Beef Balls" }, { name: "Cuttlefish Balls" }]
  },
  {
    idSuffix: "balls_noodle_choice",
    match: (name) =>
      /fish balls\/\s*beef balls\/\s*cattle fish balls noodles\s*\/rice noodles/i.test(name),
    groupName: "Choose Noodle Type",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 46,
    options: [{ name: "Egg Noodles" }, { name: "Rice Noodles" }]
  },
  {
    idSuffix: "french_toast_spread",
    match: (name) => /french toast with butter and jam/i.test(name),
    groupName: "Choose Spread",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 47,
    options: [{ name: "Butter" }, { name: "Peanut Butter" }, { name: "Condensed Milk" }]
  },
  {
    idSuffix: "baked_combo_meat",
    match: (name) =>
      /pork chop\/chicken\/steak\s*\(black pepper\/ tomato \/ onion \/ garlic sauce\)/i.test(
        name
      ),
    groupName: "Choose Meat",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 48,
    options: [{ name: "Pork Chop" }, { name: "Chicken" }, { name: "Steak" }]
  },
  {
    idSuffix: "baked_combo_sauce",
    match: (name) =>
      /pork chop\/chicken\/steak\s*\(black pepper\/ tomato \/ onion \/ garlic sauce\)/i.test(
        name
      ),
    groupName: "Choose Sauce",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 49,
    options: [
      { name: "Black Pepper Sauce" },
      { name: "Tomato Sauce" },
      { name: "Onion Sauce" },
      { name: "Garlic Sauce" }
    ]
  },
  {
    idSuffix: "special_meal_base",
    match: (name) => /pork chop\/chicken \/ steak/i.test(name),
    groupName: "Choose Base",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 51,
    options: [{ name: "Rice" }, { name: "Spaghetti" }]
  },
  {
    idSuffix: "special_meal_meat",
    match: (name) => /pork chop\/chicken \/ steak/i.test(name),
    groupName: "Choose Meat",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 52,
    options: [{ name: "Pork Chop" }, { name: "Chicken" }, { name: "Steak" }]
  },
  {
    idSuffix: "special_meal_sauce",
    match: (name) => /pork chop\/chicken \/ steak/i.test(name),
    groupName: "Choose Sauce",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 53,
    options: [
      { name: "Black Pepper Sauce" },
      { name: "Tomato Sauce" },
      { name: "Onion Sauce" },
      { name: "Garlic Sauce" }
    ]
  },
  {
    idSuffix: "weekend_instant_noodle_pick_two",
    match: (name) =>
      /instant noodle in soup and pan fried egg .*pick two/i.test(name),
    groupName: "Choose Two",
    required: true,
    minSelect: 2,
    maxSelect: 2,
    sortOrder: 54,
    options: [
      { name: "Pan Fried Egg" },
      { name: "Luncheon Meat" },
      { name: "Satay Beef" },
      { name: "Red Sausage" },
      { name: "Ham" },
      { name: "Sausage" },
      { name: "Bacon" },
      { name: "Fish Fillet" }
    ]
  },
  {
    idSuffix: "weekend_ham_macaroni_base",
    match: (name) =>
      /ham macaroni or satay beef vermicelli with toast/i.test(name),
    groupName: "Choose Main",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 55,
    options: [{ name: "Ham Macaroni" }, { name: "Satay Beef Vermicelli" }]
  },
  {
    idSuffix: "weekend_ham_macaroni_pick_two",
    match: (name) =>
      /ham macaroni or satay beef vermicelli with toast/i.test(name),
    groupName: "Choose Two",
    required: true,
    minSelect: 2,
    maxSelect: 2,
    sortOrder: 56,
    options: [
      { name: "Pan Fried Egg" },
      { name: "Luncheon Meat" },
      { name: "Chicken Wing" },
      { name: "Red Sausage" },
      { name: "Ham" },
      { name: "Sausage" },
      { name: "Bacon" },
      { name: "Fish Fillet" }
    ]
  },
  {
    idSuffix: "weekend_toast_pick_four",
    match: (name) =>
      /toast with butter and pan fried egg .*pick four/i.test(name),
    groupName: "Choose Four",
    required: true,
    minSelect: 4,
    maxSelect: 4,
    sortOrder: 57,
    options: [
      { name: "Pan Fried Egg" },
      { name: "Luncheon Meat" },
      { name: "Chicken Wing" },
      { name: "Red Sausage" },
      { name: "Ham" },
      { name: "Sausage" },
      { name: "Bacon" },
      { name: "Fish Fillet" }
    ]
  },
  {
    idSuffix: "weekend_sausage_toast_pick_two",
    match: (name) =>
      /sausage\/ham\/red sausage .*two pan fried eggs .*pick two/i.test(name),
    groupName: "Choose Two",
    required: true,
    minSelect: 2,
    maxSelect: 2,
    sortOrder: 58,
    options: [
      { name: "Sausage" },
      { name: "Ham" },
      { name: "Red Sausage" },
      { name: "Luncheon Meat" },
      { name: "Two Pan Fried Eggs" }
    ]
  },
  {
    idSuffix: "weekend_congee_side_pick_one",
    match: (name) =>
      /minced beef congee with soya noodle \/ fried dough stick\/ox-tongue pastry/i.test(name),
    groupName: "Choose One",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 59,
    options: [{ name: "Soya Noodle" }, { name: "Fried Dough Stick" }, { name: "Ox-tongue Pastry" }]
  },
  {
    idSuffix: "hotplate_scallop_meat",
    match: (name) => /scallop and \(pork chop\/chicken\/steak\)/i.test(name),
    groupName: "Choose Meat",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 60,
    options: [{ name: "Pork Chop" }, { name: "Chicken" }, { name: "Steak" }]
  },
  {
    idSuffix: "hotplate_sirloin_side",
    match: (name) =>
      /grilled sirloin steak served with rice, spaghetti, fries or mixed vegetables/i.test(name),
    groupName: "Choose Side",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 61,
    options: [{ name: "Rice" }, { name: "Spaghetti" }, { name: "Fries" }, { name: "Mixed Vegetables" }]
  },
  {
    idSuffix: "house_special_ribs_base",
    match: (name) =>
      /rice\/lo mein with spare ribs in honey & pepper sauce/i.test(name),
    groupName: "Choose Base",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 62,
    options: [{ name: "Rice" }, { name: "Lo Mein" }]
  },
  {
    idSuffix: "spare_ribs_black_bean_noodle",
    match: (name) =>
      /fried noodle or rice noodle with spare ribs in black bean sauce/i.test(name),
    groupName: "Choose Noodle Type",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 63,
    options: [{ name: "Fried Egg Noodle" }, { name: "Rice Noodle" }]
  },
  {
    idSuffix: "beef_black_bean_noodle",
    match: (name) =>
      /fried noodle or rice noodle with beef in black bean sauce/i.test(name),
    groupName: "Choose Noodle Type",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 64,
    options: [{ name: "Fried Egg Noodle" }, { name: "Rice Noodle" }]
  },
  {
    idSuffix: "malaysian_shrimp_minced_pork_base",
    match: (name) =>
      /fried rice or vermicelli with shrimps & minced pork \(malaysian style\)/i.test(name),
    groupName: "Choose Base",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 65,
    options: [{ name: "Fried Rice" }, { name: "Vermicelli" }]
  }
];
const SEED_MODE = process.env.SEED_MODE === "reset" ? "reset" : "sync";
const IS_RESET_MODE = SEED_MODE === "reset";

const manualDrinksCategory = {
  id: "cat_manual_drinks",
  name: "Drinks"
} as const;

const manualDrinks = [
  { id: "drink_soft", name: "汽水 | Soft Drink", basePriceCents: 230 },
  { id: "drink_hk_milk_tea", name: "港式奶茶 | HK Style Milk Tea", basePriceCents: 330 },
  { id: "drink_coffee", name: "咖啡 | Coffee", basePriceCents: 330 },
  { id: "drink_mixed_coffee_tea", name: "鴛鴦 | Mixed Coffee & Tea", basePriceCents: 330 },
  { id: "drink_ovaltine", name: "阿華田 | Ovaltine", basePriceCents: 330 },
  { id: "drink_horlick", name: "好立克 | Horlick", basePriceCents: 330 },
  { id: "drink_chocolate", name: "朱古力 | Chocolate Drink", basePriceCents: 330 },
  { id: "drink_almond", name: "杏仁露 | Almond Drink", basePriceCents: 330 },
  { id: "drink_lemon_tea", name: "檸檬茶 | Lemon Tea", basePriceCents: 330 },
  { id: "drink_lemon_water", name: "檸檬水 | Lemon Water", basePriceCents: 330 },
  { id: "drink_lemon_coffee", name: "檸檬咖啡 | Lemon Coffee", basePriceCents: 330 },
  { id: "drink_lemon_honey", name: "檸蜜 | Lemon Honey", basePriceCents: 330 },
  { id: "drink_lemon_coke", name: "檸檬可樂 | Lemon Coke", basePriceCents: 410 },
  { id: "drink_lemon_sprite", name: "檸檬雪碧 | Lemon Sprite", basePriceCents: 410 },
  { id: "drink_soy_milk", name: "豆奶 | Soy Milk", basePriceCents: 255 }
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
            name: drink.id === "drink_soy_milk" ? "熱 (+$0.35) | Hot (+$0.35)" : "熱 | Hot",
            priceDeltaCents: drink.id === "drink_soy_milk" ? 35 : 0,
            sortOrder: 1,
            isDefault: drink.id !== "drink_soy_milk"
          },
          {
            id: `modopt_cold_${drink.id}`,
            groupId,
            name: drink.id === "drink_soy_milk" ? "凍 | Cold" : "凍 (+$1.10) | Cold (+$1.10)",
            priceDeltaCents: drink.id === "drink_soy_milk" ? 0 : 110,
            sortOrder: 2,
            isDefault: drink.id === "drink_soy_milk"
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
            name: "可口可樂 | Coke",
            priceDeltaCents: 0,
            sortOrder: 1,
            isDefault: true
          },
          {
            id: `modopt_soft_sprite_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "雪碧 | Sprite",
            priceDeltaCents: 0,
            sortOrder: 2,
            isDefault: false
          },
          {
            id: `modopt_soft_diet_coke_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "健怡可樂 | Diet Coke",
            priceDeltaCents: 0,
            sortOrder: 3,
            isDefault: false
          },
          {
            id: `modopt_soft_ginger_ale_${drink.id}`,
            groupId: softChoiceGroupId,
            name: "薑汁汽水 | Ginger Ale",
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
      data: [
        {
          id: `modopt_add_drink_${item.id}_none`,
          groupId,
          name: "None",
          priceDeltaCents: 0,
          sortOrder: 0,
          isDefault: true
        },
        ...manualDrinks.map((drink, idx) => ({
          id: `modopt_add_drink_${item.id}_${drink.id}`,
          groupId,
          name: drink.name,
          priceDeltaCents: 0,
          sortOrder: idx + 1,
          isDefault: false
        }))
      ],
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

    const softChoiceGroupId = `modgrp_add_drink_soft_choice_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: softChoiceGroupId },
      create: {
        id: softChoiceGroupId,
        itemId: item.id,
        name: "加配飲品：汽水選擇 | Add Drink Soft Drink Choice",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 102
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
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

  const itemModifierSelectionItems = scrapedItems.flatMap((item) =>
    ITEM_MODIFIER_RULES.filter((rule) => rule.match(item.name)).map((rule) => ({ item, rule }))
  );

  for (const { item, rule } of itemModifierSelectionItems) {
    const groupId = `modgrp_${rule.idSuffix}_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: groupId },
      create: {
        id: groupId,
        itemId: item.id,
        name: rule.groupName,
        required: rule.required,
        minSelect: rule.minSelect,
        maxSelect: rule.maxSelect,
        sortOrder: rule.sortOrder
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: rule.options.map((option, idx) => ({
        id: `modopt_${rule.idSuffix}_${item.id}_${idx + 1}`,
        groupId,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents ?? 0,
        sortOrder: idx + 1,
        isDefault: option.isDefault ?? false
      })),
      skipDuplicates: true
    });
  }

  const bakedComboCategoryIds = new Set(
    scrapedCategories
      .filter((c) => c.name.toUpperCase().includes("BAKED RICE/SPAGHETTI COMBO"))
      .map((c) => c.id)
  );
  const bakedComboItems = scrapedItems.filter((item) => bakedComboCategoryIds.has(item.categoryId));

  for (const item of bakedComboItems) {
    const groupId = `modgrp_baked_combo_base_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: groupId },
      create: {
        id: groupId,
        itemId: item.id,
        name: "Choose Base",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 50
      },
      update: {}
    });
    await prisma.modifierOption.createMany({
      data: [
        {
          id: `modopt_baked_combo_base_rice_${item.id}`,
          groupId,
          name: "Rice",
          priceDeltaCents: 0,
          sortOrder: 1,
          isDefault: false
        },
        {
          id: `modopt_baked_combo_base_spaghetti_${item.id}`,
          groupId,
          name: "Spaghetti",
          priceDeltaCents: 0,
          sortOrder: 2,
          isDefault: false
        }
      ],
      skipDuplicates: true
    });
  }

  const hotPlateCategoryIds = new Set(
    scrapedCategories
      .filter((c) => c.name.toUpperCase().includes("HOT PLATE COMBO"))
      .map((c) => c.id)
  );
  const hotPlateItems = scrapedItems.filter((item) => hotPlateCategoryIds.has(item.categoryId));

  for (const item of hotPlateItems) {
    await prisma.modifierGroup.deleteMany({
      where: { id: `modgrp_hotplate_sirloin_side_${item.id}` }
    });

    const sideGroupId = `modgrp_hotplate_side_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: sideGroupId },
      create: {
        id: sideGroupId,
        itemId: item.id,
        name: "Choose Side (Choose 1)",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 61
      },
      update: {
        name: "Choose Side (Choose 1)",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 61
      }
    });

    const sideOptions = ["Rice", "Spaghetti", "Fries", "Mixed Vegetables"];
    for (const [index, optionName] of sideOptions.entries()) {
      await prisma.modifierOption.upsert({
        where: { id: `modopt_hotplate_side_${item.id}_${index + 1}` },
        create: {
          id: `modopt_hotplate_side_${item.id}_${index + 1}`,
          groupId: sideGroupId,
          name: optionName,
          priceDeltaCents: 0,
          sortOrder: index + 1,
          isDefault: false
        },
        update: {
          groupId: sideGroupId,
          name: optionName,
          priceDeltaCents: 0,
          sortOrder: index + 1,
          isDefault: false
        }
      });
    }

    const sauceGroupId = `modgrp_hotplate_sauce_${item.id}`;
    await prisma.modifierGroup.upsert({
      where: { id: sauceGroupId },
      create: {
        id: sauceGroupId,
        itemId: item.id,
        name: "Choose Sauce (Choose 1)",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 62
      },
      update: {
        name: "Choose Sauce (Choose 1)",
        required: true,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: 62
      }
    });

    const sauceOptions = ["BBQ", "Garlic", "Onion", "Tomato", "Black Pepper"];
    for (const [index, optionName] of sauceOptions.entries()) {
      await prisma.modifierOption.upsert({
        where: { id: `modopt_hotplate_sauce_${item.id}_${index + 1}` },
        create: {
          id: `modopt_hotplate_sauce_${item.id}_${index + 1}`,
          groupId: sauceGroupId,
          name: optionName,
          priceDeltaCents: 0,
          sortOrder: index + 1,
          isDefault: false
        },
        update: {
          groupId: sauceGroupId,
          name: optionName,
          priceDeltaCents: 0,
          sortOrder: index + 1,
          isDefault: false
        }
      });
    }
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
          closedDates: [],
          acceptingOrders: true,
          autoPrintEnabled: false,
          defaultAutoPrintPrinterId: null,
          receiptDebugMode: false
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
      closedDates: [],
      acceptingOrders: true,
      autoPrintEnabled: false,
      defaultAutoPrintPrinterId: null,
      receiptDebugMode: false
    }
  });

  console.log(
    `Seeded (${SEED_MODE}) ${scrapedCategories.length} scraped categories, ${scrapedItems.length} scraped items, ${manualDrinks.length} drinks, ${comboItems.length} combo-only items, ${drinkBundleEligibleItems.length} drink-bundle items, ${congeeAddonEligibleItems.length} congee add-on items, ${teaTimeSelectionItems.length} tea-time selection items, ${itemModifierSelectionItems.length} item-level selection rules, ${bakedComboItems.length} baked-combo base rules, ${hotPlateItems.length} hot-plate side/sauce rules, and ${combos.length} combos.`
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
