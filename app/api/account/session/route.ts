import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerIdFromCookieHeader } from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const customerId = getCustomerIdFromCookieHeader(req.headers.get("cookie"));
    if (!customerId) {
      return NextResponse.json({ loggedIn: false });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, name: true, email: true }
    });
    if (!customer) {
      return NextResponse.json({ loggedIn: false });
    }

    return NextResponse.json({ loggedIn: true, customer });
  } catch {
    return NextResponse.json({ loggedIn: false });
  }
}
