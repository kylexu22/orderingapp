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

function StatCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d6c59]">{title}</div>
      <div className="mt-3 text-3xl font-bold leading-none text-[var(--ink)]">{value}</div>
      <div className="mt-2 text-sm text-[#786754]">{detail}</div>
    </div>
  );
}

function RankedList({
  title,
  subtitle,
  rows
}: {
  title: string;
  subtitle: string;
  rows: Array<{ name: string; qty: number; revenueCents: number }>;
}) {
  return (
    <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-sm text-[#786754]">{subtitle}</p>
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dac8b6] bg-[#fcfaf7] px-4 py-5 text-sm text-[#7d6c59]">
            No data for this range.
          </div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.name} className="flex items-center gap-3 rounded-xl border border-[#efe5d9] bg-[#fdfaf6] px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#efe1ce] text-xs font-bold text-[#80553f]">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--ink)]">{row.name}</div>
                <div className="text-xs text-[#8a7766]">{row.qty} sold</div>
              </div>
              <div className="text-sm font-semibold text-[#2e6c3a]">{centsToCurrency(row.revenueCents)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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

  const maxHourly = useMemo(() => Math.max(1, ...(data?.hourly.map((h) => h.orders) ?? [1])), [data]);
  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily.map((d) => d.revenueCents) ?? [1])), [data]);

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-3xl border border-[#e1d2c1] bg-gradient-to-br from-[#fffaf1] via-[#fdf8f0] to-[#f5ede2] p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#846b54]">Admin Intelligence</div>
            <h1 className="mt-1 text-2xl font-bold text-[var(--ink)]">Store Analytics Overview</h1>
            <p className="mt-1 text-sm text-[#7b6b58]">Revenue, order velocity, and top products in a single dashboard.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/orders" className="inline-flex w-24 justify-center rounded-full border border-[#d8c8b8] bg-white px-4 py-2 text-sm font-semibold">
              Orders
            </Link>
            <Link href="/admin/menu" className="inline-flex w-24 justify-center rounded-full border border-[#d8c8b8] bg-white px-4 py-2 text-sm font-semibold">
              Menu
            </Link>
            <Link
              href="/admin/analytics"
              className="inline-flex w-24 justify-center rounded-full border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            >
              Analytics
            </Link>
            <Link href="/admin/settings" className="inline-flex w-24 justify-center rounded-full border border-[#d8c8b8] bg-white px-4 py-2 text-sm font-semibold">
              Settings
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRange(option.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                range === option.id
                  ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                  : "border-[#d8c8b8] bg-white text-[#5f5144]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-[#6f5f4f]">Loading analytics...</p> : null}

      {data ? (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard
              title="Completed Revenue"
              value={centsToCurrency(data.summary.totalRevenueCents)}
              detail={`${data.summary.completedOrders} completed orders`}
            />
            <StatCard
              title="Open Revenue"
              value={centsToCurrency(data.summary.openRevenueCents)}
              detail={`${data.summary.openOrders} open orders`}
            />
            <StatCard
              title="Average Order"
              value={centsToCurrency(data.summary.avgOrderCents)}
              detail={`${data.summary.cancelledOrders} cancelled orders`}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedList title="Top Selling Items" subtitle="Most purchased individual menu items" rows={data.topItems} />
            <RankedList title="Top Selling Combos" subtitle="Bundles that generate the highest sales" rows={data.topCombos} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Orders by Hour (ET)</h2>
              <p className="mt-1 text-sm text-[#786754]">Peak throughput by hour of day.</p>
              <div className="mt-4 space-y-2">
                {data.hourly.map((hour) => {
                  const percent = Math.round((hour.orders / maxHourly) * 100);
                  return (
                    <div key={hour.hour} className="grid grid-cols-[50px_1fr_48px] items-center gap-2 text-xs">
                      <div className="text-right text-[#6c5b4c]">{String(hour.hour).padStart(2, "0")}:00</div>
                      <div className="h-3 overflow-hidden rounded-full bg-[#efe4d8]">
                        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="text-right font-semibold text-[#5d4b3b]">{hour.orders}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Daily Revenue (ET)</h2>
              <p className="mt-1 text-sm text-[#786754]">Completed revenue trend in selected range.</p>
              <div className="mt-4 space-y-2">
                {data.daily.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#dac8b6] bg-[#fcfaf7] px-4 py-5 text-sm text-[#7d6c59]">
                    No completed sales in this range.
                  </div>
                ) : (
                  data.daily.map((day) => {
                    const percent = Math.round((day.revenueCents / maxDaily) * 100);
                    return (
                      <div key={day.date} className="grid grid-cols-[90px_1fr_90px] items-center gap-2 text-xs">
                        <div className="truncate text-[#6c5b4c]">{day.date}</div>
                        <div className="h-3 overflow-hidden rounded-full bg-[#dce9dc]">
                          <div className="h-full rounded-full bg-[#1f8d3d]" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="text-right font-semibold text-[#2e6c3a]">{centsToCurrency(day.revenueCents)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
