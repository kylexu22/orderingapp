import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerSessionCookie,
  getCustomerSessionCookieName,
  getCustomerSessionMaxAgeSeconds
} from "@/lib/customer-session";
import { normalizePhoneToE164 } from "@/lib/twilio-verify";
import {
  getTrustedPhonesFromCookieHeader,
  getVerifiedPhoneFromCookieHeader
} from "@/lib/verify-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  phone: z.string().min(1)
});

export async function POST(req: Request) {
  try {
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

    const cookieHeader = req.headers.get("cookie");
    const trustedPhones = getTrustedPhonesFromCookieHeader(cookieHeader);
    const verifiedPhone = getVerifiedPhoneFromCookieHeader(cookieHeader);
    const canLoginWithoutOtp = trustedPhones.includes(phoneE164) || verifiedPhone === phoneE164;
    if (!canLoginWithoutOtp) {
      return NextResponse.json({ error: "Phone not trusted on this device. Please verify first." }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { phone: phoneE164 },
      select: { id: true, phone: true, name: true, email: true }
    });
    if (!customer) {
      return NextResponse.json({ error: "No account found for this number yet." }, { status: 404 });
    }

    const res = NextResponse.json({ ok: true, customer });
    res.cookies.set(getCustomerSessionCookieName(), buildCustomerSessionCookie(customer.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getCustomerSessionMaxAgeSeconds()
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
