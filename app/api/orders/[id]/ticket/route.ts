import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: params.id }, { orderNumber: params.id }] },
    include: {
      lines: {
        include: {
          selections: {
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });
  if (!order) {
    return new Response("Order not found", { status: 404 });
  }

  logInfo("order.print_requested", { orderNumber: order.orderNumber });

  const lineHtml = order.lines
    .map((line) => {
      const selectionHtml = line.selections
        .map((s) => {
          const selected = s.selectedItemNameSnapshot || s.selectedModifierOptionNameSnapshot || "";
          const delta = s.priceDeltaSnapshotCents ? ` (${centsToCurrency(s.priceDeltaSnapshotCents)})` : "";
          return `<div class="subline">- ${esc(s.label)}: ${esc(selected)}${delta}</div>`;
        })
        .join("");
      return `<div class="line"><div><strong>${line.qty} x ${esc(line.nameSnapshot)}</strong></div>${selectionHtml}</div>`;
    })
    .join("");

  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  if (format === "text") {
    const lines: string[] = [];
    lines.push(restaurantName);
    lines.push(`#${order.orderNumber}`);
    lines.push(`Created: ${fmtDateTime(order.createdAt)}`);
    lines.push(`Pickup: ${pickupText}`);
    lines.push(`${order.customerName} | ${order.phone}`);
    lines.push(`Notes: ${order.notes ?? "-"}`);
    lines.push("------------------------------");
    for (const line of order.lines) {
      lines.push(`${line.qty} x ${line.nameSnapshot}`);
      for (const s of line.selections) {
        const selected = s.selectedItemNameSnapshot || s.selectedModifierOptionNameSnapshot || "";
        const delta = s.priceDeltaSnapshotCents ? ` (${centsToCurrency(s.priceDeltaSnapshotCents)})` : "";
        lines.push(`  - ${s.label}: ${selected}${delta}`);
      }
    }
    lines.push("------------------------------");
    lines.push(`Subtotal: ${centsToCurrency(order.subtotalCents)}`);
    lines.push(`Tax: ${centsToCurrency(order.taxCents)}`);
    lines.push(`Total: ${centsToCurrency(order.totalCents)}`);
    lines.push("PAY AT PICKUP (CASH)");
    return new Response(lines.join("\n"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ticket ${esc(order.orderNumber)}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: "Arial", sans-serif; width: 100%; margin: 0; font-size: 14px; }
    .center { text-align: center; }
    .title { font-size: 20px; font-weight: 700; }
    .number { font-size: 24px; font-weight: 800; margin: 6px 0; }
    .section { margin-top: 8px; border-top: 1px dashed #222; padding-top: 8px; }
    .line { margin-top: 6px; }
    .subline { padding-left: 10px; font-size: 13px; }
    .totals { margin-top: 10px; border-top: 1px dashed #222; padding-top: 8px; }
    .paid { margin-top: 10px; text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="center title">${esc(restaurantName)}</div>
  <div class="center number">#${esc(order.orderNumber)}</div>
  <div class="center">Created: ${esc(fmtDateTime(order.createdAt))}</div>
  <div class="center">Pickup: ${esc(pickupText)}</div>
  <div class="section">
    <div><strong>${esc(order.customerName)}</strong> | ${esc(order.phone)}</div>
    <div>Notes: ${esc(order.notes ?? "-")}</div>
  </div>
  <div class="section">${lineHtml}</div>
  <div class="totals">
    <div>Subtotal: ${centsToCurrency(order.subtotalCents)}</div>
    <div>Tax: ${centsToCurrency(order.taxCents)}</div>
    <div><strong>Total: ${centsToCurrency(order.totalCents)}</strong></div>
  </div>
  <div class="paid">PAY AT PICKUP (CASH)</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
