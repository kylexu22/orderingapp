import { StoreHours } from "@/lib/types";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function roundUpMinutes(date: Date, interval: number): Date {
  const next = new Date(date);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / interval) * interval;
  next.setSeconds(0, 0);
  if (rounded >= 60) {
    next.setHours(next.getHours() + 1, rounded - 60, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return next;
}

function toDateAtMinutes(base: Date, totalMinutes: number): Date {
  const d = new Date(base);
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return d;
}

export function getTodaySlots(params: {
  now: Date;
  prepTimeMinutes: number;
  slotIntervalMinutes: number;
  storeHours: StoreHours;
  closedDates: string[];
}) {
  const { now, prepTimeMinutes, slotIntervalMinutes, storeHours, closedDates } = params;
  const isoDate = now.toISOString().slice(0, 10);
  if (closedDates.includes(isoDate)) {
    return [];
  }

  const dayKey = String(now.getDay());
  const windows = storeHours[dayKey] ?? [];
  const earliest = roundUpMinutes(
    new Date(now.getTime() + prepTimeMinutes * 60_000),
    slotIntervalMinutes
  );

  const slots: Date[] = [];
  for (const window of windows) {
    const openMin = toMinutes(window.open);
    const closeMin = toMinutes(window.close);
    let start = Math.max(openMin, earliest.getHours() * 60 + earliest.getMinutes());
    start = Math.ceil(start / slotIntervalMinutes) * slotIntervalMinutes;
    for (let t = start; t <= closeMin; t += slotIntervalMinutes) {
      slots.push(toDateAtMinutes(now, t));
    }
  }
  return slots;
}

export function getAsapReadyTime(params: {
  now: Date;
  prepTimeMinutes: number;
  slotIntervalMinutes: number;
}) {
  return roundUpMinutes(
    new Date(params.now.getTime() + params.prepTimeMinutes * 60_000),
    params.slotIntervalMinutes
  );
}
