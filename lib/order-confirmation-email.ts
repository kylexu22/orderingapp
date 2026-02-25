import { PickupType, SelectionKind } from "@prisma/client";
import { Resend } from "resend";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";

const ORDER_EMAIL_FROM = "Hong Far Cafe <orders@hongfarcafe.ca>";

const resend = new Resend(process.env.RESEND_API_KEY);

type OrderForEmail = {
  orderNumber: string;
  createdAt: Date;
  customerName: string;
  phone: string;
  notes: string | null;
  pickupType: PickupType;
  pickupTime: Date | null;
  estimatedReadyTime: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: Array<{
    nameSnapshot: string;
    qty: number;
    lineTotalCents: number;
    selections: Array<{
      selectionKind: SelectionKind;
      label: string;
      selectedItemNameSnapshot: string | null;
      selectedModifierOptionNameSnapshot: string | null;
      priceDeltaSnapshotCents: number;
      sortOrder: number;
    }>;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectionDisplayText(selection: OrderForEmail["lines"][number]["selections"][number]) {
  const selectedText =
    selection.selectedModifierOptionNameSnapshot ?? selection.selectedItemNameSnapshot ?? "";
  const deltaText =
    selection.priceDeltaSnapshotCents > 0 ? ` (+${centsToCurrency(selection.priceDeltaSnapshotCents)})` : "";

  return `${selection.label}: ${selectedText}${deltaText}`;
}

function buildEmailHtml(order: OrderForEmail) {
  const pickupDetails =
    order.pickupType === PickupType.ASAP
      ? `ASAP${order.estimatedReadyTime ? ` (est. ready ${fmtTime(order.estimatedReadyTime)})` : ""}`
      : `Scheduled (${fmtDateTime(order.pickupTime ?? order.createdAt)})`;

  const linesHtml = order.lines
    .map((line) => {
      const selections = [...line.selections]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((selection) => `<li>${escapeHtml(selectionDisplayText(selection))}</li>`)
        .join("");

      return `<li>
        <strong>${escapeHtml(`${line.qty} × ${line.nameSnapshot}`)}</strong>
        <span> — ${escapeHtml(centsToCurrency(line.lineTotalCents))}</span>
        ${selections ? `<ul>${selections}</ul>` : ""}
      </li>`;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2>Thank you for your order!</h2>
      <p>Your order has been received by Hong Far Cafe.</p>
      <p><strong>Order #:</strong> ${escapeHtml(order.orderNumber)}</p>
      <p><strong>Name:</strong> ${escapeHtml(order.customerName)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.phone)}</p>
      <p><strong>Pickup:</strong> ${escapeHtml(pickupDetails)}</p>
      <h3>Order details</h3>
      <ul>${linesHtml}</ul>
      ${order.notes ? `<p><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ""}
      <p><strong>Subtotal:</strong> ${escapeHtml(centsToCurrency(order.subtotalCents))}</p>
      <p><strong>Tax:</strong> ${escapeHtml(centsToCurrency(order.taxCents))}</p>
      <p><strong>Total:</strong> ${escapeHtml(centsToCurrency(order.totalCents))}</p>
      <p>If anything looks incorrect, please call us as soon as possible.</p>
    </div>
  `;
}

function buildEmailText(order: OrderForEmail) {
  const pickupDetails =
    order.pickupType === PickupType.ASAP
      ? `ASAP${order.estimatedReadyTime ? ` (est. ready ${fmtTime(order.estimatedReadyTime)})` : ""}`
      : `Scheduled (${fmtDateTime(order.pickupTime ?? order.createdAt)})`;

  const lineRows = order.lines
    .map((line) => {
      const selectionRows = [...line.selections]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((selection) => `    - ${selectionDisplayText(selection)}`)
        .join("\n");
      return `${line.qty} x ${line.nameSnapshot} — ${centsToCurrency(line.lineTotalCents)}${
        selectionRows ? `\n${selectionRows}` : ""
      }`;
    })
    .join("\n\n");

  return [
    "Thank you for your order!",
    "",
    `Order #: ${order.orderNumber}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.phone}`,
    `Pickup: ${pickupDetails}`,
    "",
    "Order details:",
    lineRows,
    "",
    order.notes ? `Notes: ${order.notes}` : "",
    `Subtotal: ${centsToCurrency(order.subtotalCents)}`,
    `Tax: ${centsToCurrency(order.taxCents)}`,
    `Total: ${centsToCurrency(order.totalCents)}`
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendOrderConfirmationEmail(params: {
  order: OrderForEmail;
  recipientEmail?: string | null;
}) {
  const recipient = params.recipientEmail?.trim();
  if (!recipient) return { skipped: true as const, reason: "missing_recipient" as const };
  if (!process.env.RESEND_API_KEY) return { skipped: true as const, reason: "missing_api_key" as const };

  const { data, error } = await resend.emails.send({
    from: ORDER_EMAIL_FROM,
    to: [recipient],
    subject: `Order Confirmation #${params.order.orderNumber}`,
    html: buildEmailHtml(params.order),
    text: buildEmailText(params.order)
  });

  if (error) {
    throw new Error(error.message || "Failed to send order confirmation email.");
  }

  return { skipped: false as const, messageId: data?.id ?? null };
}
