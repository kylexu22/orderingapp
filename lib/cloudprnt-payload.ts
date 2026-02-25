import { PrintCopyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { localizeText } from "@/lib/i18n";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";
import type { ReceiptRenderPayload } from "@/lib/cloudprnt-render";

function isDrinkModifier(
  selection: {
    selectedModifierOptionId: string | null;
    label: string;
  }
) {
  const optionId = selection.selectedModifierOptionId ?? "";
  const label = selection.label ?? "";
  return (
    optionId.startsWith("modopt_add_drink_") ||
    /add drink|drink surcharge/i.test(label)
  );
}

export async function buildReceiptRenderPayload(params: {
  orderNumber: string;
  copyType: PrintCopyType;
  restaurantName: string;
}): Promise<ReceiptRenderPayload> {
  const { orderNumber, copyType, restaurantName } = params;
  const kitchen = copyType === PrintCopyType.KITCHEN;

  const order = await prisma.order.findUnique({
    where: { orderNumber },
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
    throw new Error(`Order not found for CloudPRNT payload: ${orderNumber}`);
  }

  const toZh = (value: string | null | undefined) => localizeText(value, "zh");
  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  const lines = order.lines.map((line) => {
    const displaySelections = formatOrderSelectionsForDisplay({
      selections: line.selections
        .filter((sel) => !(kitchen && sel.selectionKind === "MODIFIER" && isDrinkModifier(sel)))
        .map((sel) => ({
          ...sel,
          selectedModifierOptionId: sel.selectedModifierOptionId ?? null
        })),
      lang: kitchen ? "zh" : "en",
      localize: (value) => (kitchen ? toZh(value) : value ?? "")
    });

    return {
      qty: line.qty,
      name: kitchen ? toZh(line.nameSnapshot) : line.nameSnapshot,
      selections: displaySelections.map((selection) => ({
        text: selection.text,
        indent: Boolean(selection.indent)
      }))
    };
  });

  const kitchenModeRaw = (process.env.CLOUDPRNT_KITCHEN_FONT_MODE ?? "double").toLowerCase();
  const kitchenFontMode =
    kitchenModeRaw === "normal" || kitchenModeRaw === "tall" || kitchenModeRaw === "double"
      ? kitchenModeRaw
      : "double";

  return {
    restaurantName,
    orderNumber: order.orderNumber,
    createdText: fmtDateTime(order.createdAt),
    pickupText,
    customerText: `${order.customerName} | ${order.phone}`,
    notesText: `${kitchen ? "\u5099\u8a3b" : "Notes"}: ${order.notes ?? "-"}`,
    kitchen,
    lines,
    subtotalText: kitchen ? undefined : centsToCurrency(order.subtotalCents),
    taxText: kitchen ? undefined : centsToCurrency(order.taxCents),
    totalText: kitchen ? undefined : centsToCurrency(order.totalCents),
    paidText: kitchen ? "\u5230\u5e97\u4ed8\u6b3e\uff08\u73fe\u91d1\uff09" : "PAY AT PICKUP (CASH)",
    kitchenFontMode
  };
}
