"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PickupType } from "@prisma/client";
import { useCart } from "@/lib/cart-store";
import { fmtTime } from "@/lib/format";
import { getAsapReadyTime, getTodaySlots } from "@/lib/pickup";
import { StoreHours } from "@/lib/types";

type SettingsPayload = {
  prepTimeMinutes: number;
  slotIntervalMinutes: number;
  storeHours: StoreHours;
  closedDates: string[];
};

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, clear } = useCart();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pickupType, setPickupType] = useState<PickupType>(PickupType.ASAP);
  const [pickupTime, setPickupTime] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/menu")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings({
            prepTimeMinutes: data.settings.prepTimeMinutes,
            slotIntervalMinutes: data.settings.slotIntervalMinutes,
            storeHours: data.settings.storeHours,
            closedDates: data.settings.closedDates
          });
        }
      });
  }, []);

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
    return `Estimated ready at ${fmtTime(estimate)}`;
  }, [settings]);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
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
        setError(data.error ?? "Checkout failed.");
        return;
      }
      clear();
      router.push(`/order/${data.orderNumber}`);
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lines.length) {
    return <div className="rounded bg-[var(--card)] p-4">Cart is empty.</div>;
  }

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <label className="block text-sm">
        Name
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Phone
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>

      <div className="rounded border border-amber-900/20 p-3">
        <div className="font-semibold">Pickup Time</div>
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
          Schedule
        </label>
        {pickupType === PickupType.ASAP ? (
          <div className="mt-2 text-sm text-gray-600">{asapText}</div>
        ) : (
          <select
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="mt-2 w-full rounded border p-2"
          >
            <option value="">Select pickup slot</option>
            {slots.map((slot) => (
              <option key={slot.toISOString()} value={slot.toISOString()}>
                {slot.toLocaleDateString()} {fmtTime(slot)}
              </option>
            ))}
          </select>
        )}
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
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Place Order"}
      </button>
    </div>
  );
}
