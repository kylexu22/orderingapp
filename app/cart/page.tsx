"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency } from "@/lib/format";

type MenuPayload = {
  categories: any[];
  combos: any[];
};

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

function renderItemModifiers(line: any, menu: MenuPayload | undefined) {
  if (!menu) return null;
  const item = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === line.refId);
  if (!item) return null;
  return line.modifiers.map((m: any) => {
    const group = item.modifierGroups.find((g: any) => g.id === m.groupId);
    const option = group?.options.find((o: any) => o.id === m.optionId);
    return (
      <div key={`${m.groupId}-${m.optionId}`} className="pl-3">
        - {group?.name}: {option?.name ?? m.optionId}
      </div>
    );
  });
}

function getAddDrinkSurchargeCents(line: any, item: any) {
  const addDrinkGroup = item.modifierGroups.find((g: any) => g.name === "Add Drink");
  const addDrinkTempGroup = item.modifierGroups.find(
    (g: any) => g.name === "Add Drink Temperature"
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

function renderComboSelections(line: any, menu: MenuPayload | undefined) {
  if (!menu) return null;
  const combo = menu.combos.find((c: any) => c.id === line.refId);
  if (!combo) return null;
  const items = menu.categories.flatMap((c: any) => c.items);
  return line.comboSelections.map((s: any, i: number) => {
    const group = combo.groups.find((g: any) => g.id === s.comboGroupId);
    const selectedItem = items.find((it: any) => it.id === s.selectedItemId);
    return (
      <div key={`${s.comboGroupId}-${i}`} className="pl-3">
        - {group?.name}: {selectedItem?.name ?? s.selectedItemId ?? s.comboOptionId}
      </div>
    );
  });
}

export default function CartPage() {
  const { lines, updateQty, removeLine } = useCart();
  const [menu, setMenu] = useState<MenuPayload>();

  useEffect(() => {
    fetchMenu().then(setMenu).catch(() => undefined);
  }, []);

  const subtotalCents = useMemo(() => {
    if (!menu) return 0;
    return lines.reduce((sum, line) => {
      if (line.lineType === "ITEM") {
        const item = menu.categories
          .flatMap((c: any) => c.items)
          .find((i: any) => i.id === line.refId);
        if (!item) return sum;
        let unit = item.basePriceCents;
        for (const mod of line.modifiers) {
          const group = item.modifierGroups.find((g: any) => g.id === mod.groupId);
          const option = group?.options.find((o: any) => o.id === mod.optionId);
          if (option) unit += option.priceDeltaCents;
        }
        unit += getAddDrinkSurchargeCents(line, item);
        return sum + unit * line.qty;
      }
      const combo = menu.combos.find((c: any) => c.id === line.refId);
      if (!combo) return sum;
      let unit = combo.basePriceCents;
      for (const sel of line.comboSelections) {
        const group = combo.groups.find((g: any) => g.id === sel.comboGroupId);
        const option = group?.options.find((o: any) => o.id === sel.comboOptionId);
        if (option) unit += option.priceDeltaCents;
      }
      return sum + unit * line.qty;
    }, 0);
  }, [lines, menu]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cart</h1>
      {lines.length === 0 ? (
        <div className="rounded bg-[var(--card)] p-4">Your cart is empty.</div>
      ) : (
        <div className="space-y-3">
          {lines.map((line, idx) => (
            <div key={`${line.refId}-${idx}`} className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{getLineLabel(line, menu)}</div>
                  {line.lineType === "ITEM" ? (
                    <div className="mt-1 text-sm text-gray-600">{renderItemModifiers(line, menu)}</div>
                  ) : (
                    <div className="mt-1 text-sm text-gray-600">{renderComboSelections(line, menu)}</div>
                  )}
                  {line.lineNote ? (
                    <div className="mt-1 text-sm text-gray-700">Additional Notes: {line.lineNote}</div>
                  ) : null}
                </div>
                <button onClick={() => removeLine(idx)} className="text-sm text-red-700 underline">
                  Remove
                </button>
              </div>
              <label className="mt-2 block text-sm">
                Qty
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
            <div className="font-semibold">Estimated subtotal: {centsToCurrency(subtotalCents)}</div>
            <Link href="/checkout" className="mt-3 inline-block rounded bg-[var(--brand)] px-4 py-2 text-white">
              Proceed to Checkout
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

