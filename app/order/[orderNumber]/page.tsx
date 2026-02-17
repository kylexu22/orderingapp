import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { getServerLang } from "@/lib/i18n-server";

export default async function ConfirmationPage({
  params
}: {
  params: { orderNumber: string };
}) {
  const lang = getServerLang();
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber }
  });
  if (!order) notFound();

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold text-[var(--brand)]">
        {lang === "zh" ? "訂單已確認" : "Order Confirmed"}
      </h1>
      <div>
        {lang === "zh" ? "訂單號碼" : "Order Number"}: <strong>{order.orderNumber}</strong>
      </div>
      <div>{lang === "zh" ? "下單時間" : "Placed"}: {fmtDateTime(order.createdAt)}</div>
      <div>
        {lang === "zh" ? "取餐時間" : "Pickup"}:{" "}
        {order.pickupType === "ASAP"
          ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
          : fmtDateTime(order.pickupTime as Date)}
      </div>
      <Link href="/menu" className="inline-block rounded bg-[var(--brand)] px-4 py-2 text-white">
        {lang === "zh" ? "返回菜單" : "Back to Menu"}
      </Link>
    </div>
  );
}
