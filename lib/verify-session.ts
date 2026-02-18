import crypto from "crypto";

const COOKIE_NAME = "phone_verified";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const TRUSTED_COOKIE_NAME = "trusted_phones";
const TRUSTED_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

type VerifyPayload = {
  phone: string;
  ts: number;
};

function getSecret() {
  return process.env.VERIFY_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "dev_verify_secret";
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) return part.slice(name.length + 1);
  }
  return null;
}

export function buildVerifiedPhoneCookie(phone: string): string {
  const payload: VerifyPayload = { phone, ts: Date.now() };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function getVerifiedPhoneFromCookieHeader(cookieHeader: string | null): string | null {
  const value = getCookieValue(cookieHeader, COOKIE_NAME);
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  if (sign(encoded) !== signature) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as VerifyPayload;
    if (!parsed?.phone || typeof parsed.ts !== "number") return null;
    const ageMs = Date.now() - parsed.ts;
    if (ageMs > MAX_AGE_SECONDS * 1000) return null;
    return parsed.phone;
  } catch {
    return null;
  }
}

export function getVerifyCookieName() {
  return COOKIE_NAME;
}

export function getVerifyCookieMaxAgeSeconds() {
  return MAX_AGE_SECONDS;
}

type TrustedPayload = {
  phones: string[];
  ts: number;
};

export function getTrustedPhoneCookieName() {
  return TRUSTED_COOKIE_NAME;
}

export function getTrustedPhoneCookieMaxAgeSeconds() {
  return TRUSTED_MAX_AGE_SECONDS;
}

export function getTrustedPhonesFromCookieHeader(cookieHeader: string | null): string[] {
  const value = getCookieValue(cookieHeader, TRUSTED_COOKIE_NAME);
  if (!value) return [];
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return [];
  if (sign(encoded) !== signature) return [];
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as TrustedPayload;
    if (!Array.isArray(parsed?.phones)) return [];
    return parsed.phones.filter((p) => typeof p === "string" && p.length > 0).slice(0, 30);
  } catch {
    return [];
  }
}

export function buildTrustedPhonesCookie(phones: string[]): string {
  const deduped = Array.from(new Set(phones)).slice(0, 30);
  const payload: TrustedPayload = {
    phones: deduped,
    ts: Date.now()
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}
