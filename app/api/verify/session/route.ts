import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVerifiedPhoneFromCookieHeader } from "@/lib/verify-session";
import { getCustomerIdFromCookieHeader } from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const verifiedPhone = getVerifiedPhoneFromCookieHeader(req.headers.get("cookie"));
  const sessionCustomerId = getCustomerIdFromCookieHeader(req.headers.get("cookie"));

  // If no verified phone and no account session, user is not verified.
  if (!verifiedPhone && !sessionCustomerId) {
    return NextResponse.json({ verified: false });
  }

  // Try to resolve session customer first. If DB/customer lookup fails, still fall back to verified phone.
  if (sessionCustomerId) {
    try {
      const sessionCustomer = await prisma.customer.findUnique({
        where: { id: sessionCustomerId },
        select: { id: true, phone: true, name: true, email: true }
      });
      if (sessionCustomer) {
        return NextResponse.json({
          verified: true,
          phone: sessionCustomer.phone,
          customer: sessionCustomer
        });
      }
    } catch {
      // ignore and continue to verified phone fallback
    }
  }

  if (!verifiedPhone) {
    return NextResponse.json({ verified: false });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { phone: verifiedPhone },
      select: { id: true, phone: true, name: true, email: true }
    });
    return NextResponse.json({
      verified: true,
      phone: verifiedPhone,
      customer
    });
  } catch {
    // DB lookup failed (e.g. migration not applied) but phone is still verified.
    return NextResponse.json({
      verified: true,
      phone: verifiedPhone,
      customer: null
    });
  }
}
