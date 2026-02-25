import { NextResponse } from "next/server";
import { Prisma, PrintCopyType, PrintJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { localizeText } from "@/lib/i18n";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";
import { renderReceiptHtmlToPng } from "@/lib/cloudprnt-render";
import { logError, logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const CLOUDPRNT_POLL_INTERVAL_MS = 5000;

function normalizeMac(raw: string | null | undefined) {
  if (!raw) return null;
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g)?.join(":") ?? null;
}

function getHeaderValue(req: Request, keys: string[]) {
  for (const key of keys) {
    const value = req.headers.get(key);
    if (value) return value;
  }
  return null;
}

function getCloudPrntUnauthorizedResponse() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CloudPRNT"'
    }
  });
}

function isCloudPrntAuthorized(req: Request) {
  const expectedUser = process.env.CLOUDPRNT_BASIC_USER;
  const expectedPass = process.env.CLOUDPRNT_BASIC_PASS;
  if (!expectedUser && !expectedPass) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("basic ")) return false;
  const encoded = authHeader.slice(6).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return false;
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);
  return user === (expectedUser ?? "") && pass === (expectedPass ?? "");
}

async function readBodyAsJson(req: Request) {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractPrinterIdentity(
  req: Request,
  body: Record<string, unknown>
): { macAddress: string | null; uid: string | null; name: string | null } {
  const { searchParams } = new URL(req.url);
  const bodyDevice = (body.device ?? {}) as Record<string, unknown>;

  const macRaw =
    (body.macAddress as string | undefined) ??
    (body.mac as string | undefined) ??
    (body.printerMAC as string | undefined) ??
    (body.printerMac as string | undefined) ??
    (bodyDevice.macAddress as string | undefined) ??
    (bodyDevice.mac as string | undefined) ??
    searchParams.get("macAddress") ??
    searchParams.get("mac") ??
    searchParams.get("printerMAC") ??
    searchParams.get("printerMac") ??
    getHeaderValue(req, [
      "x-star-mac",
      "x-printer-mac",
      "x-cloudprnt-mac",
      "x-mac-address"
    ]);

  const uid =
    (body.uid as string | undefined) ??
    (body.printerUid as string | undefined) ??
    (bodyDevice.uid as string | undefined) ??
    searchParams.get("uid") ??
    getHeaderValue(req, ["x-star-uid", "x-printer-uid", "x-device-uid"]);

  const name =
    (body.name as string | undefined) ??
    (body.printerName as string | undefined) ??
    (bodyDevice.name as string | undefined) ??
    searchParams.get("name") ??
    getHeaderValue(req, ["x-printer-name", "x-device-name"]);

  return {
    macAddress: normalizeMac(macRaw),
    uid: uid ?? null,
    name: name ?? null
  };
}

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

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escMarkup(value: string | null | undefined) {
  const text = value ?? "";
  return text.replaceAll("[", "(").replaceAll("]", ")").replaceAll("\\", "/");
}

async function getOrderForPayload(orderNumber: string) {
  return prisma.order.findUnique({
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
}

function buildTextPayload(params: {
  order: NonNullable<Awaited<ReturnType<typeof getOrderForPayload>>>;
  kitchen: boolean;
  restaurantName: string;
}) {
  const { order, kitchen, restaurantName } = params;
  const toZh = (value: string | null | undefined) => localizeText(value, "zh");
  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  const lines: string[] = [];
  lines.push(restaurantName);
  if (kitchen) lines.push("KITCHEN COPY");
  lines.push(`#${order.orderNumber}`);
  lines.push(`Created: ${fmtDateTime(order.createdAt)}`);
  lines.push(`Pickup: ${pickupText}`);
  lines.push(`${order.customerName} | ${order.phone}`);
  lines.push(`Notes: ${order.notes ?? "-"}`);
  lines.push("------------------------------");

  for (const line of order.lines) {
    const lineName = kitchen ? toZh(line.nameSnapshot) : line.nameSnapshot;
    lines.push(`${line.qty} x ${lineName}`);
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
    for (const row of displaySelections) {
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
  return lines.join("\n");
}

function buildHtmlPayload(params: {
  order: NonNullable<Awaited<ReturnType<typeof getOrderForPayload>>>;
  kitchen: boolean;
  restaurantName: string;
}) {
  const { order, kitchen, restaurantName } = params;
  const toZh = (value: string | null | undefined) => localizeText(value, "zh");
  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  const lineHtml = order.lines
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

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ticket ${esc(order.orderNumber)}</title>
  <style>
    @page { size: 576px auto; margin: 0; }
    html, body { width: 576px; max-width: 576px; margin: 0; padding: 0; overflow: hidden; }
    body { font-family: ${kitchen ? '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif' : '"Arial", sans-serif'}; font-size: ${kitchen ? "22px" : "42px"}; line-height: 1.2; box-sizing: border-box; padding: 8px 12px; }
    .ticket { width: 552px; }
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
  <div class="ticket">
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
  </div>
</body>
</html>`;
}

function supportedMimeTypesForJob(copyType: PrintCopyType) {
  if (copyType === PrintCopyType.KITCHEN) return ["image/png"];
  return ["image/png"];
}

function buildMarkupPayload(params: {
  order: NonNullable<Awaited<ReturnType<typeof getOrderForPayload>>>;
  kitchen: boolean;
  restaurantName: string;
}) {
  const { order, kitchen, restaurantName } = params;
  const toZh = (value: string | null | undefined) => localizeText(value, "zh");
  const pickupText =
    order.pickupType === "ASAP"
      ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
      : fmtDateTime(order.pickupTime as Date);

  const out: string[] = [];
  out.push("[align: center]");
  out.push(`[bold: on][magnify: width 2; height 2]${escMarkup(restaurantName)}[plain]`);
  if (kitchen) {
    out.push("[bold: on][magnify: width 2; height 2]KITCHEN COPY[plain]");
  }
  out.push(`[bold: on]#${escMarkup(order.orderNumber)}[plain]`);
  out.push(`Created: ${escMarkup(fmtDateTime(order.createdAt))}`);
  out.push(`Pickup: ${escMarkup(pickupText)}`);
  out.push("[feed]");
  out.push("[align: left]");
  out.push(`[bold: on]${escMarkup(order.customerName)} | ${escMarkup(order.phone)}[plain]`);
  out.push(`Notes: ${escMarkup(order.notes ?? "-")}`);
  out.push("----------------------------------------");

  for (const line of order.lines) {
    const lineName = kitchen ? toZh(line.nameSnapshot) : line.nameSnapshot;
    out.push(`[bold: on][magnify: width 2; height 2]${line.qty} x ${escMarkup(lineName)}[plain]`);
    const rows = formatOrderSelectionsForDisplay({
      selections: line.selections
        .filter((sel) => !(kitchen && sel.selectionKind === "MODIFIER" && isDrinkModifier(sel)))
        .map((sel) => ({
          ...sel,
          selectedModifierOptionId: sel.selectedModifierOptionId ?? null
        })),
      lang: kitchen ? "zh" : "en",
      localize: (value) => (kitchen ? toZh(value) : value ?? "")
    });

    for (const row of rows) {
      if (row.indent) {
        out.push(`[column: left "    - ${escMarkup(row.text)}"]`);
      } else {
        out.push(`- ${escMarkup(row.text)}`);
      }
    }
    out.push("[feed]");
  }

  if (!kitchen) {
    out.push("----------------------------------------");
    out.push(`[column: left Subtotal; right ${centsToCurrency(order.subtotalCents)}]`);
    out.push(`[column: left Tax; right ${centsToCurrency(order.taxCents)}]`);
    out.push(`[bold: on][column: left Total; right ${centsToCurrency(order.totalCents)}][plain]`);
    out.push("[feed]");
  }

  out.push("[align: center]");
  out.push("[bold: on][magnify: width 2; height 2]PAY AT PICKUP (CASH)[plain]");
  out.push("[feed: length 6mm]");
  out.push("[cut: partial]");
  return out.join("\n");
}

async function buildPrintPayload(orderNumber: string, copyType: PrintCopyType, mimeType: string) {
  const kitchen = copyType === PrintCopyType.KITCHEN;
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";
  const order = await getOrderForPayload(orderNumber);

  if (!order) {
    throw new Error(`Order not found for CloudPRNT payload: ${orderNumber}`);
  }

  if (mimeType === "image/png") {
    const html = buildHtmlPayload({ order, kitchen, restaurantName });
    return renderReceiptHtmlToPng(html);
  }

  return buildTextPayload({ order, kitchen, restaurantName });
}

async function findJobByTokenOrPrinter(
  req: Request,
  body: Record<string, unknown>,
  statuses: PrintJobStatus[]
) {
  const { searchParams } = new URL(req.url);
  const token =
    searchParams.get("jobToken") ??
    searchParams.get("token") ??
    getHeaderValue(req, [
      "x-job-token",
      "x-cloudprnt-token",
      "x-cloudprnt-job-token",
      "x-star-job-token"
    ]);

  if (token) {
    const byToken = await prisma.printJob.findUnique({
      where: { jobToken: token },
      include: {
        printer: true,
        order: {
          select: { orderNumber: true }
        }
      }
    });
    if (byToken) return byToken;
  }

  const { macAddress } = extractPrinterIdentity(req, body);
  if (!macAddress) return null;

  const printer = await prisma.printer.findUnique({
    where: { macAddress },
    select: { id: true }
  });
  if (!printer) return null;

  return prisma.printJob.findFirst({
    where: {
      printerId: printer.id,
      status: { in: statuses }
    },
    orderBy: { requestedAt: "asc" },
    include: {
      printer: true,
      order: {
        select: { orderNumber: true }
      }
    }
  });
}

export async function POST(req: Request) {
  if (!isCloudPrntAuthorized(req)) {
    return getCloudPrntUnauthorizedResponse();
  }

  const body = await readBodyAsJson(req);
  const { macAddress, uid, name } = extractPrinterIdentity(req, body);
  if (!macAddress) {
    return NextResponse.json(
      { error: "Missing printer MAC address." },
      { status: 400 }
    );
  }

  const printer = await prisma.printer.upsert({
    where: { macAddress },
    create: {
      macAddress,
      uid: uid ?? undefined,
      name: name ?? undefined,
      lastSeenAt: new Date(),
      lastStatusJson: body as Prisma.InputJsonValue
    },
    update: {
      uid: uid ?? undefined,
      name: name ?? undefined,
      lastSeenAt: new Date(),
      lastStatusJson: body as Prisma.InputJsonValue,
      lastError: null
    }
  });

  const nextJob = await prisma.printJob.findFirst({
    where: {
      printerId: printer.id,
      status: PrintJobStatus.QUEUED
    },
    orderBy: { requestedAt: "asc" }
  });

  if (!nextJob) {
    return NextResponse.json({
      jobReady: false,
      clientAction: "POST",
      pollInterval: CLOUDPRNT_POLL_INTERVAL_MS
    });
  }

  logInfo("cloudprnt.job_ready", {
    printerId: printer.id,
    macAddress,
    jobId: nextJob.id,
    jobToken: nextJob.jobToken
  });

  return NextResponse.json({
    jobReady: true,
    mediaTypes: supportedMimeTypesForJob(nextJob.copyType),
    jobToken: nextJob.jobToken,
    deleteMethod: "DELETE",
    clientAction: "GET"
  });
}

export async function GET(req: Request) {
  if (!isCloudPrntAuthorized(req)) {
    return getCloudPrntUnauthorizedResponse();
  }

  const { searchParams } = new URL(req.url);
  const job = await findJobByTokenOrPrinter(req, {}, [
    PrintJobStatus.QUEUED,
    PrintJobStatus.DELIVERED
  ]);

  if (!job) {
    return new NextResponse("Job not found", { status: 404 });
  }

  const supportedTypes = supportedMimeTypesForJob(job.copyType);
  const mimeType = searchParams.get("type") ?? supportedTypes[0];
  logInfo("cloudprnt.job_payload_request", {
    jobId: job.id,
    orderNumber: job.order.orderNumber,
    requestedType: searchParams.get("type") ?? null,
    resolvedType: mimeType,
    supportedTypes
  });
  if (!supportedTypes.includes(mimeType)) {
    return new NextResponse("Unsupported media type request", { status: 415 });
  }

  if (job.status !== PrintJobStatus.QUEUED && job.status !== PrintJobStatus.DELIVERED) {
    return new NextResponse("Job no longer available", { status: 409 });
  }

  try {
    const shouldCacheText = mimeType.startsWith("text/");
    const payload =
      shouldCacheText && job.status === PrintJobStatus.DELIVERED && job.payloadCache
        ? job.payloadCache
        : await buildPrintPayload(job.order.orderNumber, job.copyType, mimeType);
    if (job.status === PrintJobStatus.QUEUED) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.DELIVERED,
          deliveredAt: new Date(),
          payloadCache: shouldCacheText && typeof payload === "string" ? payload : null
        }
      });
    }
    const responseBody =
      typeof payload === "string" ? payload : new Uint8Array(payload);
    logInfo("cloudprnt.job_payload_served", {
      jobId: job.id,
      orderNumber: job.order.orderNumber,
      mimeType,
      byteLength:
        typeof payload === "string"
          ? Buffer.byteLength(payload, "utf8")
          : payload.byteLength
    });
    const byteLength =
      typeof payload === "string"
        ? Buffer.byteLength(payload, "utf8")
        : payload.byteLength;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": mimeType.startsWith("text/")
          ? `${mimeType}; charset=utf-8`
          : mimeType,
        "Content-Length": String(byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    logError("cloudprnt.job_payload_failed", {
      jobId: job.id,
      orderNumber: job.order.orderNumber,
      message: error instanceof Error ? error.message : "unknown"
    });
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.FAILED,
        failureCode: "PAYLOAD_ERROR",
        failureMessage: error instanceof Error ? error.message : "Payload render failed"
      }
    });
    return new NextResponse("Failed to build print payload", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isCloudPrntAuthorized(req)) {
    return getCloudPrntUnauthorizedResponse();
  }

  const body = await readBodyAsJson(req);
  const codeRaw =
    (body.code as string | undefined) ??
    new URL(req.url).searchParams.get("code") ??
    "OK";
  const message =
    (body.message as string | undefined) ??
    new URL(req.url).searchParams.get("message") ??
    null;
  const job = await findJobByTokenOrPrinter(req, body, [
    PrintJobStatus.QUEUED,
    PrintJobStatus.DELIVERED
  ]);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const code = codeRaw.toUpperCase();
  const okCodes = new Set(["OK", "SUCCESS", "PRINTED"]);
  if (okCodes.has(code)) {
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.COMPLETED,
        completedAt: new Date(),
        failureCode: null,
        failureMessage: null
      }
    });
    return NextResponse.json({ ok: true, status: PrintJobStatus.COMPLETED });
  }

  await prisma.$transaction([
    prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.FAILED,
        failureCode: code,
        failureMessage: message ?? "Printer reported failure"
      }
    }),
    prisma.printer.update({
      where: { id: job.printerId },
      data: {
        lastError: `${code}${message ? `: ${message}` : ""}`
      }
    })
  ]);

  return NextResponse.json({ ok: true, status: PrintJobStatus.FAILED });
}
