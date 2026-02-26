"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency, roundToNearestNickel } from "@/lib/format";
import { getClientLang, localizeText, type Lang } from "@/lib/i18n";
import { getStoreOrderState } from "@/lib/store-status";
import type { StoreHours } from "@/lib/types";

type MenuPayload = {
  categories: any[];
  combos: any[];
  settings?: {
    acceptingOrders: boolean;
    timezone?: string;
    storeHours: StoreHours;
    closedDates: string[];
  };
};

const CLIENT_TAX_RATE = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_TAX_RATE ?? "0.13");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.13;
})();

async function fetchMenu() {
  const res = await fetch("/api/menu");
  if (!res.ok) throw new Error("Failed to load menu");
  return res.json();
}

function getLineLabel(line: { lineType: "ITEM" | "COMBO"; refId: string }, menu?: MenuPayload) {
  if (!menu) return line.refId;
  if (line.lineType === "ITEM") {
    for (const c of menu.categories) {
      const item = c.items.find((i: { id: string }) => i.id === line.refId);
      if (item) return item.name;
    }
    return line.refId;
  }
  const combo = menu.combos.find((c: { id: string }) => c.id === line.refId);
  return combo?.name ?? line.refId;
}

function renderItemModifiers(line: any, menu: MenuPayload | undefined, lang: Lang) {
  if (!menu) return null;
  const item = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === line.refId);
  if (!item) return null;
  const addDrinkGroupId = `modgrp_add_drink_${item.id}`;
  const addDrinkTempGroupId = `modgrp_add_drink_temp_${item.id}`;
  const addDrinkSugarGroupId = `modgrp_add_drink_sugar_${item.id}`;
  const addDrinkSoftChoiceGroupId = `modgrp_add_drink_soft_choice_${item.id}`;
  const drinkGroupIds = new Set([
    addDrinkGroupId,
    addDrinkTempGroupId,
    addDrinkSugarGroupId,
    addDrinkSoftChoiceGroupId
  ]);

  const selectedByGroup = new Map<string, any>();
  for (const modifier of line.modifiers) {
    selectedByGroup.set(modifier.groupId, modifier);
  }

  const getOptionByGroupId = (groupId: string) => {
    const group = item.modifierGroups.find((g: any) => g.id === groupId);
    const selected = selectedByGroup.get(groupId);
    if (!group || !selected) return null;
    const option = group.options.find((o: any) => o.id === selected.optionId);
    if (!option) return null;
    return { group, option };
  };

  const drink = getOptionByGroupId(addDrinkGroupId);
  const drinkTemp = getOptionByGroupId(addDrinkTempGroupId);
  const drinkSugar = getOptionByGroupId(addDrinkSugarGroupId);
  const drinkSoftChoice = getOptionByGroupId(addDrinkSoftChoiceGroupId);

  const drinkPrefix = `modopt_add_drink_${item.id}_`;
  const selectedDrinkId =
    drink?.option.id?.startsWith(drinkPrefix) ? drink.option.id.slice(drinkPrefix.length) : "";
  const isDrinkNone = selectedDrinkId === "none";
  const isSoftDrink = selectedDrinkId === "drink_soft";

  const regularRows = line.modifiers
    .filter((m: any) => !drinkGroupIds.has(m.groupId))
    .map((m: any) => {
      const group = item.modifierGroups.find((g: any) => g.id === m.groupId);
      const option = group?.options.find((o: any) => o.id === m.optionId);
      return (
        <div key={`${m.groupId}-${m.optionId}`} className="pl-3">
          - {localizeText(group?.name ?? "", lang)}: {localizeText(option?.name ?? m.optionId, lang)}
        </div>
      );
    });

  const drinkRows: JSX.Element[] = [];
  if (drink && !isDrinkNone) {
    const drinkDisplayName = isSoftDrink && drinkSoftChoice
      ? localizeText(drinkSoftChoice.option.name, lang)
      : localizeText(drink.option.name, lang);
    drinkRows.push(
      <div key="drink-main" className="pl-3">
        - {isSoftDrink && drinkSoftChoice ? drinkDisplayName : `${lang === "zh" ? "飲品" : "Drink"}: ${drinkDisplayName}`}
      </div>
    );

    if (drinkTemp && !(isSoftDrink && drinkSoftChoice)) {
      let tempDelta = drinkTemp.option.priceDeltaCents;
      const addOnSurcharge = getAddDrinkSurchargeCents(line, item);
      if (addOnSurcharge > 0) tempDelta += addOnSurcharge;
      drinkRows.push(
        <div key="drink-temp" className="pl-8">
          - {localizeText(drinkTemp.option.name, lang)}
          {tempDelta ? ` (${centsToCurrency(tempDelta)})` : ""}
        </div>
      );
    }

    if (drinkSugar) {
      drinkRows.push(
        <div key="drink-sugar" className="pl-8">
          - {localizeText(drinkSugar.option.name, lang)}
          {drinkSugar.option.priceDeltaCents ? ` (${centsToCurrency(drinkSugar.option.priceDeltaCents)})` : ""}
        </div>
      );
    }
  }

  return (
    <>
      {regularRows}
      {drinkRows}
    </>
  );
}

function getAddDrinkSurchargeCents(line: any, item: any) {
  const addDrinkGroup = item.modifierGroups.find((g: any) => g.id === `modgrp_add_drink_${item.id}`);
  const addDrinkTempGroup = item.modifierGroups.find(
    (g: any) => g.id === `modgrp_add_drink_temp_${item.id}`
  );
  if (!addDrinkGroup) return 0;

  const selectedDrink = line.modifiers.find((m: any) => m.groupId === addDrinkGroup.id);
  if (!selectedDrink) return 0;
  const drinkPrefix = `modopt_add_drink_${item.id}_`;
  const selectedDrinkId = String(selectedDrink.optionId ?? "").startsWith(drinkPrefix)
    ? String(selectedDrink.optionId).slice(drinkPrefix.length)
    : "";
  if (selectedDrinkId === "none") return 0;

  const coldOnlyDrinkIds = new Set(["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]);
  const selectedTemp = addDrinkTempGroup
    ? line.modifiers.find((m: any) => m.groupId === addDrinkTempGroup.id)
    : null;
  const isCold =
    coldOnlyDrinkIds.has(selectedDrinkId) ||
    String(selectedTemp?.optionId ?? "").includes(`modopt_add_drink_temp_cold_${item.id}`);
  if (!isCold) return 0;
  return selectedDrinkId === "drink_soft" || selectedDrinkId === "drink_soy_milk" ? 0 : 150;
}

function getLineTotalCents(line: any, menu: MenuPayload): number {
  if (line.lineType === "ITEM") {
    const item = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === line.refId);
    if (!item) return 0;
    let unit = item.basePriceCents;
    for (const mod of line.modifiers) {
      const group = item.modifierGroups.find((g: any) => g.id === mod.groupId);
      const option = group?.options.find((o: any) => o.id === mod.optionId);
      if (option) unit += option.priceDeltaCents;
    }
    unit += getAddDrinkSurchargeCents(line, item);
    return unit * line.qty;
  }

  const combo = menu.combos.find((c: any) => c.id === line.refId);
  if (!combo) return 0;
  let unit = combo.basePriceCents;
  for (const sel of line.comboSelections) {
    const group = combo.groups.find((g: any) => g.id === sel.comboGroupId);
    const option = group?.options.find((o: any) => o.id === sel.comboOptionId);
    if (option) unit += option.priceDeltaCents;
  }
  return unit * line.qty;
}

function renderComboSelections(line: any, menu: MenuPayload | undefined, lang: Lang) {
  if (!menu) return null;
  const combo = menu.combos.find((c: any) => c.id === line.refId);
  if (!combo) return null;
  const items = menu.categories.flatMap((c: any) => c.items);
  return line.comboSelections.map((s: any, i: number) => {
    const comboOption = combo.groups
      .find((g: any) => g.id === s.comboGroupId)
      ?.options?.find((o: any) => o.id === s.comboOptionId);
    const selectedItemId =
      s.selectedItemId ??
      (comboOption?.optionType === "ITEM" ? comboOption.refId : undefined);
    const selectedItem = selectedItemId ? items.find((it: any) => it.id === selectedItemId) : null;
    const selectionName = selectedItem?.name ?? selectedItemId ?? s.comboOptionId;
    return (
      <div key={`${s.comboGroupId}-${i}`} className="pl-3">
        - {localizeText(selectionName, lang)}
      </div>
    );
  });
}

export default function CartPage() {
  const { lines, updateQty, removeLine } = useCart();
  const [menu, setMenu] = useState<MenuPayload>();
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    fetchMenu().then(setMenu).catch(() => undefined);
    setLang(getClientLang());
  }, []);

  const subtotalCents = useMemo(() => {
    if (!menu) return 0;
    return lines.reduce((sum, line) => sum + getLineTotalCents(line, menu), 0);
  }, [lines, menu]);
  const taxCents = useMemo(() => Math.round(subtotalCents * CLIENT_TAX_RATE), [subtotalCents]);
  const totalCents = useMemo(
    () => roundToNearestNickel(subtotalCents + taxCents),
    [subtotalCents, taxCents]
  );
  const orderState = useMemo(() => {
    if (!menu?.settings) return "OPEN" as const;
    return getStoreOrderState({
      acceptingOrders: menu.settings.acceptingOrders,
      timezone: menu.settings.timezone,
      storeHours: menu.settings.storeHours,
      closedDates: menu.settings.closedDates
    });
  }, [menu]);

  return (
    <div className="space-y-4">
      <Link
        href="/menu"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回餐牌" : "← Back to Menu"}
      </Link>
      <h1 className="font-display-serif text-2xl font-bold">{lang === "zh" ? "購物車" : "Cart"}</h1>
      {lines.length === 0 ? (
        <div className="rounded bg-[var(--card)] p-4">{lang === "zh" ? "購物車是空的。" : "Your cart is empty."}</div>
      ) : (
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={`${line.refId}-${idx}`} className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display-serif font-semibold">
                    {localizeText(getLineLabel(line, menu), lang)}
                  </div>
                  {line.lineType === "ITEM" ? (
                    <div className="mt-1 text-sm text-gray-600">{renderItemModifiers(line, menu, lang)}</div>
                  ) : (
                    <div className="mt-1 text-sm text-gray-600">{renderComboSelections(line, menu, lang)}</div>
                  )}
                  {line.lineNote ? (
                    <div className="mt-1 text-sm text-gray-700">
                      {lang === "zh" ? "附加備註" : "Additional Notes"}: {line.lineNote}
                    </div>
                  ) : null}
                </div>
                <button onClick={() => removeLine(idx)} className="text-sm text-red-700 underline">
                  {lang === "zh" ? "移除" : "Remove"}
                </button>
              </div>
              {menu ? (
                <div className="mt-1 text-sm font-semibold text-[var(--brand)]">
                  {lang === "zh" ? "項目小計" : "Line total"}: {centsToCurrency(getLineTotalCents(line, menu))}
                </div>
              ) : null}
              <label className="mt-2 block text-sm">
                {lang === "zh" ? "數量" : "Qty"}
                <input
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={(e) => updateQty(idx, Number(e.target.value) || 1)}
                  className="ml-2 w-16 rounded border px-2 py-1"
                />
              </label>
            </div>
          ))}
          <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
            <div className="font-semibold">
              {lang === "zh" ? "預估小計" : "Estimated subtotal"}: {centsToCurrency(subtotalCents)}
            </div>
            <div className="mt-1 font-semibold">
              {lang === "zh" ? "稅項" : "Tax"}: {centsToCurrency(taxCents)}
            </div>
            <div className="mt-1 text-lg font-bold text-black">
              {lang === "zh" ? "總計" : "Total"}: {centsToCurrency(totalCents)}
            </div>
            {orderState === "OPEN" ? (
              <Link
                href="/checkout"
                className="mt-3 inline-block rounded-full bg-[var(--brand)] px-4 py-2 text-white"
              >
                {lang === "zh" ? "前往結帳" : "Proceed to Checkout"}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="mt-3 inline-block cursor-not-allowed rounded-full bg-gray-300 px-4 py-2 text-gray-600"
              >
                {lang === "zh" ? "前往結帳" : "Proceed to Checkout"}
              </button>
            )}
            {orderState !== "OPEN" ? (
              <div className="mt-2 text-sm text-red-700">
                {orderState === "CLOSED"
                  ? lang === "zh"
                    ? "本店目前休息中，暫時不能結帳。"
                    : "Store is currently closed. Checkout is unavailable."
                  : lang === "zh"
                    ? "目前暫停接單，暫時不能結帳。"
                    : "Ordering is currently turned off. Checkout is unavailable."}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

