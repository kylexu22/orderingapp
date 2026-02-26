"use client";

import { useEffect, useMemo, useState } from "react";
import { ComboOptionType, ModifierGroup, ModifierOption } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";
import { localizeText, type Lang } from "@/lib/i18n";

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
  items,
  lang
}: {
  combo: { id: string; name: string; basePriceCents: number };
  groups: ComboGroupInput[];
  items: ItemOption[];
  lang: Lang;
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
        if (item) names.push(localizeText(item.name, lang));
        continue;
      }
      if (pick.selectedItemId) {
        const item = itemById.get(pick.selectedItemId);
        if (item) names.push(localizeText(item.name, lang));
      }
    }
    return names;
  }, [groups, itemById, selected, lang]);

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
        setError(
          lang === "zh"
            ? `${localizeText(group.name, lang)}：請選擇 ${group.minSelect}-${group.maxSelect} 項。`
            : `${group.name}: choose ${group.minSelect}-${group.maxSelect}.`
        );
        return;
      }
      if (group.required && picks.length === 0) {
        setError(
          lang === "zh"
            ? `${localizeText(group.name, lang)} 為必選。`
            : `${group.name} is required.`
        );
        return;
      }
      for (const pick of picks) {
        const option = group.options.find((o) => o.id === pick.comboOptionId);
        if (option?.optionType === "CATEGORY" && !pick.selectedItemId) {
          setError(
            lang === "zh"
              ? `${localizeText(group.name, lang)}：請選擇一個項目。`
              : `${group.name}: select an item.`
          );
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
    }, lang === "zh" ? `${localizeText(combo.name, lang)} 已加入購物車` : `${combo.name} added to cart`);
    router.push("/menu");
  }

  function toggleSection(groupId: string, categoryId: string) {
    const key = `${groupId}:${categoryId}`;
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">
        {lang === "zh" ? "套餐總價" : "Combo total"}: {centsToCurrency(total)}
      </div>
      <label className="block text-sm">
        {lang === "zh" ? "數量" : "Quantity"}
        <input
          className="mt-1 w-20 rounded border px-2 py-1"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>

      {groups.map((group) => (
        <div key={group.id} className="rounded-lg border border-amber-900/20 p-3">
          <div className="font-display-serif font-semibold">
            {localizeText(group.name, lang)}
            <span className="ml-2 text-sm text-gray-500">
              {lang === "zh" ? "選擇" : "Choose"} {group.minSelect}
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
                        <span className="font-display-serif">
                          {localizeText(section.name, lang)}
                          {selectedInSection > 0 ? ` (${selectedInSection} Selected)` : ""}
                        </span>
                        <span className="text-sm text-gray-500">
                          {isCollapsed ? (lang === "zh" ? "展開" : "Expand") : lang === "zh" ? "收起" : "Collapse"}
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
                                      <span className="font-display-serif">
                                        {localizeText(itemById.get(option.refId)?.name ?? "Item", lang)}
                                      </span>
                                    </span>
                                    <span className="text-sm">
                                      {option.priceDeltaCents ? `+${centsToCurrency(option.priceDeltaCents)}` : ""}
                                    </span>
                                  </label>
                                  {active && option.allowModifiers && selectedItem ? (
                                    <div className="mt-2 space-y-2 rounded bg-amber-50 p-2">
                                      <div className="text-sm font-medium">
                                        <span className="font-display-serif">
                                          {localizeText(selectedItem.name, lang)}
                                        </span>{" "}
                                        {lang === "zh" ? "選項" : "modifiers"}
                                      </div>
                                      {selectedItem.modifierGroups.map((groupMod) => (
                                        <div key={groupMod.id} className="text-sm">
                                          <div>{localizeText(groupMod.name, lang)}</div>
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
                                              {localizeText(opt.name, lang)}
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
                          ? <span className="font-display-serif">{localizeText(itemById.get(option.refId)?.name ?? "Item", lang)}</span>
                          : lang === "zh"
                            ? "從分類中選擇"
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
                        <option value="">{lang === "zh" ? "選擇項目" : "Select item"}</option>
                        {categoryItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {localizeText(item.name, lang)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {active && option.allowModifiers && selectedItem ? (
                      <div className="mt-2 space-y-2 rounded bg-amber-50 p-2">
                        <div className="text-sm font-medium">
                          <span className="font-display-serif">{localizeText(selectedItem.name, lang)}</span>{" "}
                          {lang === "zh" ? "選項" : "modifiers"}
                        </div>
                        {selectedItem.modifierGroups.map((groupMod) => (
                          <div key={groupMod.id} className="text-sm">
                            <div>{localizeText(groupMod.name, lang)}</div>
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
                                {localizeText(opt.name, lang)}
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
      <label className="block text-sm">
        {lang === "zh" ? "附加備註（選填）" : "Additional Notes (optional)"}
        <textarea
          className="mt-1 w-full rounded border px-2 py-2"
          value={lineNote}
          onChange={(e) => setLineNote(e.target.value)}
          placeholder={lang === "zh" ? "此套餐的特殊要求" : "Special request for this combo"}
        />
      </label>
      {selectedItemNames.length ? (
        <div className="rounded border border-amber-900/20 bg-amber-50 p-3 text-sm">
          <div className="font-display-serif font-semibold">
            {lang === "zh" ? "已選項目" : "Selected items"}
          </div>
          <div>{selectedItemNames.join(", ")}</div>
        </div>
      ) : null}
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button onClick={submit} className="rounded bg-[var(--brand)] px-4 py-2 text-white">
        {lang === "zh" ? "加入套餐到購物車" : "Add Combo to Cart"}
      </button>
    </div>
  );
}
