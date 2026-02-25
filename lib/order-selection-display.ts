import { centsToCurrency } from "@/lib/format";

export type SelectionLike = {
  id: string;
  selectionKind: "COMBO_PICK" | "MODIFIER";
  label: string;
  selectedItemNameSnapshot: string | null;
  selectedModifierOptionNameSnapshot: string | null;
  selectedModifierOptionId?: string | null;
  priceDeltaSnapshotCents: number;
};

export type FormattedSelectionLine = {
  key: string;
  text: string;
  indent: 0 | 1;
};

function classifyDrinkSelection(selection: SelectionLike) {
  const label = (selection.label ?? "").toLowerCase();
  const optionId = (selection.selectedModifierOptionId ?? "").toLowerCase();

  if (optionId.startsWith("modopt_add_drink_") || /add drink|加配飲品|飲品/.test(label)) {
    if (/soft drink choice|汽水選擇/.test(label)) return "soft_choice" as const;
    if (/temperature|溫度|凍飲|drink surcharge|surcharge/.test(label)) return "temp_or_surcharge" as const;
    if (/sugar|甜度/.test(label)) return "sugar" as const;
    return "drink" as const;
  }
  return null;
}

function isNoneDrink(value: string | null | undefined, optionId?: string | null) {
  const raw = (value ?? "").toLowerCase();
  const id = (optionId ?? "").toLowerCase();
  return id.includes("_none") || /\bnone\b|不要|不需要|無/.test(raw);
}

export function formatOrderSelectionsForDisplay(params: {
  selections: SelectionLike[];
  lang: "en" | "zh";
  localize: (value: string | null | undefined) => string;
}) {
  const { selections, lang, localize } = params;
  const baseLines: FormattedSelectionLine[] = [];
  let firstDrinkInsertIndex: number | null = null;

  let drinkMain: SelectionLike | null = null;
  let drinkTempOrSurcharge: SelectionLike | null = null;
  let drinkSugar: SelectionLike | null = null;
  let drinkSoftChoice: SelectionLike | null = null;
  let drinkSurchargeExtraCents = 0;

  for (const selection of selections) {
    if (selection.selectionKind === "COMBO_PICK") {
      const selected = localize(selection.selectedItemNameSnapshot);
      const delta = selection.priceDeltaSnapshotCents
        ? ` (${centsToCurrency(selection.priceDeltaSnapshotCents)})`
        : "";
      baseLines.push({
        key: selection.id,
        text: `${selected}${delta}`,
        indent: 0
      });
      continue;
    }

    const drinkKind = classifyDrinkSelection(selection);
    if (drinkKind) {
      if (firstDrinkInsertIndex === null) firstDrinkInsertIndex = baseLines.length;
      if (drinkKind === "drink") drinkMain = selection;
      if (drinkKind === "soft_choice") drinkSoftChoice = selection;
      if (drinkKind === "sugar") drinkSugar = selection;
      if (drinkKind === "temp_or_surcharge") {
        const isSurchargeOnly = /surcharge|凍飲/.test((selection.label ?? "").toLowerCase());
        if (isSurchargeOnly && !selection.selectedModifierOptionNameSnapshot?.toLowerCase().includes("cold")) {
          drinkSurchargeExtraCents += selection.priceDeltaSnapshotCents;
        } else {
          drinkTempOrSurcharge = selection;
        }
      }
      continue;
    }

    const label = localize(selection.label);
    const selected = localize(selection.selectedModifierOptionNameSnapshot);
    const delta = selection.priceDeltaSnapshotCents
      ? ` (${centsToCurrency(selection.priceDeltaSnapshotCents)})`
      : "";
    baseLines.push({
      key: selection.id,
      text: `${label}: ${selected}${delta}`,
      indent: 0
    });
  }

  const drinkLines: FormattedSelectionLine[] = [];
  const mainDrinkValue = drinkMain?.selectedModifierOptionNameSnapshot;
  const mainDrinkOptionId = drinkMain?.selectedModifierOptionId;
  const hideDrink = isNoneDrink(mainDrinkValue, mainDrinkOptionId);

  if (drinkMain && !hideDrink) {
    const softChoiceName = drinkSoftChoice ? localize(drinkSoftChoice.selectedModifierOptionNameSnapshot) : "";
    const mainDrinkName = localize(mainDrinkValue);
    const useSoftChoiceAsMain = Boolean(softChoiceName);
    const drinkPrefix = lang === "zh" ? "飲品" : "Drink";

    drinkLines.push({
      key: `drink-main-${drinkMain.id}`,
      text: useSoftChoiceAsMain ? softChoiceName : `${drinkPrefix}: ${mainDrinkName}`,
      indent: 0
    });

    const tempDelta =
      (drinkTempOrSurcharge?.priceDeltaSnapshotCents ?? 0) + drinkSurchargeExtraCents;
    const isSoftDrink = /soft drink|汽水/i.test(mainDrinkValue ?? "") || Boolean(softChoiceName);
    if (drinkTempOrSurcharge && !isSoftDrink) {
      const tempName = localize(drinkTempOrSurcharge.selectedModifierOptionNameSnapshot);
      const delta = tempDelta ? ` (${centsToCurrency(tempDelta)})` : "";
      drinkLines.push({
        key: `drink-temp-${drinkTempOrSurcharge.id}`,
        text: `${tempName}${delta}`,
        indent: 1
      });
    }

    if (drinkSugar) {
      const sugarName = localize(drinkSugar.selectedModifierOptionNameSnapshot);
      const delta = drinkSugar.priceDeltaSnapshotCents
        ? ` (${centsToCurrency(drinkSugar.priceDeltaSnapshotCents)})`
        : "";
      drinkLines.push({
        key: `drink-sugar-${drinkSugar.id}`,
        text: `${sugarName}${delta}`,
        indent: 1
      });
    }
  }

  if (!drinkLines.length) return baseLines;
  const insertAt = firstDrinkInsertIndex ?? baseLines.length;
  return [...baseLines.slice(0, insertAt), ...drinkLines, ...baseLines.slice(insertAt)];
}

