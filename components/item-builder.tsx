"use client";

import { useEffect, useMemo, useState } from "react";
import { ModifierGroup, ModifierOption } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";
import { localizeText, type Lang } from "@/lib/i18n";

type GroupWithOptions = ModifierGroup & { options: ModifierOption[] };

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

  const addDrinkGroup = item.modifierGroups.find((group) => group.name === "Add Drink");
  const addDrinkTempGroup = item.modifierGroups.find(
    (group) => group.name === "Add Drink Temperature"
  );
  const addDrinkSugarGroup = item.modifierGroups.find(
    (group) => group.name === "Add Drink Sugar Level"
  );
  const selectedDrinkOptionId = addDrinkGroup ? (selected[addDrinkGroup.id] ?? [])[0] : undefined;
  const selectedDrinkId =
    addDrinkGroup && selectedDrinkOptionId
      ? selectedDrinkOptionId.replace(`modopt_add_drink_${item.id}_`, "")
      : "";
  const selectedDrinkIsNone = selectedDrinkId === "none";
  const coldOnlyDrinkIds = new Set(["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]);
  const noSugarDrinkIds = new Set([
    "drink_soft",
    "drink_soy_milk",
    "drink_lemon_sprite",
    "drink_lemon_coke",
    "drink_lemon_honey"
  ]);
  const selectedDrinkIsColdOnly = Boolean(selectedDrinkId && coldOnlyDrinkIds.has(selectedDrinkId));
  const selectedDrinkNoSugar = Boolean(selectedDrinkId && noSugarDrinkIds.has(selectedDrinkId));
  const canShowDrinkTemp = Boolean(addDrinkTempGroup && selectedDrinkOptionId && !selectedDrinkIsNone);
  const canShowDrinkSugar = Boolean(
    addDrinkSugarGroup && selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkNoSugar
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
    if (isColdSelection && selectedDrinkId !== "drink_soft") {
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
        setError(`${group.name}: choose ${group.minSelect}-${group.maxSelect}.`);
        return;
      }
      if (group.required && count === 0) {
        setError(`${group.name} is required.`);
        return;
      }
    }
    if (selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkIsColdOnly) {
      const tempPickedCount = addDrinkTempGroup ? (selected[addDrinkTempGroup.id] ?? []).length : 0;
      if (tempPickedCount === 0) {
        setError("Add Drink Temperature is required when a drink is selected.");
        return;
      }
    }
    if (selectedDrinkOptionId && !selectedDrinkIsNone && !selectedDrinkNoSugar) {
      const sugarPickedCount = addDrinkSugarGroup ? (selected[addDrinkSugarGroup.id] ?? []).length : 0;
      if (sugarPickedCount === 0) {
        setError("Add Drink Sugar Level is required when selected drink allows sugar changes.");
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
    }, `${item.name} added to cart`);
    router.push("/");
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">
        Price: {centsToCurrency(item.basePriceCents + modifierDelta)}
      </div>
      <label className="block text-sm font-medium">
        Quantity
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="mt-1 w-20 rounded border px-2 py-1"
        />
      </label>

      {item.modifierGroups.map((group) => {
        if (group.name === "Add Drink Temperature" && !canShowDrinkTemp) {
          return null;
        }
        if (group.name === "Add Drink Sugar Level" && !canShowDrinkSugar) {
          return null;
        }
        const picks = selected[group.id] ?? [];
        const isDrinkTempGroup = group.name === "Add Drink Temperature";
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
                (Choose {group.minSelect}
                {group.maxSelect !== group.minSelect ? `-${group.maxSelect}` : ""})
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {visibleOptions.map((opt) => {
                const dynamicDeltaCents =
                  isDrinkTempGroup && opt.id === coldTempOptionId && selectedDrinkId !== "drink_soft"
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
        Additional Notes (optional)
        <textarea
          value={lineNote}
          onChange={(e) => setLineNote(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-2"
          placeholder="No onions, extra spicy, etc."
        />
      </label>

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button onClick={submit} className="rounded bg-[var(--brand)] px-4 py-2 text-white">
        Add to Cart
      </button>
    </div>
  );
}
