"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PickupType } from "@prisma/client";
import { useCart } from "@/lib/cart-store";
import { centsToCurrency, fmtTime, roundToNearestNickel } from "@/lib/format";
import { getAsapReadyTime, getTodaySlots } from "@/lib/pickup";
import { StoreHours } from "@/lib/types";
import { getClientLang, localizeText, type Lang } from "@/lib/i18n";
import { getStoreOrderState } from "@/lib/store-status";

type SettingsPayload = {
  prepTimeMinutes: number;
  slotIntervalMinutes: number;
  storeHours: StoreHours;
  closedDates: string[];
  acceptingOrders: boolean;
  timezone?: string;
};

type MenuPayload = {
  categories: any[];
  combos: any[];
};

type VerifySessionPayload = {
  verified: boolean;
  phone?: string;
  customer?: {
    id: string;
    phone: string;
    name: string;
    email: string | null;
  } | null;
};

const CLIENT_TAX_RATE = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_TAX_RATE ?? "0.13");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.13;
})();

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

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, clear } = useCart();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupType, setPickupType] = useState<PickupType>(PickupType.ASAP);
  const [pickupTime, setPickupTime] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationChecked, setVerificationChecked] = useState(false);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [hasKnownProfile, setHasKnownProfile] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    async function loadVerifySession() {
      try {
        const res = await fetch("/api/verify/session");
        const text = await res.text();
        let data: VerifySessionPayload | null = null;
        try {
          data = text ? (JSON.parse(text) as VerifySessionPayload) : null;
        } catch {
          data = null;
        }

        if (!data?.verified || !data?.phone) {
          router.replace("/login");
          return;
        }
        setPhone(data.phone);
        setPhoneLocked(true);
        if (data.customer) {
          setCustomerName(data.customer.name ?? "");
          setEmail(data.customer.email ?? "");
          setHasKnownProfile(true);
        } else {
          setHasKnownProfile(false);
        }
      } finally {
        setVerificationChecked(true);
      }
    }

    fetch("/api/menu")
      .then((res) => res.json())
      .then((data) => {
        setMenu({
          categories: data.categories ?? [],
          combos: data.combos ?? []
        });
        if (data.settings) {
          setSettings({
            prepTimeMinutes: data.settings.prepTimeMinutes,
            slotIntervalMinutes: data.settings.slotIntervalMinutes,
            storeHours: data.settings.storeHours,
            closedDates: data.settings.closedDates,
            acceptingOrders: data.settings.acceptingOrders ?? true,
            timezone: data.settings.timezone
          });
        }
      });
    void loadVerifySession();
    setLang(getClientLang());
  }, [router]);

  const slots = useMemo(() => {
    if (!settings) return [];
    return getTodaySlots({
      now: new Date(),
      prepTimeMinutes: settings.prepTimeMinutes,
      slotIntervalMinutes: settings.slotIntervalMinutes,
      storeHours: settings.storeHours,
      closedDates: settings.closedDates
    });
  }, [settings]);

  const asapText = useMemo(() => {
    if (!settings) return "";
    const estimate = getAsapReadyTime({
      now: new Date(),
      prepTimeMinutes: settings.prepTimeMinutes,
      slotIntervalMinutes: settings.slotIntervalMinutes
    });
    return lang === "zh" ? `預計可取餐時間 ${fmtTime(estimate)}` : `Estimated ready at ${fmtTime(estimate)}`;
  }, [settings, lang]);

  const orderState = useMemo(() => {
    if (!settings) return "OPEN" as const;
    return getStoreOrderState({
      acceptingOrders: settings.acceptingOrders,
      timezone: settings.timezone,
      storeHours: settings.storeHours,
      closedDates: settings.closedDates
    });
  }, [settings]);
  const subtotalCents = useMemo(() => {
    if (!menu) return 0;
    return lines.reduce((sum, line) => sum + getLineTotalCents(line, menu), 0);
  }, [lines, menu]);
  const taxCents = useMemo(() => Math.round(subtotalCents * CLIENT_TAX_RATE), [subtotalCents]);
  const totalCents = useMemo(
    () => roundToNearestNickel(subtotalCents + taxCents),
    [subtotalCents, taxCents]
  );

  async function submit() {
    if (orderState === "ORDERING_OFF") {
      setError(lang === "zh" ? "暫停接單，請稍後再試。" : "Ordering is currently paused.");
      return;
    }
    if (orderState === "CLOSED") {
      setError(lang === "zh" ? "本店目前休息中。" : "The store is currently closed.");
      return;
    }
    if (!phoneLocked) {
      setError(lang === "zh" ? "請先完成電話驗證。" : "Please complete phone verification first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          email,
          phone,
          notes,
          pickupType,
          pickupTime: pickupType === PickupType.SCHEDULED ? pickupTime : undefined,
          honeypot,
          lines
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "結帳失敗。" : "Checkout failed."));
        return;
      }
      clear();
      router.push(`/order/${data.orderNumber}`);
    } catch {
      setError(lang === "zh" ? "網絡錯誤。" : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lines.length) {
    return <div className="rounded bg-[var(--card)] p-4">{lang === "zh" ? "購物車是空的。" : "Cart is empty."}</div>;
  }
  if (!verificationChecked) {
    return <div className="rounded bg-[var(--card)] p-4">{lang === "zh" ? "載入中..." : "Loading..."}</div>;
  }

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回購物車" : "← Back to Cart"}
      </Link>
      <h1 className="text-2xl font-bold">{lang === "zh" ? "結帳" : "Checkout"}</h1>
      <div className="rounded border border-amber-900/20 p-3">
        <div className="font-semibold">{lang === "zh" ? "訂單摘要" : "Order Summary"}</div>
        <div className="mt-2 space-y-1 text-sm">
          {lines.map((line, idx) => (
            <div key={`${line.refId}-${idx}`} className="flex items-start justify-between gap-3">
              <div>
                <span className="font-medium">{line.qty}x </span>
                <span>{localizeText(getLineLabel(line, menu ?? undefined), lang)}</span>
              </div>
              <div className="whitespace-nowrap font-medium">
                {menu ? centsToCurrency(getLineTotalCents(line, menu)) : "—"}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-amber-900/20 pt-2 text-sm">
          <div className="flex justify-between">
            <span>{lang === "zh" ? "小計" : "Subtotal"}</span>
            <span>{centsToCurrency(subtotalCents)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>{lang === "zh" ? "稅項" : "Tax"}</span>
            <span>{centsToCurrency(taxCents)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-bold text-black">
            <span>{lang === "zh" ? "總計" : "Total"}</span>
            <span>{centsToCurrency(totalCents)}</span>
          </div>
        </div>
      </div>
      <label className="block text-sm">
        {lang === "zh" ? "姓名" : "Name"}
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          readOnly={hasKnownProfile}
          className="mt-1 w-full rounded border px-3 py-2 read-only:bg-gray-100"
        />
      </label>
      <label className="block text-sm">
        {lang === "zh" ? "電郵（選填）" : "Email (optional)"}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={hasKnownProfile}
          className="mt-1 w-full rounded border px-3 py-2 read-only:bg-gray-100"
        />
      </label>
      <label className="block text-sm">
        {lang === "zh" ? "電話" : "Phone"}
        <input
          value={phone}
          readOnly
          className="mt-1 w-full rounded border bg-gray-100 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        {lang === "zh" ? "備註（選填）" : "Notes (optional)"}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
        <div className="mt-1 text-xs text-gray-600">
          Please specify any allergies or dietary restrictions. / 如有任何食物過敏或飲食限制，請在此註明。
        </div>
      </label>

      <div className="rounded border border-amber-900/20 p-3">
        <div className="font-semibold">{lang === "zh" ? "取餐時間" : "Pickup Time"}</div>
        <label className="mr-4 inline-flex items-center gap-2">
          <input
            type="radio"
            checked={pickupType === PickupType.ASAP}
            onChange={() => setPickupType(PickupType.ASAP)}
          />
          ASAP
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            checked={pickupType === PickupType.SCHEDULED}
            onChange={() => setPickupType(PickupType.SCHEDULED)}
          />
          {lang === "zh" ? "預約" : "Schedule"}
        </label>
        {pickupType === PickupType.ASAP ? (
          <div className="mt-2 text-sm text-gray-600">{asapText}</div>
        ) : (
          <select
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="mt-2 w-full rounded border p-2"
          >
            <option value="">{lang === "zh" ? "選擇取餐時段" : "Select pickup slot"}</option>
            {slots.map((slot) => (
              <option key={slot.toISOString()} value={slot.toISOString()}>
                {slot.toLocaleDateString()} {fmtTime(slot)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded border border-amber-900/20 p-3">
        <div className="font-semibold">{lang === "zh" ? "取餐地點" : "Pickup Location"}</div>
        <div className="mt-2 text-sm text-gray-700">9425 Leslie St, Richmond Hill, ON L4B 3N7</div>
      </div>

      <div className="rounded border border-amber-900/20 p-3">
        <div className="font-semibold">{lang === "zh" ? "付款方式" : "Payment Method"}</div>
        <label className="mt-2 inline-flex items-center gap-2">
          <input type="radio" checked readOnly />
          {lang === "zh" ? "到店付款（現金）" : "Pay in Person (Cash)"}
        </label>
      </div>

      <input
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      {orderState !== "OPEN" ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {orderState === "CLOSED"
            ? lang === "zh"
              ? "本店目前休息中，暫時不能下單。你仍可瀏覽菜單。"
              : "The store is currently closed. Ordering is unavailable, but you can still view the menu."
            : lang === "zh"
              ? "目前暫停接單。你仍可瀏覽菜單。"
              : "Ordering is currently turned off. You can still view the menu."}
        </div>
      ) : null}
      <button
        onClick={submit}
        disabled={submitting || orderState !== "OPEN" || !phoneLocked}
        className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? (lang === "zh" ? "提交中..." : "Submitting...") : lang === "zh" ? "提交訂單" : "Place Order"}
      </button>
    </div>
  );
}
