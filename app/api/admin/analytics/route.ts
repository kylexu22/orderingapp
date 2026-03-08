import { NextRequest, NextResponse } from "next/server";
import { OrderLineType, OrderStatus } from "@prisma/client";
import { isAuthedRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ET_TIMEZONE = "America/Toronto";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getRangeStart(range: string, now: Date): Date | null {
  if (range === "all") return null;

  const n = new Date(now);
  if (range === "today") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ET_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(n);
    const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
    const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
    return new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  }

  if (range === "7d") {
    n.setDate(n.getDate() - 7);
    return n;
  }

  if (range === "30d") {
    n.setDate(n.getDate() - 30);
    return n;
  }

  return null;
}

function toDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function toHourEt(date: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(date);
  return Number(hour);
}

function toWeekdayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    weekday: "short"
  }).format(date);
}

function getBandLabel(totalCents: number): string {
  if (totalCents < 1500) return "Under $15";
  if (totalCents < 3000) return "$15-$29";
  if (totalCents < 4500) return "$30-$44";
  if (totalCents < 6000) return "$45-$59";
  return "$60+";
}

export async function GET(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  const search = req.nextUrl.searchParams;
  const range = (search.get("range") ?? "7d").toLowerCase();
  const fromParam = search.get("from");
  const toParam = search.get("to");

  const now = new Date();
  const defaultStart = getRangeStart(range, now);

  const fromDate = fromParam ? new Date(fromParam) : defaultStart;
  const toDate = toParam ? new Date(toParam) : now;

  const createdAtFilter =
    fromDate || toDate
      ? {
          gte: fromDate ?? undefined,
          lte: toDate ?? undefined
        }
      : undefined;

  const orders = await prisma.order.findMany({
    where: {
      createdAt: createdAtFilter
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      pickupType: true,
      totalCents: true,
      subtotalCents: true,
      taxCents: true,
      lines: {
        select: {
          id: true,
          lineType: true,
          nameSnapshot: true,
          qty: true,
          lineTotalCents: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const completed = orders.filter((o) => o.status === OrderStatus.PICKED_UP);
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);
  const open = orders.filter(
    (o) => o.status !== OrderStatus.PICKED_UP && o.status !== OrderStatus.CANCELLED
  );

  const totalRevenueCents = completed.reduce((sum, order) => sum + order.totalCents, 0);
  const openRevenueCents = open.reduce((sum, order) => sum + order.totalCents, 0);
  const avgOrderCents = completed.length ? Math.round(totalRevenueCents / completed.length) : 0;
  const totalOrders = orders.length;
  const completedRate = totalOrders ? Math.round((completed.length / totalOrders) * 100) : 0;
  const cancelRate = totalOrders ? Math.round((cancelled.length / totalOrders) * 100) : 0;

  const itemMap = new Map<string, { name: string; qty: number; revenueCents: number }>();
  const comboMap = new Map<string, { name: string; qty: number; revenueCents: number }>();
  let itemRevenueCents = 0;
  let comboRevenueCents = 0;
  let itemQty = 0;
  let comboQty = 0;
  for (const order of completed) {
    for (const line of order.lines) {
      const target = line.lineType === OrderLineType.COMBO ? comboMap : itemMap;
      const key = line.nameSnapshot.trim();
      const prev = target.get(key) ?? { name: key, qty: 0, revenueCents: 0 };
      prev.qty += line.qty;
      prev.revenueCents += line.lineTotalCents;
      target.set(key, prev);

      if (line.lineType === OrderLineType.COMBO) {
        comboRevenueCents += line.lineTotalCents;
        comboQty += line.qty;
      } else {
        itemRevenueCents += line.lineTotalCents;
        itemQty += line.qty;
      }
    }
  }

  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topCombos = [...comboMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenueCents: 0
  }));
  for (const order of completed) {
    const h = toHourEt(order.createdAt);
    hourBuckets[h].orders += 1;
    hourBuckets[h].revenueCents += order.totalCents;
  }

  const dayMap = new Map<string, { date: string; orders: number; revenueCents: number }>();
  const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayMap = new Map<string, { day: string; orders: number; revenueCents: number; avgOrderCents: number }>(
    weekdayOrder.map((day) => [day, { day, orders: 0, revenueCents: 0, avgOrderCents: 0 }])
  );
  const orderValueBandOrder = ["Under $15", "$15-$29", "$30-$44", "$45-$59", "$60+"];
  const orderValueMap = new Map<string, { band: string; orders: number }>(
    orderValueBandOrder.map((band) => [band, { band, orders: 0 }])
  );
  const pickupMap = new Map<string, { type: string; orders: number }>([
    ["ASAP", { type: "ASAP", orders: 0 }],
    ["SCHEDULED", { type: "Scheduled", orders: 0 }]
  ]);

  for (const order of completed) {
    const key = toDayKey(order.createdAt);
    const prev = dayMap.get(key) ?? { date: key, orders: 0, revenueCents: 0 };
    prev.orders += 1;
    prev.revenueCents += order.totalCents;
    dayMap.set(key, prev);

    const weekdayKey = toWeekdayKey(order.createdAt);
    const weekday = weekdayMap.get(weekdayKey);
    if (weekday) {
      weekday.orders += 1;
      weekday.revenueCents += order.totalCents;
    }

    const band = orderValueMap.get(getBandLabel(order.totalCents));
    if (band) band.orders += 1;

    const pickup = pickupMap.get(order.pickupType);
    if (pickup) pickup.orders += 1;
  }
  const daily = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-31)
    .map((day) => ({
      ...day,
      avgOrderCents: day.orders ? Math.round(day.revenueCents / day.orders) : 0
    }));
  const weekday = weekdayOrder
    .map((day) => weekdayMap.get(day)!)
    .map((day) => ({
      ...day,
      avgOrderCents: day.orders ? Math.round(day.revenueCents / day.orders) : 0
    }));
  const orderValueBands = orderValueBandOrder.map((band) => orderValueMap.get(band)!);
  const pickupTypes = [...pickupMap.values()];
  const statusBreakdown = [
    { status: "Completed", value: completed.length },
    { status: "Open", value: open.length },
    { status: "Cancelled", value: cancelled.length }
  ];
  const salesMix = [
    { name: "Items", qty: itemQty, revenueCents: itemRevenueCents },
    { name: "Combos", qty: comboQty, revenueCents: comboRevenueCents }
  ];

  return NextResponse.json({
    range: {
      from: fromDate?.toISOString() ?? null,
      to: toDate?.toISOString() ?? null
    },
    summary: {
      totalOrders,
      completedOrders: completed.length,
      openOrders: open.length,
      cancelledOrders: cancelled.length,
      totalRevenueCents,
      openRevenueCents,
      avgOrderCents,
      completedRate,
      cancelRate
    },
    topItems,
    topCombos,
    statusBreakdown,
    weekday,
    orderValueBands,
    pickupTypes,
    salesMix,
    hourly: hourBuckets,
    daily
  });
}
