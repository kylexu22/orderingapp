import { StoreHours } from "@/lib/types";

type StoreStatusInput = {
  acceptingOrders: boolean;
  timezone?: string;
  storeHours: StoreHours;
  closedDates: string[];
};

export type StoreOrderState = "OPEN" | "CLOSED" | "ORDERING_OFF";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getDatePartsInTimezone(now: Date, timezone?: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekdayMap: Record<string, string> = {
      Sun: "0",
      Mon: "1",
      Tue: "2",
      Wed: "3",
      Thu: "4",
      Fri: "5",
      Sat: "6"
    };
    return {
      dateKey: `${map.year}-${map.month}-${map.day}`,
      dayKey: weekdayMap[map.weekday] ?? String(now.getDay()),
      minutes: Number(map.hour) * 60 + Number(map.minute)
    };
  } catch {
    return {
      dateKey: now.toISOString().slice(0, 10),
      dayKey: String(now.getDay()),
      minutes: now.getHours() * 60 + now.getMinutes()
    };
  }
}

export function isStoreOpenNow(input: Omit<StoreStatusInput, "acceptingOrders">, now = new Date()) {
  const { dateKey, dayKey, minutes } = getDatePartsInTimezone(now, input.timezone);
  if (input.closedDates.includes(dateKey)) return false;

  const windows = input.storeHours[dayKey] ?? [];
  return windows.some((window) => {
    const open = toMinutes(window.open);
    const close = toMinutes(window.close);
    return minutes >= open && minutes <= close;
  });
}

export function getStoreOrderState(input: StoreStatusInput, now = new Date()): StoreOrderState {
  if (!input.acceptingOrders) return "ORDERING_OFF";
  const open = isStoreOpenNow(input, now);
  return open ? "OPEN" : "CLOSED";
}
