import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { broadcastOrderEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const validStatuses = new Set(Object.values(OrderStatus));

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const nextStatus = body?.status as OrderStatus;
  if (!validStatuses.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const order = await prisma.order.update({
    where: { id: params.id },
    data: { status: nextStatus }
  });

  broadcastOrderEvent({
    type: "ORDER_UPDATED",
    payload: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString()
    }
  });

  return NextResponse.json({ ok: true, order });
}
