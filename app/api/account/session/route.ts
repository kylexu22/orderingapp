import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerIdFromCookieHeader } from "@/lib/customer-session";
import { getVerifiedPhoneFromCookieHeader } from "@/lib/verify-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const customerId = getCustomerIdFromCookieHeader(req.headers.get("cookie"));
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, phone: true, name: true, email: true }
      });
      if (customer) {
        return NextResponse.json({ loggedIn: true, hasAccount: true, customer });
      }
    }

    const verifiedPhone = getVerifiedPhoneFromCookieHeader(req.headers.get("cookie"));
    if (!verifiedPhone) {
      return NextResponse.json({ loggedIn: false });
    }

    const customer = await prisma.customer.findUnique({
      where: { phone: verifiedPhone },
      select: { id: true, phone: true, name: true, email: true }
    });

    return NextResponse.json({
      loggedIn: true,
      hasAccount: Boolean(customer),
      customer: customer ?? { id: "verified-phone", phone: verifiedPhone, name: "", email: null }
    });
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}
