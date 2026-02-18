import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkVerifyCode, normalizePhoneToE164 } from "@/lib/twilio-verify";
import { prisma } from "@/lib/prisma";
import {
  buildVerifiedPhoneCookie,
  buildTrustedPhonesCookie,
  getTrustedPhoneCookieMaxAgeSeconds,
  getTrustedPhoneCookieName,
  getTrustedPhonesFromCookieHeader,
  getVerifyCookieMaxAgeSeconds,
  getVerifyCookieName
} from "@/lib/verify-session";
import {
  buildCustomerSessionCookie,
  getCustomerSessionCookieName,
  getCustomerSessionMaxAgeSeconds
} from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  phone: z.string().min(1),
  code: z.string().min(4).max(10)
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const phoneE164 = normalizePhoneToE164(parsed.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
  }

  const rate = checkRateLimit(`verify:check:${ip}:${phoneE164}`, 10, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rate.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    const approved = await checkVerifyCode(phoneE164, parsed.code.trim());
    if (!approved) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(getVerifyCookieName(), buildVerifiedPhoneCookie(phoneE164), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getVerifyCookieMaxAgeSeconds()
    });
    const trusted = getTrustedPhonesFromCookieHeader(req.headers.get("cookie"));
    res.cookies.set(getTrustedPhoneCookieName(), buildTrustedPhonesCookie([...trusted, phoneE164]), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getTrustedPhoneCookieMaxAgeSeconds()
    });
    const existingCustomer = await prisma.customer.findUnique({
      where: { phone: phoneE164 },
      select: { id: true }
    });
    if (existingCustomer) {
      res.cookies.set(getCustomerSessionCookieName(), buildCustomerSessionCookie(existingCustomer.id), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getCustomerSessionMaxAgeSeconds()
      });
    }
    return res;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify code." },
      { status: 400 }
    );
  }
}
