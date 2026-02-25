import { NextResponse } from "next/server";
import { Prisma, PrintCopyType, PrintJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { localizeText } from "@/lib/i18n";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";
import { renderReceiptToPng } from "@/lib/cloudprnt-render";
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

async function isKnownPrinterMac(macAddress: string | null | undefined) {
  if (!macAddress) return false;
  const printer = await prisma.printer.findUnique({
    where: { macAddress },
    select: { id: true }
  });
  return Boolean(printer);
}

async function hasValidJobToken(req: Request, body?: Record<string, unknown>) {
  const found = await findJobByTokenOrPrinter(req, body ?? {}, [
    PrintJobStatus.QUEUED,
    PrintJobStatus.DELIVERED
  ]);
  return Boolean(found);
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

function supportedMimeTypesForJob(copyType: PrintCopyType) {
  if (copyType === PrintCopyType.KITCHEN) return ["image/png"];
  return ["image/png"];
}

async function buildPrintPayload(orderNumber: string, copyType: PrintCopyType, mimeType: string) {
  const kitchen = copyType === PrintCopyType.KITCHEN;
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";
  const order = await getOrderForPayload(orderNumber);

  if (!order) {
    throw new Error(`Order not found for CloudPRNT payload: ${orderNumber}`);
  }

  if (mimeType === "image/png") {
    const toZh = (value: string | null | undefined) => localizeText(value, "zh");
    const pickupText =
      order.pickupType === "ASAP"
        ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
        : fmtDateTime(order.pickupTime as Date);

    const mapLines = (useKitchenFilter: boolean, useChinese: boolean) =>
      order.lines.map((line) => {
        const selections = formatOrderSelectionsForDisplay({
          selections: line.selections
            .filter(
              (sel) =>
                !(useKitchenFilter && sel.selectionKind === "MODIFIER" && isDrinkModifier(sel))
            )
            .map((sel) => ({
              ...sel,
              selectedModifierOptionId: sel.selectedModifierOptionId ?? null
            })),
          lang: useChinese ? "zh" : "en",
          localize: (value) => (useChinese ? toZh(value) : value ?? "")
        });

        return {
          qty: line.qty,
          name: useChinese ? toZh(line.nameSnapshot) : line.nameSnapshot,
          selections: selections.map((selection) => ({
            text: selection.text,
            indent: Boolean(selection.indent)
          }))
        };
      });

    const basePayload = {
      restaurantName,
      orderNumber: order.orderNumber,
      createdText: fmtDateTime(order.createdAt),
      pickupText,
      customerText: `${order.customerName} | ${order.phone}`
    };

    const primaryPayload = {
      ...basePayload,
      notesText: `${kitchen ? "\u5099\u8a3b" : "Notes"}: ${order.notes ?? "-"}`,
      kitchen,
      lines: mapLines(kitchen, kitchen),
      subtotalText: kitchen ? undefined : centsToCurrency(order.subtotalCents),
      taxText: kitchen ? undefined : centsToCurrency(order.taxCents),
      totalText: kitchen ? undefined : centsToCurrency(order.totalCents),
      paidText: kitchen ? "\u5230\u5e97\u4ed8\u6b3e\uff08\u73fe\u91d1\uff09" : "PAY AT PICKUP (CASH)"
    };

    try {
      return await renderReceiptToPng(primaryPayload);
    } catch (error) {
      if (!kitchen) throw error;

      logError("cloudprnt.kitchen_render_fallback", {
        orderNumber: order.orderNumber,
        message: error instanceof Error ? error.message : "unknown"
      });

      return renderReceiptToPng({
        ...basePayload,
        notesText: `Notes: ${order.notes ?? "-"}`,
        kitchen: true,
        lines: mapLines(true, false),
        subtotalText: undefined,
        taxText: undefined,
        totalText: undefined,
        paidText: "PAY AT PICKUP (CASH)"
      });
    }
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
  const body = await readBodyAsJson(req);
  const isBasicAuthed = isCloudPrntAuthorized(req);
  const { macAddress, uid, name } = extractPrinterIdentity(req, body);
  if (!isBasicAuthed) {
    const knownPrinter = await isKnownPrinterMac(macAddress);
    if (!knownPrinter) {
      return getCloudPrntUnauthorizedResponse();
    }
  }
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

  const queuedJob = await prisma.printJob.findFirst({
    where: {
      printerId: printer.id,
      status: PrintJobStatus.QUEUED
    },
    orderBy: { requestedAt: "asc" }
  });
  const retryDeliveredJob = queuedJob
    ? null
    : await prisma.printJob.findFirst({
        where: {
          printerId: printer.id,
          status: PrintJobStatus.DELIVERED
        },
        orderBy: { requestedAt: "asc" }
      });
  const nextJob = queuedJob ?? retryDeliveredJob;

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
    jobToken: nextJob.jobToken,
    copyType: nextJob.copyType,
    status: nextJob.status
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
    const tokenOk = await hasValidJobToken(req);
    if (!tokenOk) {
      return getCloudPrntUnauthorizedResponse();
    }
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
      copyType: job.copyType,
      jobStatus: job.status,
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
  const body = await readBodyAsJson(req);
  const isBasicAuthed = isCloudPrntAuthorized(req);
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

  // Some printer/firmware flows do not send Basic auth on DELETE callback.
  // Allow DELETE if a valid CloudPRNT job token resolves to an active job.
  if (!isBasicAuthed && !job) {
    return getCloudPrntUnauthorizedResponse();
  }

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const code = codeRaw.toUpperCase();
  const okCodes = new Set(["OK", "SUCCESS", "PRINTED"]);
  logInfo("cloudprnt.job_delete_callback", {
    jobId: job.id,
    orderNumber: job.order.orderNumber,
    copyType: job.copyType,
    code,
    message,
    wasBasicAuthed: isBasicAuthed
  });
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
