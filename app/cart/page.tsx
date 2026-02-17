"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency, roundToNearestNickel } from "@/lib/format";
import { getClientLang, localizeText, type Lang } from "@/lib/i18n";

type MenuPayload = {
  categories: any[];
  combos: any[];
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
  return line.modifiers.map((m: any) => {
    const group = item.modifierGroups.find((g: any) => g.id === m.groupId);
    const option = group?.options.find((o: any) => o.id === m.optionId);
    return (
      <div key={`${m.groupId}-${m.optionId}`} className="pl-3">
        - {localizeText(group?.name ?? "", lang)}: {localizeText(option?.name ?? m.optionId, lang)}
      </div>
    );
  });
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

  return (
    <div className="space-y-4">
      <Link
        href="/menu"
        className="inline-flex items-center gap-2 border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回餐牌" : "← Back to Menu"}
      </Link>
      <h1 className="text-2xl font-bold">{lang === "zh" ? "購物車" : "Cart"}</h1>
      {lines.length === 0 ? (
        <div className="rounded bg-[var(--card)] p-4">{lang === "zh" ? "購物車是空的。" : "Your cart is empty."}</div>
      ) : (
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={`${line.refId}-${idx}`} className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{localizeText(getLineLabel(line, menu), lang)}</div>
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
            <Link href="/checkout" className="mt-3 inline-block rounded bg-[var(--brand)] px-4 py-2 text-white">
              {lang === "zh" ? "前往結帳" : "Proceed to Checkout"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

