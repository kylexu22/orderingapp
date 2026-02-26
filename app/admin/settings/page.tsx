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
  const [receiptDebugMode, setReceiptDebugMode] = useState(false);
  const [storeHoursByDay, setStoreHoursByDay] = useState<Record<string, DayConfig>>(() =>
    Object.fromEntries(DAYS.map((d) => [d.key, defaultDayConfig()]))
  );
  const [previewOrderNumber, setPreviewOrderNumber] = useState("");
  const [previewCopyType, setPreviewCopyType] = useState<"FRONT" | "KITCHEN">("FRONT");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMeta, setPreviewMeta] = useState("");
  const [previewError, setPreviewError] = useState("");
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
        setReceiptDebugMode(Boolean(data.settings.receiptDebugMode));

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
        body: JSON.stringify({ prepTimeMinutes, acceptingOrders, storeHoursByDay, receiptDebugMode })
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

  function previewReceiptPng() {
    setPreviewError("");
    setPreviewMeta("");
    const orderNumber = previewOrderNumber.trim();
    if (!orderNumber) {
      setPreviewError("Enter an order number first.");
      return;
    }
    const nextUrl = `/api/admin/cloudprnt/preview?orderNumber=${encodeURIComponent(
      orderNumber
    )}&copyType=${previewCopyType}&format=png&t=${Date.now()}`;
    setPreviewUrl(nextUrl);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="inline-flex w-28 justify-center rounded border px-4 py-2 text-sm font-semibold">
          Orders
        </Link>
        <Link href="/admin/menu" className="inline-flex w-28 justify-center rounded border px-4 py-2 text-sm font-semibold">
          Menu
        </Link>
        <Link href="/admin/analytics" className="inline-flex w-28 justify-center rounded border px-4 py-2 text-sm font-semibold">
          Analytics
        </Link>
        <Link
          href="/admin/settings"
          className="inline-flex w-28 justify-center rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
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

        <section className="space-y-3 border-t pt-4">
          <h2 className="text-lg font-semibold">Receipt Debug</h2>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={receiptDebugMode}
              onChange={(e) => {
                const checked = e.target.checked;
                setReceiptDebugMode(checked);
                if (!checked) {
                  setPreviewUrl("");
                  setPreviewError("");
                  setPreviewMeta("");
                }
              }}
            />
            Receipt Debug Mode (preview final PNG output)
          </label>

          {receiptDebugMode ? (
            <section className="space-y-3 rounded border bg-white p-3">
              <h3 className="text-lg font-semibold">Receipt PNG Preview</h3>
              <p className="text-sm text-gray-700">
                Render the exact final PNG that CloudPRNT serves. Use this to check whitespace and
                overall receipt height.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                <input
                  type="text"
                  value={previewOrderNumber}
                  onChange={(e) => setPreviewOrderNumber(e.target.value)}
                  placeholder="Order number (e.g. 260225-6119)"
                  className="rounded border px-3 py-2 text-sm"
                />
                <select
                  value={previewCopyType}
                  onChange={(e) => setPreviewCopyType(e.target.value as "FRONT" | "KITCHEN")}
                  className="rounded border px-3 py-2 text-sm"
                >
                  <option value="FRONT">Front</option>
                  <option value="KITCHEN">Kitchen</option>
                </select>
                <button
                  type="button"
                  onClick={previewReceiptPng}
                  className="rounded bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Preview PNG
                </button>
              </div>
              {previewError ? <p className="text-sm text-red-700">{previewError}</p> : null}
              {previewMeta ? <p className="text-sm text-gray-700">{previewMeta}</p> : null}
              {previewUrl ? (
                <div className="overflow-auto rounded border bg-[#f7f7f7] p-2">
                  <img
                    src={previewUrl}
                    alt="Receipt PNG preview"
                    className="max-w-full"
                    onLoad={(event) =>
                      setPreviewMeta(
                        `Rendered image size: ${event.currentTarget.naturalWidth} x ${event.currentTarget.naturalHeight}px`
                      )
                    }
                    onError={() => {
                      setPreviewMeta("");
                      setPreviewError("Preview failed. Check order number and try again.");
                    }}
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </section>

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
