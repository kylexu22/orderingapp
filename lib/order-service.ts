import {
  OrderLineType,
  PickupType,
  Prisma,
  SelectionKind
} from "@prisma/client";
import { getAsapReadyTime, getTodaySlots } from "@/lib/pickup";
import { prisma } from "@/lib/prisma";
import { getStoreOrderState } from "@/lib/store-status";
import { normalizePhoneToE164 } from "@/lib/twilio-verify";
import {
  CartLineInput,
  ComboSelectionInput,
  CreateOrderInput,
  ModifierSelectionInput,
  StoreHours
} from "@/lib/types";
import { roundToNearestNickel } from "@/lib/format";

function getTaxRate() {
  const parsed = Number(process.env.TAX_RATE ?? "0");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function generateOrderNumber(): Promise<string> {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let i = 0; i < 10; i += 1) {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `${datePart}-${suffix}`;
    const exists = await prisma.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true }
    });
    if (!exists) return candidate;
  }
  return `${datePart}-${Date.now().toString().slice(-4)}`;
}

function validateModifierSelections(params: {
  groups: Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; name: string; priceDeltaCents: number }>;
  }>;
  selected: ModifierSelectionInput[];
}) {
  const selectedByGroup = new Map<string, ModifierSelectionInput[]>();
  for (const sel of params.selected) {
    const arr = selectedByGroup.get(sel.groupId) ?? [];
    arr.push(sel);
    selectedByGroup.set(sel.groupId, arr);
  }

  const normalized: Array<{
    label: string;
    optionId: string;
    optionName: string;
    delta: number;
    sortOrder: number;
  }> = [];

  for (const group of params.groups) {
    const picks = selectedByGroup.get(group.id) ?? [];
    if (group.required && picks.length < Math.max(1, group.minSelect)) {
      throw new Error(`Modifier group "${group.name}" requires selections.`);
    }
    if (picks.length < group.minSelect || picks.length > group.maxSelect) {
      throw new Error(
        `Modifier group "${group.name}" needs ${group.minSelect}-${group.maxSelect} selections.`
      );
    }
    for (const [idx, pick] of picks.entries()) {
      const option = group.options.find((opt) => opt.id === pick.optionId);
      if (!option) {
        throw new Error(`Invalid modifier option in group "${group.name}".`);
      }
      normalized.push({
        label: group.name,
        optionId: option.id,
        optionName: option.name,
        delta: option.priceDeltaCents,
        sortOrder: idx
      });
    }
  }

  return normalized;
}

function calculateAddDrinkSurcharge(params: {
  item: {
    id: string;
    modifierGroups: Array<{
      id: string;
      name: string;
      options: Array<{ id: string; name: string }>;
    }>;
  };
  selected: ModifierSelectionInput[];
}) {
  const addDrinkGroup = params.item.modifierGroups.find(
    (g) => g.id === `modgrp_add_drink_${params.item.id}`
  );
  const addDrinkTempGroup = params.item.modifierGroups.find(
    (g) => g.id === `modgrp_add_drink_temp_${params.item.id}`
  );
  const addDrinkSugarGroup = params.item.modifierGroups.find(
    (g) => g.id === `modgrp_add_drink_sugar_${params.item.id}`
  );
  const addDrinkSoftChoiceGroup = params.item.modifierGroups.find(
    (g) => g.id === `modgrp_add_drink_soft_choice_${params.item.id}`
  );
  if (!addDrinkGroup) {
    return { surchargeCents: 0, surchargeLabel: null as string | null };
  }

  const selectedDrink = params.selected.filter((s) => s.groupId === addDrinkGroup.id);
  const selectedTemp = addDrinkTempGroup
    ? params.selected.filter((s) => s.groupId === addDrinkTempGroup.id)
    : [];
  const selectedSugar = addDrinkSugarGroup
    ? params.selected.filter((s) => s.groupId === addDrinkSugarGroup.id)
    : [];
  const selectedSoftChoice = addDrinkSoftChoiceGroup
    ? params.selected.filter((s) => s.groupId === addDrinkSoftChoiceGroup.id)
    : [];

  if (!selectedDrink.length) {
    if (selectedTemp.length || selectedSugar.length || selectedSoftChoice.length) {
      throw new Error("Choose a drink before selecting drink preferences.");
    }
    return { surchargeCents: 0, surchargeLabel: null as string | null };
  }

  const selectedDrinkOptionId = selectedDrink[0].optionId;
  const drinkIdPrefix = `modopt_add_drink_${params.item.id}_`;
  const selectedDrinkId = selectedDrinkOptionId.startsWith(drinkIdPrefix)
    ? selectedDrinkOptionId.slice(drinkIdPrefix.length)
    : "";

  if (selectedDrinkId === "none") {
    if (selectedTemp.length || selectedSugar.length || selectedSoftChoice.length) {
      throw new Error('Choose a specific drink before selecting drink preferences.');
    }
    return { surchargeCents: 0, surchargeLabel: null as string | null };
  }

  const coldOnlyDrinkIds = new Set(["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]);
  const noSugarDrinkIds = new Set([
    "drink_soft",
    "drink_soy_milk",
    "drink_lemon_sprite",
    "drink_lemon_coke",
    "drink_lemon_honey"
  ]);
  const effectiveTemp =
    coldOnlyDrinkIds.has(selectedDrinkId) ||
    selectedTemp.some((s) => s.optionId.includes("_temp_cold_"))
      ? "COLD"
      : "HOT";

  if (!coldOnlyDrinkIds.has(selectedDrinkId) && !selectedTemp.length) {
    throw new Error("Select a drink temperature.");
  }
  if (coldOnlyDrinkIds.has(selectedDrinkId) && selectedTemp.some((s) => s.optionId.includes("_temp_hot_"))) {
    throw new Error("Selected drink is only available cold.");
  }
  if (!noSugarDrinkIds.has(selectedDrinkId) && !selectedSugar.length) {
    throw new Error("Select a sugar level for selected drink.");
  }
  if (noSugarDrinkIds.has(selectedDrinkId) && selectedSugar.length) {
    throw new Error("Selected drink does not allow sugar level changes.");
  }
  if (selectedDrinkId === "drink_soft" && addDrinkSoftChoiceGroup && selectedSoftChoice.length === 0) {
    throw new Error("Select a soft drink option.");
  }
  if (selectedDrinkId !== "drink_soft" && selectedSoftChoice.length) {
    throw new Error("Soft drink options are only available when Soft Drink is selected.");
  }

  const surchargeExemptDrinkIds = new Set(["drink_soft", "drink_soy_milk"]);
  const surchargeCents =
    effectiveTemp === "COLD" && !surchargeExemptDrinkIds.has(selectedDrinkId) ? 150 : 0;

  return {
    surchargeCents,
    surchargeLabel: surchargeCents ? "Add Drink Temperature Surcharge" : null
  };
}

async function buildItemLine(line: Extract<CartLineInput, { lineType: "ITEM" }>) {
  const item = await prisma.item.findFirst({
    where: { id: line.refId, isActive: true, isComboOnly: false },
    include: {
      modifierGroups: {
        include: {
          options: true
        }
      }
    }
  });
  if (!item) throw new Error("Item no longer available.");
  if (line.qty <= 0) throw new Error("Invalid quantity.");

  const normalizedModifiers = validateModifierSelections({
    groups: item.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaCents: o.priceDeltaCents
      }))
    })),
    selected: line.modifiers ?? []
  });

  const drinkSurcharge = calculateAddDrinkSurcharge({
    item: {
      id: item.id,
      modifierGroups: item.modifierGroups.map((g) => ({
        id: g.id,
        name: g.name,
        options: g.options.map((o) => ({ id: o.id, name: o.name }))
      }))
    },
    selected: line.modifiers ?? []
  });

  const modifierTotal =
    normalizedModifiers.reduce((acc, m) => acc + m.delta, 0) + drinkSurcharge.surchargeCents;
  const lineUnit = item.basePriceCents + modifierTotal;
  const lineTotal = lineUnit * line.qty;

  return {
    lineTotal,
    createInput: {
      lineType: OrderLineType.ITEM,
      refId: item.id,
      nameSnapshot: item.name,
      basePriceSnapshotCents: item.basePriceCents,
      qty: line.qty,
      lineTotalCents: lineTotal,
      selections: {
        create: [
          ...normalizedModifiers.map((m, i) => ({
            selectionKind: SelectionKind.MODIFIER,
            label: m.label,
            selectedModifierOptionNameSnapshot: m.optionName,
            selectedModifierOptionId: m.optionId,
            priceDeltaSnapshotCents: m.delta,
            sortOrder: i
          })),
          ...(drinkSurcharge.surchargeCents
            ? [
                {
                  selectionKind: SelectionKind.MODIFIER,
                  label: drinkSurcharge.surchargeLabel ?? "Drink Surcharge",
                  selectedModifierOptionNameSnapshot: "Cold (+$1.50)",
                  priceDeltaSnapshotCents: drinkSurcharge.surchargeCents,
                  sortOrder: 850
                }
              ]
            : []),
          ...(line.lineNote?.trim()
            ? [
                {
                  selectionKind: SelectionKind.MODIFIER,
                  label: "Additional Notes",
                  selectedModifierOptionNameSnapshot: line.lineNote.trim(),
                  priceDeltaSnapshotCents: 0,
                  sortOrder: 900
                }
              ]
            : [])
        ]
      }
    } satisfies Prisma.OrderLineUncheckedCreateWithoutOrderInput
  };
}

async function resolveComboSelectedItem(
  selection: ComboSelectionInput,
  option: { optionType: "ITEM" | "CATEGORY"; refId: string }
) {
  if (option.optionType === "ITEM") {
    const item = await prisma.item.findFirst({ where: { id: option.refId, isActive: true } });
    if (!item) throw new Error("Combo item option unavailable.");
    return item;
  }
  if (!selection.selectedItemId) {
    throw new Error("Combo category selection requires an item choice.");
  }
  const item = await prisma.item.findFirst({
    where: { id: selection.selectedItemId, isActive: true }
  });
  if (!item || item.categoryId !== option.refId) {
    throw new Error("Invalid combo category item selection.");
  }
  return item;
}

async function buildComboLine(line: Extract<CartLineInput, { lineType: "COMBO" }>) {
  const combo = await prisma.combo.findFirst({
    where: { id: line.refId, isActive: true },
    include: {
      groups: {
        include: {
          options: true
        }
      }
    }
  });
  if (!combo) throw new Error("Combo no longer available.");
  if (line.qty <= 0) throw new Error("Invalid quantity.");

  const selectedByGroup = new Map<string, ComboSelectionInput[]>();
  for (const selection of line.comboSelections ?? []) {
    const arr = selectedByGroup.get(selection.comboGroupId) ?? [];
    arr.push(selection);
    selectedByGroup.set(selection.comboGroupId, arr);
  }

  const selectionCreates: Prisma.OrderSelectionUncheckedCreateWithoutOrderLineInput[] = [];
  let addonsTotal = 0;

  for (const group of combo.groups) {
    const picks = selectedByGroup.get(group.id) ?? [];
    if (group.required && picks.length < Math.max(1, group.minSelect)) {
      throw new Error(`Combo group "${group.name}" requires selections.`);
    }
    if (picks.length < group.minSelect || picks.length > group.maxSelect) {
      throw new Error(
        `Combo group "${group.name}" needs ${group.minSelect}-${group.maxSelect} selections.`
      );
    }
    for (const [pickIndex, pick] of picks.entries()) {
      const option = group.options.find((opt) => opt.id === pick.comboOptionId);
      if (!option) throw new Error(`Invalid combo option in "${group.name}".`);

      const selectedItem = await resolveComboSelectedItem(pick, {
        optionType: option.optionType,
        refId: option.refId
      });
      addonsTotal += option.priceDeltaCents;

      selectionCreates.push({
        selectionKind: SelectionKind.COMBO_PICK,
        label: group.name,
        selectedItemNameSnapshot: selectedItem.name,
        selectedItemId: selectedItem.id,
        priceDeltaSnapshotCents: option.priceDeltaCents,
        sortOrder: pickIndex
      });

      if (option.allowModifiers) {
        const groups = await prisma.modifierGroup.findMany({
          where: { itemId: selectedItem.id },
          include: { options: true }
        });
        const normalizedModifiers = validateModifierSelections({
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            required: g.required,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            options: g.options.map((o) => ({
              id: o.id,
              name: o.name,
              priceDeltaCents: o.priceDeltaCents
            }))
          })),
          selected: pick.modifiers ?? []
        });
        for (const [modIndex, mod] of normalizedModifiers.entries()) {
          addonsTotal += mod.delta;
          selectionCreates.push({
            selectionKind: SelectionKind.MODIFIER,
            label: `${selectedItem.name} / ${mod.label}`,
            selectedModifierOptionNameSnapshot: mod.optionName,
            selectedModifierOptionId: mod.optionId,
            priceDeltaSnapshotCents: mod.delta,
            sortOrder: modIndex
          });
        }
      }
    }
  }

  const lineUnit = combo.basePriceCents + addonsTotal;
  const lineTotal = lineUnit * line.qty;

  return {
    lineTotal,
    createInput: {
      lineType: OrderLineType.COMBO,
      refId: combo.id,
      nameSnapshot: combo.name,
      basePriceSnapshotCents: combo.basePriceCents,
      qty: line.qty,
      lineTotalCents: lineTotal,
      selections: {
        create: [
          ...selectionCreates,
          ...(line.lineNote?.trim()
            ? [
                {
                  selectionKind: SelectionKind.MODIFIER,
                  label: "Additional Notes",
                  selectedModifierOptionNameSnapshot: line.lineNote.trim(),
                  priceDeltaSnapshotCents: 0,
                  sortOrder: 900
                }
              ]
            : [])
        ]
      }
    } satisfies Prisma.OrderLineUncheckedCreateWithoutOrderInput
  };
}

async function resolvePickup(
  input: CreateOrderInput,
  settingsParam?: {
    prepTimeMinutes: number;
    slotIntervalMinutes: number;
    storeHours: Prisma.JsonValue;
    closedDates: Prisma.JsonValue;
  }
) {
  const settings =
    settingsParam ??
    (await prisma.storeSettings.findUnique({ where: { id: "default" } }));
  if (!settings) throw new Error("Store settings missing.");

  const now = new Date();
  if (input.pickupType === PickupType.ASAP) {
    return {
      pickupType: PickupType.ASAP,
      pickupTime: null,
      estimatedReadyTime: getAsapReadyTime({
        now,
        prepTimeMinutes: settings.prepTimeMinutes,
        slotIntervalMinutes: settings.slotIntervalMinutes
      })
    };
  }

  if (!input.pickupTime) throw new Error("Pickup time is required.");
  const pickupDate = new Date(input.pickupTime);
  if (Number.isNaN(pickupDate.getTime())) throw new Error("Invalid pickup time.");

  const slots = getTodaySlots({
    now,
    prepTimeMinutes: settings.prepTimeMinutes,
    slotIntervalMinutes: settings.slotIntervalMinutes,
    storeHours: settings.storeHours as StoreHours,
    closedDates: settings.closedDates as string[]
  });
  const isValidSlot = slots.some((slot) => slot.getTime() === pickupDate.getTime());
  if (!isValidSlot) throw new Error("Selected pickup slot is unavailable.");

  return {
    pickupType: PickupType.SCHEDULED,
    pickupTime: pickupDate,
    estimatedReadyTime: null
  };
}

export async function createOrder(input: CreateOrderInput) {
  if (!input.customerName?.trim()) throw new Error("Customer name is required.");
  const normalizedEmail = input.email?.trim();
  if (!normalizedEmail) throw new Error("Email is required.");
  const normalizedPhone = normalizePhoneToE164(input.phone ?? "");
  if (!normalizedPhone) throw new Error("Phone number is invalid.");
  if (input.honeypot?.trim()) throw new Error("Spam check failed.");
  if (!input.lines?.length) throw new Error("Cart is empty.");

  const settings = await prisma.storeSettings.findUnique({ where: { id: "default" } });
  if (!settings) throw new Error("Store settings missing.");
  const storeOrderState = getStoreOrderState({
    acceptingOrders: settings.acceptingOrders,
    timezone: settings.timezone,
    storeHours: settings.storeHours as StoreHours,
    closedDates: settings.closedDates as string[]
  });
  if (storeOrderState === "ORDERING_OFF") {
    throw new Error("We are not accepting orders right now.");
  }
  if (storeOrderState === "CLOSED") {
    throw new Error("The store is currently closed.");
  }

  const orderLines: Prisma.OrderLineUncheckedCreateWithoutOrderInput[] = [];
  let subtotalCents = 0;

  for (const line of input.lines) {
    const built =
      line.lineType === "ITEM" ? await buildItemLine(line) : await buildComboLine(line);
    orderLines.push(built.createInput);
    subtotalCents += built.lineTotal;
  }

  const taxCents = Math.round(subtotalCents * getTaxRate());
  const totalCents = roundToNearestNickel(subtotalCents + taxCents);
  const pickup = await resolvePickup(input, settings);
  const orderNumber = await generateOrderNumber();
  const customer = await prisma.customer.upsert({
    where: { phone: normalizedPhone },
    create: {
      phone: normalizedPhone,
      name: input.customerName.trim(),
      email: normalizedEmail
    },
    update: {
      name: input.customerName.trim(),
      email: normalizedEmail
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerName: customer.name,
      phone: normalizedPhone,
      notes: input.notes?.trim() || null,
      pickupType: pickup.pickupType,
      pickupTime: pickup.pickupTime,
      estimatedReadyTime: pickup.estimatedReadyTime,
      subtotalCents,
      taxCents,
      totalCents,
      customerId: customer.id,
      lines: {
        create: orderLines
      }
    },
    include: {
      customer: {
        select: {
          email: true
        }
      },
      lines: {
        include: {
          selections: true
        }
      }
    }
  });

  return order;
}
