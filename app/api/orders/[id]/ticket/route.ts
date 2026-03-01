import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { logInfo } from "@/lib/logger";
import { localizeText } from "@/lib/i18n";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isDrinkCategory(category: { id: string; name: string } | null | undefined) {
  if (!category) return false;
  if (category.id === "cat_manual_drinks") return true;
  return /\bdrinks?\b|\bbeverages?\b|飲品|飲料/i.test(category.name);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const kitchen = searchParams.get("kitchen") === "1";
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

  const toZh = (value: string | null | undefined) => localizeText(value, "zh");
  const lineRefIds = Array.from(new Set(order.lines.map((line) => line.refId)));
  const itemCategoryRows = lineRefIds.length
    ? await prisma.item.findMany({
        where: { id: { in: lineRefIds } },
        select: {
          id: true,
          category: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    : [];
  const drinkItemIds = new Set(
    itemCategoryRows.filter((item) => isDrinkCategory(item.category)).map((item) => item.id)
  );
  const printableLines = order.lines.filter((line) => !(kitchen && drinkItemIds.has(line.refId)));
  const isDrinkModifier = (selection: (typeof order.lines)[number]["selections"][number]) => {
    const optionId = selection.selectedModifierOptionId ?? "";
    const label = selection.label ?? "";
    return (
      optionId.startsWith("modopt_add_drink_") ||
      /add drink|drink surcharge|加配飲品|凍飲/i.test(label)
    );
  };

  const lineHtml = printableLines
    .map((line) => {
      const selectionHtml = formatOrderSelectionsForDisplay({
        selections: line.selections
          .filter((s) => !(kitchen && s.selectionKind === "MODIFIER" && isDrinkModifier(s)))
          .map((s) => ({
            ...s,
            selectedModifierOptionId: s.selectedModifierOptionId ?? null
          })),
        lang: kitchen ? "zh" : "en",
        localize: (value) => (kitchen ? toZh(value) : value ?? "")
      })
        .map((row) => {
          const leftPad = row.indent ? " style=\"padding-left: 48px\"" : "";
          return `<div class="subline"${leftPad}>- ${esc(row.text)}</div>`;
        })
        .join("");
      const lineName = kitchen ? toZh(line.nameSnapshot) : line.nameSnapshot;
      return `<div class="line"><div><strong>${line.qty} x ${esc(lineName)}</strong></div>${selectionHtml}</div>`;
    })
    .join("");

  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  if (format === "text") {
    const lines: string[] = [];
    lines.push(restaurantName);
    if (kitchen) lines.push("KITCHEN COPY");
    lines.push(`#${order.orderNumber}`);
    lines.push(`Created: ${fmtDateTime(order.createdAt)}`);
    lines.push(`Pickup: ${pickupText}`);
    lines.push(`${order.customerName} | ${order.phone}`);
    lines.push(`Notes: ${order.notes ?? "-"}`);
    lines.push("------------------------------");
    for (const line of printableLines) {
      const lineName = kitchen ? toZh(line.nameSnapshot) : line.nameSnapshot;
      lines.push(`${line.qty} x ${lineName}`);
      for (const row of formatOrderSelectionsForDisplay({
        selections: line.selections
          .filter((sel) => !(kitchen && sel.selectionKind === "MODIFIER" && isDrinkModifier(sel)))
          .map((sel) => ({
            ...sel,
            selectedModifierOptionId: sel.selectedModifierOptionId ?? null
          })),
        lang: kitchen ? "zh" : "en",
        localize: (value) => (kitchen ? toZh(value) : value ?? "")
      })) {
        lines.push(`${row.indent ? "    " : "  "}- ${row.text}`);
      }
    }
    if (!kitchen) {
      lines.push("------------------------------");
      lines.push(`Subtotal: ${centsToCurrency(order.subtotalCents)}`);
      lines.push(`Tax: ${centsToCurrency(order.taxCents)}`);
      lines.push(`Total: ${centsToCurrency(order.totalCents)}`);
    }
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
    body { font-family: ${kitchen ? '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif' : '"Arial", sans-serif'}; width: 100%; margin: 0; font-size: ${kitchen ? "22px" : "42px"}; line-height: 1.2; }
    .center { text-align: center; }
    .title { font-size: ${kitchen ? "28px" : "40px"}; font-weight: 700; }
    .number { font-size: ${kitchen ? "32px" : "40px"}; font-weight: 800; margin: 18px 0; }
    .section { margin-top: 24px; border-top: 1px dashed #222; padding-top: 24px; }
    .line { margin-top: 18px; font-size: ${kitchen ? "63px" : "42px"}; }
    .line strong { font-size: ${kitchen ? "66px" : "42px"}; }
    .subline { padding-left: 24px; font-size: ${kitchen ? "57px" : "39px"}; }
    .totals { margin-top: 30px; border-top: 1px dashed #222; padding-top: 24px; }
  </style>
</head>
<body>
  <div class="center title">${esc(restaurantName)}</div>
  ${kitchen ? `<div class="center"><strong>KITCHEN COPY</strong></div>` : ""}
  <div class="center number">#${esc(order.orderNumber)}</div>
  <div class="center">Created: ${esc(fmtDateTime(order.createdAt))}</div>
  <div class="center">Pickup: ${esc(pickupText)}</div>
  <div class="section">
    <div><strong>${esc(order.customerName)}</strong> | ${esc(order.phone)}</div>
    <div>Notes: ${esc(order.notes ?? "-")}</div>
  </div>
  <div class="section">${lineHtml}</div>
  ${
    kitchen
      ? ""
      : `<div class="totals">
    <div>Subtotal: ${centsToCurrency(order.subtotalCents)}</div>
    <div>Tax: ${centsToCurrency(order.taxCents)}</div>
    <div><strong>Total: ${centsToCurrency(order.totalCents)}</strong></div>
  </div>`
  }
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
