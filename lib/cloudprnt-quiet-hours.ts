const CLOUDPRNT_QUIET_HOURS_START = process.env.CLOUDPRNT_QUIET_HOURS_START ?? "22:30";
const CLOUDPRNT_QUIET_HOURS_END = process.env.CLOUDPRNT_QUIET_HOURS_END ?? "10:00";
const CLOUDPRNT_QUIET_HOURS_TIMEZONE =
  process.env.CLOUDPRNT_QUIET_HOURS_TIMEZONE ?? "America/Toronto";

function parseClockToMinutes(raw: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour * 60 + minute;
}

function getMinutesInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isWithinCloudPrntQuietHours(now = new Date()) {
  const startMinutes = parseClockToMinutes(CLOUDPRNT_QUIET_HOURS_START);
  const endMinutes = parseClockToMinutes(CLOUDPRNT_QUIET_HOURS_END);
  if (startMinutes === null || endMinutes === null) return false;

  const currentMinutes = getMinutesInTimezone(now, CLOUDPRNT_QUIET_HOURS_TIMEZONE);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function getCloudPrntQuietHoursConfig() {
  return {
    start: CLOUDPRNT_QUIET_HOURS_START,
    end: CLOUDPRNT_QUIET_HOURS_END,
    timezone: CLOUDPRNT_QUIET_HOURS_TIMEZONE
  };
}
