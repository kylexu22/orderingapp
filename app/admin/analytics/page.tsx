"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { centsToCurrency } from "@/lib/format";

type AnalyticsResponse = {
  range: { from: string | null; to: string | null };
  summary: {
    completedOrders: number;
    openOrders: number;
    cancelledOrders: number;
    totalRevenueCents: number;
    openRevenueCents: number;
    avgOrderCents: number;
  };
  topItems: Array<{ name: string; qty: number; revenueCents: number }>;
  topCombos: Array<{ name: string; qty: number; revenueCents: number }>;
  hourly: Array<{ hour: number; orders: number; revenueCents: number }>;
  daily: Array<{ date: string; orders: number; revenueCents: number }>;
};

const RANGE_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All Time" }
] as const;

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["id"]>("7d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/analytics?range=${range}`, { cache: "no-store" });
        const payload = (await res.json()) as AnalyticsResponse | { error?: string };
        if (!res.ok) {
          setError((payload as { error?: string })?.error ?? "Failed to load analytics.");
          return;
        }
        setData(payload as AnalyticsResponse);
      } catch {
        setError("Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [range]);

  const maxHourly = useMemo(
    () => Math.max(1, ...(data?.hourly.map((h) => h.orders) ?? [1])),
    [data]
  );
  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily.map((d) => d.revenueCents) ?? [1])),
    [data]
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="rounded border px-4 py-2 text-sm font-semibold">
          Orders
        </Link>
        <Link href="/admin/menu" className="rounded border px-4 py-2 text-sm font-semibold">
          Menu
        </Link>
        <Link href="/admin/settings" className="rounded border px-4 py-2 text-sm font-semibold">
          Settings
        </Link>
        <Link
          href="/admin/analytics"
          className="rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Analytics
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
            className={`rounded border px-4 py-2 text-sm font-semibold ${
              range === option.id ? "bg-[var(--brand)] text-white" : "bg-white text-black"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm">Loading analytics...</p> : null}

      {data ? (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="text-sm text-gray-600">Completed Revenue</div>
              <div className="text-2xl font-bold">{centsToCurrency(data.summary.totalRevenueCents)}</div>
              <div className="mt-1 text-xs text-gray-600">{data.summary.completedOrders} completed orders</div>
            </div>
            <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="text-sm text-gray-600">Open Revenue</div>
              <div className="text-2xl font-bold">{centsToCurrency(data.summary.openRevenueCents)}</div>
              <div className="mt-1 text-xs text-gray-600">{data.summary.openOrders} open orders</div>
            </div>
            <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <div className="text-sm text-gray-600">Avg Completed Order</div>
              <div className="text-2xl font-bold">{centsToCurrency(data.summary.avgOrderCents)}</div>
              <div className="mt-1 text-xs text-gray-600">{data.summary.cancelledOrders} cancelled orders</div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Best Selling Items</h2>
              <div className="mt-2 space-y-2 text-sm">
                {data.topItems.length === 0 ? (
                  <div className="text-gray-600">No completed item sales in this range.</div>
                ) : (
                  data.topItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-2 border-b pb-1">
                      <div className="truncate">{item.name}</div>
                      <div className="whitespace-nowrap">
                        {item.qty} sold | {centsToCurrency(item.revenueCents)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Best Selling Combos</h2>
              <div className="mt-2 space-y-2 text-sm">
                {data.topCombos.length === 0 ? (
                  <div className="text-gray-600">No completed combo sales in this range.</div>
                ) : (
                  data.topCombos.map((combo) => (
                    <div key={combo.name} className="flex items-center justify-between gap-2 border-b pb-1">
                      <div className="truncate">{combo.name}</div>
                      <div className="whitespace-nowrap">
                        {combo.qty} sold | {centsToCurrency(combo.revenueCents)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Orders by Hour (ET)</h2>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {data.hourly.map((h) => {
                const pct = Math.round((h.orders / maxHourly) * 100);
                return (
                  <div key={h.hour} className="flex items-center gap-2 text-xs">
                    <div className="w-10 text-right">{String(h.hour).padStart(2, "0")}:00</div>
                    <div className="h-4 flex-1 bg-gray-100">
                      <div className="h-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-10 text-right">{h.orders}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Daily Revenue (ET)</h2>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {data.daily.length === 0 ? (
                <div className="text-sm text-gray-600">No completed sales in this range.</div>
              ) : (
                data.daily.map((d) => {
                  const pct = Math.round((d.revenueCents / maxDaily) * 100);
                  return (
                    <div key={d.date} className="flex items-center gap-2 text-xs">
                      <div className="w-24">{d.date}</div>
                      <div className="h-4 flex-1 bg-gray-100">
                        <div className="h-full bg-[#1f8d3d]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-24 text-right">{centsToCurrency(d.revenueCents)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

