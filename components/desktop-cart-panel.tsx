"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";
import { localizeText, type Lang } from "@/lib/i18n";

type MenuData = {
  categories: Array<{
    id: string;
    items: Array<{
      id: string;
      name: string;
      basePriceCents: number;
      modifierGroups: Array<{
        id: string;
        name: string;
        options: Array<{ id: string; name: string; priceDeltaCents: number }>;
      }>;
    }>;
  }>;
  combos: Array<{
    id: string;
    name: string;
    basePriceCents: number;
    groups: Array<{
      id: string;
      options: Array<{ id: string; priceDeltaCents: number }>;
    }>;
  }>;
};

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

  const coldOnlyDrinkIds = new Set(["drink_soft", "drink_lemon_coke", "drink_lemon_sprite"]);
  const selectedTemp = addDrinkTempGroup
    ? line.modifiers.find((m: any) => m.groupId === addDrinkTempGroup.id)
    : null;
  const isCold =
    coldOnlyDrinkIds.has(selectedDrinkId) ||
    String(selectedTemp?.optionId ?? "").includes(`modopt_add_drink_temp_cold_${item.id}`);
  if (!isCold) return 0;
  return selectedDrinkId === "drink_soft" ? 0 : 150;
}

function getLineTotalCents(line: any, menu: MenuData): number {
  if (line.lineType === "ITEM") {
    const item = menu.categories
      .flatMap((c) => c.items)
      .find((i) => i.id === line.refId);
    if (!item) return 0;
    let unit = item.basePriceCents;
    for (const mod of line.modifiers) {
      const group = item.modifierGroups.find((g) => g.id === mod.groupId);
      const option = group?.options.find((o) => o.id === mod.optionId);
      if (option) unit += option.priceDeltaCents;
    }
    unit += getAddDrinkSurchargeCents(line, item);
    return unit * line.qty;
  }
  const combo = menu.combos.find((c) => c.id === line.refId);
  if (!combo) return 0;
  let unit = combo.basePriceCents;
  for (const sel of line.comboSelections) {
    const group = combo.groups.find((g) => g.id === sel.comboGroupId);
    const option = group?.options.find((o) => o.id === sel.comboOptionId);
    if (option) unit += option.priceDeltaCents;
  }
  return unit * line.qty;
}

export function DesktopCartPanel({ menu, lang }: { menu: MenuData; lang: Lang }) {
  const { lines } = useCart();

  const subtotalCents = useMemo(() => {
    return lines.reduce((sum, line) => sum + getLineTotalCents(line, menu), 0);
  }, [lines, menu]);

  return (
    <aside className="sticky top-20 hidden h-fit rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm lg:block">
      <div className="mb-2 text-lg font-semibold">{lang === "zh" ? "購物車" : "Cart"}</div>
      {lines.length === 0 ? (
        <div className="text-sm text-gray-600">{lang === "zh" ? "尚未加入任何項目。" : "No items yet."}</div>
      ) : (
        <div className="space-y-2">
          {lines.map((line, idx) => {
            const itemName =
              line.lineType === "ITEM"
                ? localizeText(
                    menu.categories.flatMap((c) => c.items).find((i) => i.id === line.refId)?.name,
                    lang
                  )
                : localizeText(menu.combos.find((c) => c.id === line.refId)?.name, lang);
            return (
              <div key={`${line.refId}-${idx}`} className="rounded border border-gray-200 p-2 text-sm">
                <div className="font-medium">{itemName ?? line.refId}</div>
                <div className="text-gray-600">{lang === "zh" ? "數量" : "Qty"}: {line.qty}</div>
                <div className="font-semibold text-[var(--brand)]">
                  {centsToCurrency(getLineTotalCents(line, menu))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 border-t border-gray-200 pt-3">
        <div className="font-semibold">{lang === "zh" ? "小計" : "Subtotal"}: {centsToCurrency(subtotalCents)}</div>
        <Link href="/cart" className="mt-2 inline-block rounded bg-[var(--brand)] px-3 py-1.5 text-sm text-white">
          {lang === "zh" ? "打開購物車" : "Open Cart"}
        </Link>
      </div>
    </aside>
  );
}
