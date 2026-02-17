"use client";

import { useEffect, useMemo, useState } from "react";
import { ModifierGroup, ModifierOption } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";
import { localizeText, type Lang } from "@/lib/i18n";

type GroupWithOptions = ModifierGroup & { options: ModifierOption[] };
const COLD_ONLY_DRINK_IDS = new Set(["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]);
const NO_SUGAR_DRINK_IDS = new Set([
  "drink_soft",
  "drink_soy_milk",
  "drink_lemon_sprite",
  "drink_lemon_coke",
  "drink_lemon_honey"
]);
const COLD_SURCHARGE_EXEMPT_DRINK_IDS = new Set(["drink_soft", "drink_soy_milk"]);

export function ItemBuilder({
  item,
  lang
}: {
  item: {
    id: string;
    name: string;
    basePriceCents: number;
    modifierGroups: GroupWithOptions[];
  };
  lang: Lang;
}) {
  const router = useRouter();
  const { addLine } = useCart();
  const [qty, setQty] = useState(1);
  const [lineNote, setLineNote] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");

  const addDrinkGroupId = `modgrp_add_drink_${item.id}`;
  const addDrinkTempGroupId = `modgrp_add_drink_temp_${item.id}`;
  const addDrinkSugarGroupId = `modgrp_add_drink_sugar_${item.id}`;
  const addDrinkSoftChoiceGroupId = `modgrp_add_drink_soft_choice_${item.id}`;
  const addDrinkGroup = item.modifierGroups.find((group) => group.id === addDrinkGroupId);
  const addDrinkTempGroup = item.modifierGroups.find((group) => group.id === addDrinkTempGroupId);
  const addDrinkSugarGroup = item.modifierGroups.find((group) => group.id === addDrinkSugarGroupId);
  const addDrinkSoftChoiceGroup = item.modifierGroups.find(
    (group) => group.id === addDrinkSoftChoiceGroupId
  );
  const selectedDrinkOptionId = addDrinkGroup ? (selected[addDrinkGroup.id] ?? [])[0] : undefined;
  const selectedDrinkId =
    addDrinkGroup && selectedDrinkOptionId
      ? selectedDrinkOptionId.replace(`modopt_add_drink_${item.id}_`, "")
      : "";
  const selectedDrinkIsNone = selectedDrinkId === "none";
  const selectedDrinkIsColdOnly = Boolean(selectedDrinkId && COLD_ONLY_DRINK_IDS.has(selectedDrinkId));
  const selectedDrinkNoSugar = Boolean(selectedDrinkId && NO_SUGAR_DRINK_IDS.has(selectedDrinkId));
  const selectedDrinkIsSoft = selectedDrinkId === "drink_soft";
  const canShowDrinkTemp = Boolean(addDrinkTempGroup && selectedDrinkOptionId && !selectedDrinkIsNone);
  const canShowDrinkSugar = Boolean(
    addDrinkSugarGroup && selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkNoSugar
  );
  const canShowDrinkSoftChoice = Boolean(
    addDrinkSoftChoiceGroup && selectedDrinkOptionId && !selectedDrinkIsNone && selectedDrinkIsSoft
  );
  const coldTempOptionId = addDrinkTempGroup?.options.find((o) =>
    o.id.includes(`modopt_add_drink_temp_cold_${item.id}`)
  )?.id;
  const hotTempOptionId = addDrinkTempGroup?.options.find((o) =>
    o.id.includes(`modopt_add_drink_temp_hot_${item.id}`)
  )?.id;
  const regularSugarOptionId = addDrinkSugarGroup?.options.find((o) =>
    o.id.includes(`modopt_add_drink_sugar_regular_${item.id}`)
  )?.id;

  useEffect(() => {
    if (!addDrinkGroup) return;
    const current = selected[addDrinkGroup.id] ?? [];
    const noneOptionId = addDrinkGroup.options.find((o) =>
      o.id.includes(`modopt_add_drink_${item.id}_none`)
    )?.id;
    if (!current.length && noneOptionId) {
      setSelected((prev) => ({ ...prev, [addDrinkGroup.id]: [noneOptionId] }));
    }
  }, [addDrinkGroup, item.id, selected]);

  useEffect(() => {
    if (!addDrinkTempGroup) return;
    const current = selected[addDrinkTempGroup.id] ?? [];
    if (!selectedDrinkOptionId || selectedDrinkIsNone) {
      if (current.length > 0) {
        setSelected((prev) => ({ ...prev, [addDrinkTempGroup.id]: [] }));
      }
      return;
    }
    if (selectedDrinkIsColdOnly && coldTempOptionId) {
      if (current[0] !== coldTempOptionId || current.length !== 1) {
        setSelected((prev) => ({ ...prev, [addDrinkTempGroup.id]: [coldTempOptionId] }));
      }
      return;
    }
    if (!current.length && hotTempOptionId) {
      setSelected((prev) => ({ ...prev, [addDrinkTempGroup.id]: [hotTempOptionId] }));
    }
  }, [
    addDrinkTempGroup,
    selected,
    selectedDrinkOptionId,
    selectedDrinkIsNone,
    selectedDrinkIsColdOnly,
    coldTempOptionId,
    hotTempOptionId
  ]);

  useEffect(() => {
    if (!addDrinkSugarGroup) return;
    const current = selected[addDrinkSugarGroup.id] ?? [];
    if (!selectedDrinkOptionId || selectedDrinkIsNone || selectedDrinkNoSugar) {
      if (current.length > 0) {
        setSelected((prev) => ({ ...prev, [addDrinkSugarGroup.id]: [] }));
      }
      return;
    }
    if (!current.length && regularSugarOptionId) {
      setSelected((prev) => ({ ...prev, [addDrinkSugarGroup.id]: [regularSugarOptionId] }));
    }
  }, [
    addDrinkSugarGroup,
    selected,
    selectedDrinkOptionId,
    selectedDrinkIsNone,
    selectedDrinkNoSugar,
    regularSugarOptionId
  ]);

  useEffect(() => {
    if (!addDrinkSoftChoiceGroup) return;
    const current = selected[addDrinkSoftChoiceGroup.id] ?? [];
    if (!selectedDrinkOptionId || selectedDrinkIsNone || !selectedDrinkIsSoft) {
      if (current.length > 0) {
        setSelected((prev) => ({ ...prev, [addDrinkSoftChoiceGroup.id]: [] }));
      }
      return;
    }
    if (!current.length) {
      const defaultOption =
        addDrinkSoftChoiceGroup.options.find((o) => o.isDefault) ?? addDrinkSoftChoiceGroup.options[0];
      if (defaultOption) {
        setSelected((prev) => ({ ...prev, [addDrinkSoftChoiceGroup.id]: [defaultOption.id] }));
      }
    }
  }, [addDrinkSoftChoiceGroup, selected, selectedDrinkOptionId, selectedDrinkIsNone, selectedDrinkIsSoft]);

  const modifierDelta = useMemo(() => {
    let sum = 0;
    for (const group of item.modifierGroups) {
      for (const optionId of selected[group.id] ?? []) {
        const option = group.options.find((o) => o.id === optionId);
        if (option) sum += option.priceDeltaCents;
      }
    }
    const selectedTempOptionId = addDrinkTempGroup ? (selected[addDrinkTempGroup.id] ?? [])[0] : "";
    const isColdSelection =
      Boolean(selectedDrinkOptionId) &&
      !selectedDrinkIsNone &&
      (selectedDrinkIsColdOnly || selectedTempOptionId === coldTempOptionId);
    if (isColdSelection && !COLD_SURCHARGE_EXEMPT_DRINK_IDS.has(selectedDrinkId)) {
      sum += 150;
    }
    return sum;
  }, [
    item.modifierGroups,
    selected,
    addDrinkTempGroup,
    selectedDrinkOptionId,
    selectedDrinkIsNone,
    selectedDrinkIsColdOnly,
    coldTempOptionId,
    selectedDrinkId
  ]);

  function toggle(groupId: string, optionId: string) {
    setSelected((prev) => {
      const group = item.modifierGroups.find((g) => g.id === groupId);
      if (!group) return prev;
      const current = prev[groupId] ?? [];
      const exists = current.includes(optionId);
      if (!exists && current.length >= group.maxSelect) return prev;
      return {
        ...prev,
        [groupId]: exists ? current.filter((id) => id !== optionId) : [...current, optionId]
      };
    });
  }

  function setSingle(groupId: string, optionId: string) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      const exists = current.includes(optionId);
      return { ...prev, [groupId]: exists ? [] : [optionId] };
    });
  }

  function submit() {
    for (const group of item.modifierGroups) {
      const count = (selected[group.id] ?? []).length;
      if (count < group.minSelect || count > group.maxSelect) {
        setError(
          lang === "zh"
            ? `${localizeText(group.name, lang)}：請選擇 ${group.minSelect}-${group.maxSelect} 項。`
            : `${group.name}: choose ${group.minSelect}-${group.maxSelect}.`
        );
        return;
      }
      if (group.required && count === 0) {
        setError(
          lang === "zh"
            ? `${localizeText(group.name, lang)} 為必選。`
            : `${group.name} is required.`
        );
        return;
      }
    }
    if (selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkIsColdOnly) {
      const tempPickedCount = addDrinkTempGroup ? (selected[addDrinkTempGroup.id] ?? []).length : 0;
      if (tempPickedCount === 0) {
        setError(
          lang === "zh"
            ? "已選飲品時，必須選擇飲品溫度。"
            : "Add Drink Temperature is required when a drink is selected."
        );
        return;
      }
    }
    if (selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkNoSugar) {
      const sugarPickedCount = addDrinkSugarGroup ? (selected[addDrinkSugarGroup.id] ?? []).length : 0;
      if (sugarPickedCount === 0) {
        setError(
          lang === "zh"
            ? "此飲品可調糖，請選擇甜度。"
            : "Add Drink Sugar Level is required when selected drink allows sugar changes."
        );
        return;
      }
    }
    if (selectedDrinkOptionId && !selectedDrinkIsNone && selectedDrinkIsSoft) {
      const softChoicePickedCount = addDrinkSoftChoiceGroup
        ? (selected[addDrinkSoftChoiceGroup.id] ?? []).length
        : 0;
      if (addDrinkSoftChoiceGroup && softChoicePickedCount === 0) {
        setError(lang === "zh" ? "請選擇汽水款式。" : "Select a soft drink option.");
        return;
      }
    }

    const modifiers = Object.entries(selected).flatMap(([groupId, optionIds]) =>
      optionIds.map((optionId) => ({ groupId, optionId }))
    );

    addLine({
      lineType: "ITEM",
      refId: item.id,
      qty,
      lineNote: lineNote.trim() || undefined,
      modifiers
    }, lang === "zh" ? `${localizeText(item.name, lang)} 已加入購物車` : `${item.name} added to cart`);
    router.push("/");
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">
        {lang === "zh" ? "價格" : "Price"}: {centsToCurrency(item.basePriceCents + modifierDelta)}
      </div>
      <label className="block text-sm font-medium">
        {lang === "zh" ? "數量" : "Quantity"}
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="mt-1 w-20 rounded border px-2 py-1"
        />
      </label>

      {item.modifierGroups.map((group) => {
        if (group.id === addDrinkTempGroupId && !canShowDrinkTemp) {
          return null;
        }
        if (group.id === addDrinkSugarGroupId && !canShowDrinkSugar) {
          return null;
        }
        if (group.id === addDrinkSoftChoiceGroupId && !canShowDrinkSoftChoice) {
          return null;
        }
        const picks = selected[group.id] ?? [];
        const isDrinkTempGroup = group.id === addDrinkTempGroupId;
        const visibleOptions = isDrinkTempGroup
          ? group.options.filter((opt) =>
              selectedDrinkIsColdOnly ? opt.id === coldTempOptionId : true
            )
          : group.options;
        return (
          <div key={group.id} className="rounded-lg border border-amber-900/20 p-3">
            <div className="font-medium">
              {localizeText(group.name, lang)}{" "}
              <span className="text-sm text-gray-500">
                ({lang === "zh" ? "選擇" : "Choose"} {group.minSelect}
                {group.maxSelect !== group.minSelect ? `-${group.maxSelect}` : ""})
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {visibleOptions.map((opt) => {
                const dynamicDeltaCents =
                  isDrinkTempGroup &&
                  opt.id === coldTempOptionId &&
                  !COLD_SURCHARGE_EXEMPT_DRINK_IDS.has(selectedDrinkId)
                    ? 150
                    : opt.priceDeltaCents;
                return (
                <label key={opt.id} className="flex items-center justify-between text-sm">
                  <span>
                    <input
                      type="checkbox"
                      checked={picks.includes(opt.id)}
                      disabled={
                        (selectedDrinkIsColdOnly && isDrinkTempGroup && opt.id === hotTempOptionId) ||
                        (!picks.includes(opt.id) &&
                          picks.length >= group.maxSelect &&
                          group.maxSelect !== 1)
                      }
                      onChange={() =>
                        group.maxSelect === 1
                          ? setSingle(group.id, opt.id)
                          : toggle(group.id, opt.id)
                      }
                      className="mr-2"
                    />
                    {localizeText(opt.name, lang)}
                  </span>
                  <span>{dynamicDeltaCents ? `+${centsToCurrency(dynamicDeltaCents)}` : ""}</span>
                </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <label className="block text-sm font-medium">
        {lang === "zh" ? "附加備註（選填）" : "Additional Notes (optional)"}
        <textarea
          value={lineNote}
          onChange={(e) => setLineNote(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-2"
          placeholder={lang === "zh" ? "例如：走蔥、加辣等" : "No onions, extra spicy, etc."}
        />
      </label>

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button onClick={submit} className="rounded bg-[var(--brand)] px-4 py-2 text-white">
        {lang === "zh" ? "加入購物車" : "Add to Cart"}
      </button>
    </div>
  );
}
