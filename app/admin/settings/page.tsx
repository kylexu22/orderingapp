"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DayConfig = {
  isClosed: boolean;
  open: string;
  close: string;
};

const DAYS = [
  { key: "0", label: "Sunday" },
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" }
] as const;

function defaultDayConfig(): DayConfig {
  return { isClosed: false, open: "11:00", close: "21:00" };
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(25);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [storeHoursByDay, setStoreHoursByDay] = useState<Record<string, DayConfig>>(() =>
    Object.fromEntries(DAYS.map((d) => [d.key, defaultDayConfig()]))
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load settings.");
          return;
        }
        setPrepTimeMinutes(data.settings.prepTimeMinutes ?? 25);
        setAcceptingOrders(Boolean(data.settings.acceptingOrders));

        const incoming = data.settings.storeHours as
          | Record<string, Array<{ open: string; close: string }>>
          | undefined;
        const normalized = Object.fromEntries(
          DAYS.map((d) => {
            const window = incoming?.[d.key]?.[0];
            if (!window) return [d.key, { isClosed: true, open: "11:00", close: "21:00" }];
            return [d.key, { isClosed: false, open: window.open, close: window.close }];
          })
        ) as Record<string, DayConfig>;
        setStoreHoursByDay(normalized);
      } catch {
        setError("Failed to load settings.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const hasInvalidRange = useMemo(
    () =>
      DAYS.some((d) => {
        const day = storeHoursByDay[d.key];
        if (!day || day.isClosed) return false;
        return day.open >= day.close;
      }),
    [storeHoursByDay]
  );

  function updateDay(day: string, patch: Partial<DayConfig>) {
    setStoreHoursByDay((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch }
    }));
  }

  async function save() {
    setError("");
    setSuccess("");
    if (hasInvalidRange) {
      setError("Open time must be earlier than close time.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepTimeMinutes, acceptingOrders, storeHoursByDay })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save settings.");
        return;
      }
      setSuccess("Settings saved.");
    } catch {
      setError("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="rounded border px-4 py-2 text-sm font-semibold">
          Orders
        </Link>
        <Link href="/admin/menu" className="rounded border px-4 py-2 text-sm font-semibold">
          Menu
        </Link>
        <Link href="/admin/analytics" className="rounded border px-4 py-2 text-sm font-semibold">
          Analytics
        </Link>
        <Link
          href="/admin/settings"
          className="rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Settings
        </Link>
      </div>

      <section className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Store Settings</h1>

        <label className="block text-sm">
          Minimum Pickup Time (minutes)
          <input
            type="number"
            min={1}
            max={180}
            value={prepTimeMinutes}
            onChange={(e) => setPrepTimeMinutes(Number(e.target.value || 0))}
            className="mt-1 w-40 rounded border px-3 py-2"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={acceptingOrders}
            onChange={(e) => setAcceptingOrders(e.target.checked)}
          />
          Accepting Orders
        </label>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Store Hours</h2>
          {DAYS.map((d) => {
            const day = storeHoursByDay[d.key];
            return (
              <div
                key={d.key}
                className="grid grid-cols-1 items-center gap-2 rounded border p-3 md:grid-cols-5"
              >
                <div className="font-semibold">{d.label}</div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={day?.isClosed ?? false}
                    onChange={(e) => updateDay(d.key, { isClosed: e.target.checked })}
                  />
                  Closed
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  Open
                  <input
                    type="time"
                    value={day?.open ?? "11:00"}
                    disabled={day?.isClosed ?? false}
                    onChange={(e) => updateDay(d.key, { open: e.target.value })}
                    className="rounded border px-2 py-1"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  Close
                  <input
                    type="time"
                    value={day?.close ?? "21:00"}
                    disabled={day?.isClosed ?? false}
                    onChange={(e) => updateDay(d.key, { close: e.target.value })}
                    className="rounded border px-2 py-1"
                  />
                </label>
              </div>
            );
          })}
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        <button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving}
          className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </section>
    </div>
  );
}
