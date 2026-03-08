"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { centsToCurrency } from "@/lib/format";

type AnalyticsResponse = {
  range: { from: string | null; to: string | null };
  summary: {
    totalOrders: number;
    completedOrders: number;
    openOrders: number;
    cancelledOrders: number;
    totalRevenueCents: number;
    openRevenueCents: number;
    avgOrderCents: number;
    completedRate: number;
    cancelRate: number;
  };
  topItems: Array<{ name: string; qty: number; revenueCents: number }>;
  topCombos: Array<{ name: string; qty: number; revenueCents: number }>;
  statusBreakdown: Array<{ status: string; value: number }>;
  weekday: Array<{ day: string; orders: number; revenueCents: number; avgOrderCents: number }>;
  orderValueBands: Array<{ band: string; orders: number }>;
  pickupTypes: Array<{ type: string; orders: number }>;
  salesMix: Array<{ name: string; qty: number; revenueCents: number }>;
  hourly: Array<{ hour: number; orders: number; revenueCents: number }>;
  daily: Array<{ date: string; orders: number; revenueCents: number; avgOrderCents: number }>;
};

const RANGE_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All Time" }
] as const;

const PIE_COLORS = ["#1f8d3d", "#f59e0b", "#d9485f", "#0f766e", "#2563eb"];

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
    notation: "compact"
  }).format(value / 100);
}

function formatRangeLabel(range: AnalyticsResponse["range"]) {
  if (!range.from || !range.to) return "All recorded orders";
  const from = new Date(range.from);
  const to = new Date(range.to);
  return `${from.toLocaleDateString("en-CA", { month: "short", day: "numeric" })} - ${to.toLocaleDateString(
    "en-CA",
    { month: "short", day: "numeric" }
  )}`;
}

function ChartCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "brand"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "brand" | "gold" | "rose" | "teal";
}) {
  const toneClass =
    tone === "gold"
      ? "from-amber-50 to-orange-50 text-amber-900"
      : tone === "rose"
        ? "from-rose-50 to-pink-50 text-rose-900"
        : tone === "teal"
          ? "from-teal-50 to-emerald-50 text-teal-900"
          : "from-emerald-50 to-lime-50 text-emerald-900";

  return (
    <div className={`rounded-[24px] bg-gradient-to-br ${toneClass} p-5`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-2 text-sm opacity-80">{detail}</div>
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

  const trendData = useMemo(
    () =>
      (data?.daily ?? []).map((day) => ({
        ...day,
        shortDate: new Date(`${day.date}T12:00:00`).toLocaleDateString("en-CA", {
          month: "short",
          day: "numeric"
        })
      })),
    [data]
  );

  const hourlyData = useMemo(
    () =>
      (data?.hourly ?? []).map((slot) => ({
        ...slot,
        label: `${String(slot.hour).padStart(2, "0")}:00`
      })),
    [data]
  );

  const leaderboard = useMemo(() => {
    const items = data?.topItems?.[0];
    const combos = data?.topCombos?.[0];
    return { items, combos };
  }, [data]);

  const activeRange = useMemo(() => formatRangeLabel(data?.range ?? { from: null, to: null }), [data]);

  return (
    <div className="space-y-5 pb-10">
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/orders" className="inline-flex w-28 justify-center rounded-xl border px-4 py-2 text-sm font-semibold">
          Orders
        </Link>
        <Link href="/admin/menu" className="inline-flex w-28 justify-center rounded-xl border px-4 py-2 text-sm font-semibold">
          Menu
        </Link>
        <Link
          href="/admin/analytics"
          className="inline-flex w-28 justify-center rounded-xl border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Analytics
        </Link>
        <Link href="/admin/settings" className="inline-flex w-28 justify-center rounded-xl border px-4 py-2 text-sm font-semibold">
          Settings
        </Link>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/5 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{activeRange}</span>
          {data ? ` • ${data.summary.totalOrders} orders tracked • ${data.summary.completedRate}% completed` : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRange(option.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                range === option.id
                  ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading analytics...</p> : null}

      {data ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Completed Revenue"
              value={centsToCurrency(data.summary.totalRevenueCents)}
              detail={`${data.summary.completedOrders} completed orders`}
              tone="brand"
            />
            <MetricCard
              label="Average Ticket"
              value={centsToCurrency(data.summary.avgOrderCents)}
              detail={`${data.summary.cancelRate}% cancellation rate`}
              tone="gold"
            />
            <MetricCard
              label="Open Revenue"
              value={centsToCurrency(data.summary.openRevenueCents)}
              detail={`${data.summary.openOrders} orders still active`}
              tone="teal"
            />
            <MetricCard
              label="Top Sellers"
              value={leaderboard.items?.name ?? leaderboard.combos?.name ?? "No sales yet"}
              detail={
                leaderboard.items
                  ? `${leaderboard.items.qty} item sales led this window`
                  : leaderboard.combos
                    ? `${leaderboard.combos.qty} combo sales led this window`
                    : "No completed sales in this range"
              }
              tone="rose"
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
            <ChartCard title="Revenue Trend" subtitle="Daily revenue with order volume overlay">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#16a34a" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="shortDate" tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => formatCompactCurrency(value)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "Revenue" ? centsToCurrency(value) : value
                      }
                    />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenueCents"
                      stroke="#16a34a"
                      strokeWidth={3}
                      fill="url(#revenueFill)"
                      name="Revenue"
                    />
                    <Bar yAxisId="right" dataKey="orders" fill="#0f172a" radius={[8, 8, 0, 0]} name="Orders" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Order Status Mix" subtitle="Current order outcome distribution">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.statusBreakdown}
                      dataKey="value"
                      nameKey="status"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={4}
                    >
                      {data.statusBreakdown.map((entry, index) => (
                        <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard title="Demand by Hour" subtitle="Completed orders by hour in ET">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#14532d" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Weekday Performance" subtitle="Revenue and average ticket by weekday">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weekday}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => formatCompactCurrency(value)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) => formatCompactCurrency(value)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "Revenue" || name === "Avg Ticket" ? centsToCurrency(value) : value
                      }
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenueCents" fill="#0f766e" radius={[8, 8, 0, 0]} name="Revenue" />
                    <Bar yAxisId="right" dataKey="avgOrderCents" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Avg Ticket" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Ticket Size Distribution" subtitle="How basket size is spread across completed orders">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.orderValueBands} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="band" tickLine={false} axisLine={false} width={88} />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#7c3aed" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
            <ChartCard title="Sales Mix" subtitle="Revenue split between individual items and combos">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.salesMix}
                      dataKey="revenueCents"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={3}
                    >
                      {data.salesMix.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => centsToCurrency(value)} />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Pickup Timing" subtitle="Completed order mix by fulfillment preference">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.pickupTypes}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="type" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="orders" fill="#2563eb" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Sales Leaders" subtitle="Highest-volume products in this range">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Top Items</div>
                  <div className="mt-3 space-y-3">
                    {data.topItems.slice(0, 4).map((item, index) => (
                      <div key={item.name} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0">
                        <div>
                          <div className="font-medium text-slate-900">
                            {index + 1}. {item.name}
                          </div>
                          <div className="text-slate-500">{item.qty} sold</div>
                        </div>
                        <div className="whitespace-nowrap font-semibold text-slate-900">{centsToCurrency(item.revenueCents)}</div>
                      </div>
                    ))}
                    {data.topItems.length === 0 ? <div className="text-sm text-slate-500">No completed item sales.</div> : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Top Combos</div>
                  <div className="mt-3 space-y-3">
                    {data.topCombos.slice(0, 4).map((combo, index) => (
                      <div key={combo.name} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0">
                        <div>
                          <div className="font-medium text-slate-900">
                            {index + 1}. {combo.name}
                          </div>
                          <div className="text-slate-500">{combo.qty} sold</div>
                        </div>
                        <div className="whitespace-nowrap font-semibold text-slate-900">{centsToCurrency(combo.revenueCents)}</div>
                      </div>
                    ))}
                    {data.topCombos.length === 0 ? <div className="text-sm text-slate-500">No completed combo sales.</div> : null}
                  </div>
                </div>
              </div>
            </ChartCard>
          </section>
        </>
      ) : null}
    </div>
  );
}
