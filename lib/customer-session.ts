import crypto from "crypto";

const COOKIE_NAME = "customer_session";
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

type Payload = {
  customerId: string;
  ts: number;
};

function getSecret() {
  return process.env.ACCOUNT_SESSION_SECRET ?? process.env.VERIFY_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "dev_account_secret";
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

export function buildCustomerSessionCookie(customerId: string): string {
  const payload: Payload = { customerId, ts: Date.now() };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function getCustomerIdFromCookieHeader(cookieHeader: string | null): string | null {
  const value = getCookieValue(cookieHeader, COOKIE_NAME);
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  if (sign(encoded) !== signature) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as Payload;
    if (!parsed?.customerId || typeof parsed.ts !== "number") return null;
    const ageMs = Date.now() - parsed.ts;
    if (ageMs > MAX_AGE_SECONDS * 1000) return null;
    return parsed.customerId;
  } catch {
    return null;
  }
}

export function getCustomerSessionCookieName() {
  return COOKIE_NAME;
}

export function getCustomerSessionMaxAgeSeconds() {
  return MAX_AGE_SECONDS;
}

