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

function HourlyBars({ data }: { data: AnalyticsResponse["hourly"] }) {
  const maxOrders = Math.max(1, ...data.map((h) => h.orders));

  return (
    <div className="space-y-3">
      {data.map((hour) => (
        <div key={hour.hour} className="grid grid-cols-[48px_1fr_40px] items-center gap-2">
          <span className="text-xs text-[#6c5b4c]">{String(hour.hour).padStart(2, "0")}:00</span>
          <div className="h-9 rounded-lg bg-[#f2e8dc] p-1">
            <div
              className="h-full rounded-md bg-gradient-to-r from-[#8b2e24] to-[#af4d41]"
              style={{ width: `${Math.max(4, (hour.orders / maxOrders) * 100)}%` }}
            />
          </div>
          <span className="text-right text-xs font-semibold text-[#5d4b3b]">{hour.orders}</span>
        </div>
      ))}
    </div>
  );
}

function DailyRevenueLine({ data }: { data: AnalyticsResponse["daily"] }) {
  if (data.length === 0) {
    return <div className="rounded-xl border border-dashed border-[#dac8b6] bg-[#fcfaf7] px-4 py-5 text-sm text-[#7d6c59]">No completed sales in this range.</div>;
  }

  const width = 760;
  const height = 220;
  const padding = 28;
  const maxValue = Math.max(1, ...data.map((d) => d.revenueCents));
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data
    .map((d, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (d.revenueCents / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px]">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#c8b7a6" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#c8b7a6" strokeWidth="1" />
        <polyline fill="none" stroke="#1f8d3d" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points} />
        {data.map((d, i) => {
          const x = padding + i * stepX;
          const y = height - padding - (d.revenueCents / maxValue) * (height - padding * 2);
          return (
            <g key={d.date}>
              <circle cx={x} cy={y} r="4" fill="#1f8d3d" />
              <text x={x} y={height - 10} textAnchor="middle" className="fill-[#6c5b4c] text-[10px]">
                {d.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 grid gap-1 text-xs text-[#6c5b4c] md:grid-cols-2">
        {data.map((d) => (
          <div key={`label-${d.date}`} className="flex items-center justify-between rounded bg-[#f8f2ea] px-2 py-1">
            <span>{d.date}</span>
            <span className="font-semibold text-[#2e6c3a]">{centsToCurrency(d.revenueCents)}</span>
          </div>
        ))}
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

  const dailyCount = useMemo(() => data?.daily.length ?? 0, [data]);

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
            <StatCard title="Completed Revenue" value={centsToCurrency(data.summary.totalRevenueCents)} detail={`${data.summary.completedOrders} completed orders`} />
            <StatCard title="Open Revenue" value={centsToCurrency(data.summary.openRevenueCents)} detail={`${data.summary.openOrders} open orders`} />
            <StatCard title="Average Order" value={centsToCurrency(data.summary.avgOrderCents)} detail={`${data.summary.cancelledOrders} cancelled orders`} />
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedList title="Top Selling Items" subtitle="Most purchased individual menu items" rows={data.topItems} />
            <RankedList title="Top Selling Combos" subtitle="Bundles that generate the highest sales" rows={data.topCombos} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Orders by Hour (ET)</h2>
              <p className="mt-1 text-sm text-[#786754]">Rechart-style horizontal bars for peak throughput.</p>
              <div className="mt-4">
                <HourlyBars data={data.hourly} />
              </div>
            </div>

            <div className="rounded-2xl border border-[#e9ded0] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[var(--ink)]">Daily Revenue (ET)</h2>
              <p className="mt-1 text-sm text-[#786754]">Line chart across {dailyCount} day{dailyCount === 1 ? "" : "s"}.</p>
              <div className="mt-4">
                <DailyRevenueLine data={data.daily} />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
