const DISPLAY_TIMEZONE = "America/Toronto";

export function centsToCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function roundToNearestNickel(cents: number): number {
  return Math.round(cents / 5) * 5;
}

export function formatPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

export function fmtTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE
  });
}

export function fmtDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE
  });
}
