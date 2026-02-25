import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { localizeText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";

export default async function ConfirmationPage({
  params
}: {
  params: { orderNumber: string };
}) {
  const lang = getServerLang();
  const order = await prisma.order.findUnique({
    where: { orderNumber: params.orderNumber },
    include: {
      lines: {
        include: {
          selections: {
            orderBy: { sortOrder: "asc" }
          }
        },
        orderBy: { id: "asc" }
      }
    }
  });
  if (!order) notFound();

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold text-[var(--brand)]">
        {lang === "zh" ? "\u8a02\u55ae\u5df2\u78ba\u8a8d" : "Order Confirmed"}
      </h1>
      <div>
        {lang === "zh" ? "\u8a02\u55ae\u865f\u78bc" : "Order Number"}: <strong>{order.orderNumber}</strong>
      </div>
      <div>{lang === "zh" ? "\u4e0b\u55ae\u6642\u9593" : "Placed"}: {fmtDateTime(order.createdAt)}</div>
      <div>
        {lang === "zh" ? "\u53d6\u9910\u6642\u9593" : "Pickup"}:{" "}
        {order.pickupType === "ASAP"
          ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
          : fmtDateTime(order.pickupTime as Date)}
      </div>
      <div>
        {lang === "zh" ? "\u72c0\u614b" : "Status"}: <strong>{order.status}</strong>
      </div>
      <div>
        {lang === "zh" ? "\u9867\u5ba2" : "Customer"}: {order.customerName} | {order.phone}
      </div>
      {order.notes ? (
        <div>
          {lang === "zh" ? "\u5099\u8a3b" : "Notes"}: {order.notes}
        </div>
      ) : null}

      <section className="space-y-2 rounded border border-amber-900/20 bg-white/60 p-3">
        <h2 className="text-lg font-semibold">
          {lang === "zh" ? "\u8a02\u55ae\u5167\u5bb9" : "Order Summary"}
        </h2>
        {order.lines.map((line) => (
          <div key={line.id} className="border-b border-amber-900/10 pb-2 last:border-b-0 last:pb-0">
            <div className="font-semibold">
              {line.qty} x {localizeText(line.nameSnapshot, lang)}
            </div>
            {formatOrderSelectionsForDisplay({
              selections: line.selections.map((selection) => ({
                ...selection,
                selectedModifierOptionId: selection.selectedModifierOptionId ?? null
              })),
              lang,
              localize: (value) => localizeText(value, lang)
            }).map((row) => (
              <div key={row.key} className={`${row.indent ? "pl-8" : "pl-4"} text-sm text-gray-700`}>
                - {row.text}
              </div>
            ))}
            <div className="mt-1 text-sm">
              {lang === "zh" ? "\u5c0f\u8a08" : "Line total"}: {centsToCurrency(line.lineTotalCents)}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-1 rounded border border-amber-900/20 bg-white/60 p-3 text-sm">
        <div>
          {lang === "zh" ? "\u5c0f\u8a08" : "Subtotal"}: {centsToCurrency(order.subtotalCents)}
        </div>
        <div>
          {lang === "zh" ? "\u7a05\u9805" : "Tax"}: {centsToCurrency(order.taxCents)}
        </div>
        <div className="font-semibold">
          {lang === "zh" ? "\u7e3d\u8a08" : "Total"}: {centsToCurrency(order.totalCents)}
        </div>
      </section>

      <Link href="/menu" className="inline-block rounded-full bg-[var(--brand)] px-4 py-2 text-white">
        {lang === "zh" ? "\u8fd4\u56de\u83dc\u55ae" : "Back to Menu"}
      </Link>
    </div>
  );
}
