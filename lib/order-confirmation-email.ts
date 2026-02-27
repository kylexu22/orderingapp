import { PickupType, SelectionKind } from "@prisma/client";
import { Resend } from "resend";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";

const ORDER_EMAIL_FROM = "Hong Far Cafe <orders@hongfarcafe.ca>";
const DEFAULT_NEW_ORDER_NOTIFY_TO = "";
const DEFAULT_NEW_ORDER_NOTIFY_CC = "";
const ORDER_EMAIL_CONTACT_PHONE = process.env.ORDER_EMAIL_CONTACT_PHONE?.trim() ?? "";
const ORDER_EMAIL_CONTACT_EMAIL =
  process.env.ORDER_EMAIL_CONTACT_EMAIL?.trim() ?? "orders@hongfarcafe.ca";
const ORDER_EMAIL_CONTACT_ADDRESS = process.env.ORDER_EMAIL_CONTACT_ADDRESS?.trim() ?? "";
const ORDER_EMAIL_CONTACT_WEBSITE = process.env.ORDER_EMAIL_CONTACT_WEBSITE?.trim() ?? "";

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

function parseRecipients(raw: string | undefined, fallback: string[]) {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return `https://${trimmed}`;
}

function resolveLogoUrl() {
  const explicit = process.env.ORDER_EMAIL_LOGO_URL?.trim();
  if (explicit) return normalizeUrl(explicit);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.APP_URL?.trim() ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ??
    process.env.VERCEL_URL?.trim() ??
    "";
  if (!appUrl) return "";

  const baseUrl = normalizeUrl(appUrl).replace(/\/+$/, "");
  return `${baseUrl}/images/hongfarlogo.png`;
}

function normalizeTel(phone: string) {
  return phone.replace(/[^+\d]/g, "");
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

  const logoUrl = resolveLogoUrl();

  const linesHtml = order.lines
    .map((line) => {
      const selections = [...line.selections]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(
          (selection) =>
            `<li class="text-sm text-stone-600 leading-6">${escapeHtml(selectionDisplayText(selection))}</li>`
        )
        .join("");

      return `
        <div class="py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="font-semibold text-stone-900">${escapeHtml(`${line.qty} x ${line.nameSnapshot}`)}</div>
            <div class="font-semibold text-stone-900">${escapeHtml(centsToCurrency(line.lineTotalCents))}</div>
          </div>
          ${selections ? `<ul class="mt-2 pl-5">${selections}</ul>` : ""}
        </div>
      `;
    })
    .join("");

  const websiteUrl = ORDER_EMAIL_CONTACT_WEBSITE ? normalizeUrl(ORDER_EMAIL_CONTACT_WEBSITE) : "";
  const phoneHref = ORDER_EMAIL_CONTACT_PHONE ? `tel:${normalizeTel(ORDER_EMAIL_CONTACT_PHONE)}` : "";

  const contactHtml = [
    ORDER_EMAIL_CONTACT_PHONE
      ? `<a class="block text-sm text-amber-800 no-underline mb-1" href="${escapeHtml(phoneHref)}">Phone: ${escapeHtml(
          ORDER_EMAIL_CONTACT_PHONE
        )}</a>`
      : "",
    ORDER_EMAIL_CONTACT_EMAIL
      ? `<a class="block text-sm text-amber-800 no-underline mb-1" href="mailto:${escapeHtml(
          ORDER_EMAIL_CONTACT_EMAIL
        )}">Email: ${escapeHtml(ORDER_EMAIL_CONTACT_EMAIL)}</a>`
      : "",
    ORDER_EMAIL_CONTACT_ADDRESS
      ? `<div class="text-sm text-stone-600 mb-1">Address: ${escapeHtml(ORDER_EMAIL_CONTACT_ADDRESS)}</div>`
      : "",
    websiteUrl
      ? `<a class="block text-sm text-amber-800 no-underline" href="${escapeHtml(websiteUrl)}">${escapeHtml(
          websiteUrl
        )}</a>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>
          body { margin: 0; background: #f8f5ef; }
          .font-sans { font-family: "Nunito", "Segoe UI", Arial, sans-serif; }
          .mx-auto { margin-left: auto; margin-right: auto; }
          .max-w-2xl { max-width: 680px; }
          .w-full { width: 100%; }
          .px-4 { padding-left: 16px; padding-right: 16px; }
          .py-10 { padding-top: 40px; padding-bottom: 40px; }
          .rounded-2xl { border-radius: 20px; }
          .bg-white { background: #ffffff; }
          .border { border-width: 1px; border-style: solid; }
          .border-stone-200 { border-color: #e7e2d6; }
          .p-8 { padding: 32px; }
          .text-center { text-align: center; }
          .text-sm { font-size: 14px; }
          .text-base { font-size: 16px; }
          .text-2xl { font-size: 28px; line-height: 34px; }
          .font-semibold { font-weight: 700; }
          .font-extrabold { font-weight: 800; }
          .text-stone-500 { color: #78716c; }
          .text-stone-600 { color: #57534e; }
          .text-stone-700 { color: #44403c; }
          .text-stone-800 { color: #292524; }
          .text-stone-900 { color: #1c1917; }
          .text-amber-800 { color: #92400e; }
          .mt-2 { margin-top: 8px; }
          .mt-3 { margin-top: 12px; }
          .mt-4 { margin-top: 16px; }
          .mt-6 { margin-top: 24px; }
          .mt-8 { margin-top: 32px; }
          .mb-1 { margin-bottom: 4px; }
          .mb-6 { margin-bottom: 24px; }
          .mb-8 { margin-bottom: 32px; }
          .mb-10 { margin-bottom: 40px; }
          .leading-6 { line-height: 24px; }
          .space-y-2 > * + * { margin-top: 8px; }
          .space-y-1 > * + * { margin-top: 4px; }
          .bg-stone-50 { background: #fafaf9; }
          .rounded-xl { border-radius: 14px; }
          .p-4 { padding: 16px; }
          .flex { display: flex; }
          .items-start { align-items: flex-start; }
          .items-center { align-items: center; }
          .justify-between { justify-content: space-between; }
          .gap-3 { gap: 12px; }
          .block { display: block; }
          .no-underline { text-decoration: none; }
          .py-4 { padding-top: 16px; padding-bottom: 16px; }
          .divide-y > * + * { border-top: 1px solid #e7e2d6; }
          .pl-5 { padding-left: 20px; }
          .w-32 { width: 128px; }
          .h-auto { height: auto; }
        </style>
      </head>
      <body>
        <div class="font-sans mx-auto max-w-2xl w-full px-4 py-10">
          <div class="rounded-2xl bg-white border border-stone-200 p-8">
            <div class="text-center mb-8">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Hong Far Cafe logo" class="w-32 h-auto mx-auto mb-6" />` : ""}
              <div class="text-2xl font-extrabold text-stone-900">Order Confirmation</div>
              <div class="mt-2 text-base text-stone-600">Thank you for ordering from Hong Far Cafe.</div>
            </div>

            <div class="bg-stone-50 rounded-xl p-4 space-y-2 mb-8">
              <div class="text-sm text-stone-700"><strong>Order #:</strong> ${escapeHtml(order.orderNumber)}</div>
              <div class="text-sm text-stone-700"><strong>Name:</strong> ${escapeHtml(order.customerName)}</div>
              <div class="text-sm text-stone-700"><strong>Phone:</strong> ${escapeHtml(order.phone)}</div>
              <div class="text-sm text-stone-700"><strong>Pickup:</strong> ${escapeHtml(pickupDetails)}</div>
            </div>

            <div>
              <div class="text-base font-semibold text-stone-900 mb-6">Order Details</div>
              <div class="border border-stone-200 rounded-xl divide-y">
                ${linesHtml}
              </div>
            </div>

            ${
              order.notes
                ? `<div class="mt-6 text-sm text-stone-700"><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>`
                : ""
            }

            <div class="mt-8 bg-stone-50 rounded-xl p-4 space-y-1">
              <div class="text-sm text-stone-700"><strong>Subtotal:</strong> ${escapeHtml(
                centsToCurrency(order.subtotalCents)
              )}</div>
              <div class="text-sm text-stone-700"><strong>Tax:</strong> ${escapeHtml(centsToCurrency(order.taxCents))}</div>
              <div class="text-base font-semibold text-stone-900"><strong>Total:</strong> ${escapeHtml(
                centsToCurrency(order.totalCents)
              )}</div>
            </div>

            <div class="mt-10 border border-stone-200 rounded-xl p-4 text-center">
              <div class="text-sm font-semibold text-stone-800 mb-1">Contact Information</div>
              ${contactHtml || `<div class="text-sm text-stone-600">Please contact us if you need help with your order.</div>`}
            </div>
          </div>
        </div>
      </body>
    </html>
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
      return `${line.qty} x ${line.nameSnapshot} - ${centsToCurrency(line.lineTotalCents)}${
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
    `Total: ${centsToCurrency(order.totalCents)}`,
    "",
    "Contact information:",
    ORDER_EMAIL_CONTACT_PHONE ? `Phone: ${ORDER_EMAIL_CONTACT_PHONE}` : "",
    ORDER_EMAIL_CONTACT_EMAIL ? `Email: ${ORDER_EMAIL_CONTACT_EMAIL}` : "",
    ORDER_EMAIL_CONTACT_ADDRESS ? `Address: ${ORDER_EMAIL_CONTACT_ADDRESS}` : "",
    ORDER_EMAIL_CONTACT_WEBSITE ? `Website: ${normalizeUrl(ORDER_EMAIL_CONTACT_WEBSITE)}` : ""
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

export async function sendNewOrderNotificationEmail(params: {
  order: OrderForEmail;
}) {
  if (!process.env.RESEND_API_KEY) return { skipped: true as const, reason: "missing_api_key" as const };
  const toRecipients = parseRecipients(process.env.ORDER_NOTIFY_TO, [DEFAULT_NEW_ORDER_NOTIFY_TO]);
  const ccRecipients = parseRecipients(process.env.ORDER_NOTIFY_CC, [DEFAULT_NEW_ORDER_NOTIFY_CC]);

  const { data, error } = await resend.emails.send({
    from: ORDER_EMAIL_FROM,
    to: toRecipients,
    cc: ccRecipients,
    subject: `New Order Received #${params.order.orderNumber}`,
    html: buildEmailHtml(params.order),
    text: `New order received.\n\n${buildEmailText(params.order)}`
  });

  if (error) {
    throw new Error(error.message || "Failed to send new order notification email.");
  }

  return { skipped: false as const, messageId: data?.id ?? null };
}
