"use client";

import { useEffect, useMemo, useState } from "react";
import { ComboOptionType, ModifierGroup, ModifierOption } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";

type ComboGroupOption = {
  id: string;
  optionType: ComboOptionType;
  refId: string;
  priceDeltaCents: number;
  allowModifiers: boolean;
  sortOrder: number;
};

type ComboGroupInput = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ComboGroupOption[];
};

type ItemOption = {
  id: string;
  name: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
    sortOrder: number;
  };
  modifierGroups: Array<ModifierGroup & { options: ModifierOption[] }>;
};

export function ComboBuilder({
  combo,
  groups,
  items
}: {
  combo: { id: string; name: string; basePriceCents: number };
  groups: ComboGroupInput[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const { addLine } = useCart();
  const [qty, setQty] = useState(1);
  const [lineNote, setLineNote] = useState("");
  const [error, setError] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<
    Array<{
      comboGroupId: string;
      comboOptionId: string;
      selectedItemId?: string;
      modifiers?: Array<{ groupId: string; optionId: string }>;
    }>
  >([]);

  const selectedByGroup = useMemo(() => {
    const map = new Map<string, typeof selected>();
    for (const entry of selected) {
      const arr = map.get(entry.comboGroupId) ?? [];
      arr.push(entry);
      map.set(entry.comboGroupId, arr);
    }
    return map;
  }, [selected]);

  const itemById = useMemo(() => {
    const map = new Map<string, ItemOption>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const group of groups) {
        for (const option of group.options) {
          if (option.optionType !== "ITEM") continue;
          const item = itemById.get(option.refId);
          if (!item) continue;
          const key = `${group.id}:${item.category.id}`;
          if (next[key] === undefined) {
            next[key] = true;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [groups, itemById]);

  const total = useMemo(() => {
    let sum = combo.basePriceCents;
    for (const s of selected) {
      const group = groups.find((g) => g.id === s.comboGroupId);
      const option = group?.options.find((o) => o.id === s.comboOptionId);
      if (!option) continue;
      sum += option.priceDeltaCents;
      const item = items.find((it) => it.id === s.selectedItemId);
      for (const mod of s.modifiers ?? []) {
        const groupData = item?.modifierGroups.find((g) => g.id === mod.groupId);
        const optionData = groupData?.options.find((o) => o.id === mod.optionId);
        if (optionData) sum += optionData.priceDeltaCents;
      }
    }
    return sum;
  }, [combo.basePriceCents, groups, items, selected]);

  const selectedItemNames = useMemo(() => {
    const names: string[] = [];
    for (const pick of selected) {
      const group = groups.find((g) => g.id === pick.comboGroupId);
      const option = group?.options.find((o) => o.id === pick.comboOptionId);
      if (!option) continue;
      if (option.optionType === "ITEM") {
        const item = itemById.get(option.refId);
        if (item) names.push(item.name);
        continue;
      }
      if (pick.selectedItemId) {
        const item = itemById.get(pick.selectedItemId);
        if (item) names.push(item.name);
      }
    }
    return names;
  }, [groups, itemById, selected]);

  function toggleOption(comboGroupId: string, comboOptionId: string) {
    setSelected((prev) => {
      const group = groups.find((g) => g.id === comboGroupId);
      if (!group) return prev;
      const exists = prev.find(
        (line) => line.comboGroupId === comboGroupId && line.comboOptionId === comboOptionId
      );
      if (exists) {
        return prev.filter(
          (line) => !(line.comboGroupId === comboGroupId && line.comboOptionId === comboOptionId)
        );
      }
      if (group.maxSelect === 1) {
        const withoutGroup = prev.filter((line) => line.comboGroupId !== comboGroupId);
        return [...withoutGroup, { comboGroupId, comboOptionId }];
      }
      const countInGroup = prev.filter((line) => line.comboGroupId === comboGroupId).length;
      if (countInGroup >= group.maxSelect) return prev;
      return [...prev, { comboGroupId, comboOptionId }];
    });
  }

  function setSelectedItem(comboGroupId: string, comboOptionId: string, selectedItemId: string) {
    setSelected((prev) =>
      prev.map((line) =>
        line.comboGroupId === comboGroupId && line.comboOptionId === comboOptionId
          ? { ...line, selectedItemId }
          : line
      )
    );
  }

  function toggleModifier(
    comboGroupId: string,
    comboOptionId: string,
    groupId: string,
    optionId: string
  ) {
    setSelected((prev) =>
      prev.map((line) => {
        if (line.comboGroupId !== comboGroupId || line.comboOptionId !== comboOptionId) return line;
        const mods = line.modifiers ?? [];
        const exists = mods.some((m) => m.groupId === groupId && m.optionId === optionId);
        return {
          ...line,
          modifiers: exists
            ? mods.filter((m) => !(m.groupId === groupId && m.optionId === optionId))
            : [...mods, { groupId, optionId }]
        };
      })
    );
  }

  function submit() {
    for (const group of groups) {
      const picks = selectedByGroup.get(group.id) ?? [];
      if (picks.length < group.minSelect || picks.length > group.maxSelect) {
        setError(`${group.name}: choose ${group.minSelect}-${group.maxSelect}.`);
        return;
      }
      if (group.required && picks.length === 0) {
        setError(`${group.name} is required.`);
        return;
      }
      for (const pick of picks) {
        const option = group.options.find((o) => o.id === pick.comboOptionId);
        if (option?.optionType === "CATEGORY" && !pick.selectedItemId) {
          setError(`${group.name}: select an item.`);
          return;
        }
      }
    }
    setError("");
    addLine({
      lineType: "COMBO",
      refId: combo.id,
      qty,
      lineNote: lineNote.trim() || undefined,
      comboSelections: selected
    }, `${combo.name} added to cart`);
    router.push("/");
  }

  function toggleSection(groupId: string, categoryId: string) {
    const key = `${groupId}:${categoryId}`;
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Combo total: {centsToCurrency(total)}</div>
      <label className="block text-sm">
        Quantity
        <input
          className="mt-1 w-20 rounded border px-2 py-1"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <label className="block text-sm">
        Additional Notes (optional)
        <textarea
          className="mt-1 w-full rounded border px-2 py-2"
          value={lineNote}
          onChange={(e) => setLineNote(e.target.value)}
          placeholder="Special request for this combo"
        />
      </label>

      {groups.map((group) => (
        <div key={group.id} className="rounded-lg border border-amber-900/20 p-3">
          <div className="font-semibold">
            {group.name}
            <span className="ml-2 text-sm text-gray-500">
              Choose {group.minSelect}
              {group.maxSelect !== group.minSelect ? `-${group.maxSelect}` : ""}
            </span>
          </div>
          <div className="mt-2 space-y-3">
            {group.options.every((option) => option.optionType === "ITEM") ? (
              Object.values(
                group.options.reduce<Record<string, { id: string; name: string; sortOrder: number; options: ComboGroupOption[] }>>((acc, option) => {
                  const item = itemById.get(option.refId);
                  if (!item) return acc;
                  const key = item.category.id;
                  if (!acc[key]) {
                    acc[key] = {
                      id: item.category.id,
                      name: item.category.name,
                      sortOrder: item.category.sortOrder,
                      options: []
                    };
                  }
                  acc[key].options.push(option);
                  return acc;
                }, {})
              )
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                .map((section) => {
                  const sectionKey = `${group.id}:${section.id}`;
                  const isCollapsed = collapsedSections[sectionKey] ?? true;
                  const selectedInSection = section.options.reduce((count, option) => {
                    const isActive = selected.some(
                      (s) => s.comboGroupId === group.id && s.comboOptionId === option.id
                    );
                    return isActive ? count + 1 : count;
                  }, 0);
                  return (
                    <div key={sectionKey} className="rounded border border-gray-200 bg-white">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium"
                        onClick={() => toggleSection(group.id, section.id)}
                      >
                        <span>
                          {section.name}
                          {selectedInSection > 0 ? ` (${selectedInSection} Selected)` : ""}
                        </span>
                        <span className="text-sm text-gray-500">
                          {isCollapsed ? "Expand" : "Collapse"}
                        </span>
                      </button>
                      {!isCollapsed ? (
                        <div className="space-y-2 border-t border-gray-100 px-2 py-2">
                          {section.options
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((option) => {
                              const groupSelections = selectedByGroup.get(group.id) ?? [];
              const active = selected.some(
                (s) => s.comboGroupId === group.id && s.comboOptionId === option.id
              );
              const atGroupMax = groupSelections.length >= group.maxSelect;
              const lockedOut = !active && atGroupMax && group.maxSelect !== 1;
                              const selectedLine = selected.find(
                                (s) => s.comboGroupId === group.id && s.comboOptionId === option.id
                              );
                              const selectedItem = items.find((item) => item.id === selectedLine?.selectedItemId);
                              return (
                                <div
                                  key={option.id}
                                  className={`rounded border border-gray-200 p-2 ${lockedOut ? "opacity-50" : ""}`}
                                >
                                  <label className="flex items-center justify-between">
                                    <span>
                                      <input
                                        type="checkbox"
                                        checked={active}
                                        disabled={lockedOut}
                                        onChange={() => toggleOption(group.id, option.id)}
                                        className="mr-2"
                                      />
                                      {itemById.get(option.refId)?.name ?? "Item"}
                                    </span>
                                    <span className="text-sm">
                                      {option.priceDeltaCents ? `+${centsToCurrency(option.priceDeltaCents)}` : ""}
                                    </span>
                                  </label>
                                  {active && option.allowModifiers && selectedItem ? (
                                    <div className="mt-2 space-y-2 rounded bg-amber-50 p-2">
                                      <div className="text-sm font-medium">{selectedItem.name} modifiers</div>
                                      {selectedItem.modifierGroups.map((groupMod) => (
                                        <div key={groupMod.id} className="text-sm">
                                          <div>{groupMod.name}</div>
                                          {groupMod.options.map((opt) => (
                                            <label key={opt.id} className="mr-3 inline-flex items-center gap-1">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(
                                                  selectedLine?.modifiers?.some(
                                                    (m) => m.groupId === groupMod.id && m.optionId === opt.id
                                                  )
                                                )}
                                                onChange={() => toggleModifier(group.id, option.id, groupMod.id, opt.id)}
                                              />
                                              {opt.name}
                                              {opt.priceDeltaCents
                                                ? ` (+${centsToCurrency(opt.priceDeltaCents)})`
                                                : ""}
                                            </label>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
            ) : (
              group.options.map((option) => {
                const groupSelections = selectedByGroup.get(group.id) ?? [];
                const active = selected.some(
                  (s) => s.comboGroupId === group.id && s.comboOptionId === option.id
                );
                const atGroupMax = groupSelections.length >= group.maxSelect;
                const lockedOut = !active && atGroupMax && group.maxSelect !== 1;
                const selectedLine = selected.find(
                  (s) => s.comboGroupId === group.id && s.comboOptionId === option.id
                );
                const categoryItems =
                  option.optionType === "CATEGORY"
                    ? items.filter((item) => item.categoryId === option.refId)
                    : [];
                const selectedItem = items.find((item) => item.id === selectedLine?.selectedItemId);
                return (
                  <div
                    key={option.id}
                    className={`rounded border border-gray-200 p-2 ${lockedOut ? "opacity-50" : ""}`}
                  >
                    <label className="flex items-center justify-between">
                      <span>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={lockedOut}
                          onChange={() => toggleOption(group.id, option.id)}
                          className="mr-2"
                        />
                        {option.optionType === "ITEM"
                          ? itemById.get(option.refId)?.name ?? "Item"
                          : "Choose from category"}
                      </span>
                      <span className="text-sm">
                        {option.priceDeltaCents ? `+${centsToCurrency(option.priceDeltaCents)}` : ""}
                      </span>
                    </label>
                    {active && option.optionType === "CATEGORY" ? (
                      <select
                        className="mt-2 w-full rounded border p-2 text-sm"
                        value={selectedLine?.selectedItemId ?? ""}
                        onChange={(e) => setSelectedItem(group.id, option.id, e.target.value)}
                      >
                        <option value="">Select item</option>
                        {categoryItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {active && option.allowModifiers && selectedItem ? (
                      <div className="mt-2 space-y-2 rounded bg-amber-50 p-2">
                        <div className="text-sm font-medium">{selectedItem.name} modifiers</div>
                        {selectedItem.modifierGroups.map((groupMod) => (
                          <div key={groupMod.id} className="text-sm">
                            <div>{groupMod.name}</div>
                            {groupMod.options.map((opt) => (
                              <label key={opt.id} className="mr-3 inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={Boolean(
                                    selectedLine?.modifiers?.some(
                                      (m) => m.groupId === groupMod.id && m.optionId === opt.id
                                    )
                                  )}
                                  onChange={() => toggleModifier(group.id, option.id, groupMod.id, opt.id)}
                                />
                                {opt.name}
                                {opt.priceDeltaCents
                                  ? ` (+${centsToCurrency(opt.priceDeltaCents)})`
                                  : ""}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
      {selectedItemNames.length ? (
        <div className="rounded border border-amber-900/20 bg-amber-50 p-3 text-sm">
          <div className="font-semibold">Selected items</div>
          <div>{selectedItemNames.join(", ")}</div>
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button onClick={submit} className="rounded bg-[var(--brand)] px-4 py-2 text-white">
        Add Combo to Cart
      </button>
    </div>
  );
}
