import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedCustomerFromRequest } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const customer = await getAuthenticatedCustomerFromRequest(req);
  if (!customer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      pickupType: true,
      pickupTime: true,
      estimatedReadyTime: true,
      totalCents: true
    },
    take: 50
  });

  return NextResponse.json({ orders });
}

