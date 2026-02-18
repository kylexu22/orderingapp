import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizePhoneToE164, sendVerifyCode } from "@/lib/twilio-verify";
import {
  buildVerifiedPhoneCookie,
  getTrustedPhonesFromCookieHeader,
  getVerifyCookieMaxAgeSeconds,
  getVerifyCookieName
} from "@/lib/verify-session";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerSessionCookie,
  getCustomerSessionCookieName,
  getCustomerSessionMaxAgeSeconds
} from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  phone: z.string().min(1)
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

  const trustedPhones = getTrustedPhonesFromCookieHeader(req.headers.get("cookie"));
  if (trustedPhones.includes(phoneE164)) {
    const res = NextResponse.json({ ok: true, skipVerification: true });
    res.cookies.set(getVerifyCookieName(), buildVerifiedPhoneCookie(phoneE164), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getVerifyCookieMaxAgeSeconds()
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
  }

  const rate = checkRateLimit(`verify:start:${ip}:${phoneE164}`, 5, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rate.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    await sendVerifyCode(phoneE164);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send verification code." },
      { status: 400 }
    );
  }
}
