import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, fmtTime } from "@/lib/format";

export default async function ConfirmationPage({
  params
}: {
  params: { orderNumber: string };
}) {
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber }
  });
  if (!order) notFound();

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold text-[var(--brand)]">Order Confirmed</h1>
      <div>
        Order Number: <strong>{order.orderNumber}</strong>
      </div>
      <div>Placed: {fmtDateTime(order.createdAt)}</div>
      <div>
        Pickup:{" "}
        {order.pickupType === "ASAP"
          ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
          : fmtDateTime(order.pickupTime as Date)}
      </div>
      <Link href="/" className="inline-block rounded bg-[var(--brand)] px-4 py-2 text-white">
        Back to Menu
      </Link>
    </div>
  );
}
