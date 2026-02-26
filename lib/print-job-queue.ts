import { PrintCopyType, PrintJobStatus, type PrintJob, type Printer } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildReceiptRenderPayload } from "@/lib/cloudprnt-payload";
import { renderReceiptToPng } from "@/lib/cloudprnt-render";
import { logInfo } from "@/lib/logger";

export type PrintJobQueueSource = "AUTO" | "MANUAL";

export type QueuePrintJobInput = {
  printerId?: string;
  printerMac?: string | null;
  printerName?: string | null;
  orderId?: string;
  orderNumber?: string;
  copyType: PrintCopyType;
  source: PrintJobQueueSource;
  preRenderPayload?: boolean;
};

export type QueuePrintJobResult =
  | { ok: true; job: PrintJob; deduped?: boolean }
  | { ok: false; status: number; error: string };

type ResolvePrinterResult =
  | { printer: Printer }
  | { error: string; status: number };

function normalizeMac(raw: string | null | undefined) {
  if (!raw) return null;
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g)?.join(":") ?? null;
}

function newJobToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

async function resolvePrinter(input: QueuePrintJobInput): Promise<ResolvePrinterResult> {
  const printerMac = normalizeMac(input.printerMac ?? null);
  let printer =
    input.printerId
      ? await prisma.printer.findUnique({ where: { id: input.printerId } })
      : null;

  if (!printer && printerMac) {
    printer = await prisma.printer.upsert({
      where: { macAddress: printerMac },
      create: {
        macAddress: printerMac,
        name: input.printerName ?? undefined
      },
      update: {
        name: input.printerName ?? undefined
      }
    });
  }

  if (printer) return { printer };
  if (input.source !== "AUTO") return { error: "printerId or printerMac is required.", status: 400 as const };

  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: { autoPrintEnabled: true, defaultAutoPrintPrinterId: true }
  });
  if (!settings?.autoPrintEnabled) {
    return { error: "Global auto print is disabled.", status: 409 as const };
  }

  if (settings.defaultAutoPrintPrinterId) {
    const configured = await prisma.printer.findFirst({
      where: { id: settings.defaultAutoPrintPrinterId, isActive: true }
    });
    if (configured) return { printer: configured };
  }

  const fallback = await prisma.printer.findFirst({
    where: { isActive: true },
    orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }]
  });
  if (!fallback) {
    return { error: "No active printer found for auto print.", status: 404 as const };
  }
  return { printer: fallback };
}

async function buildPayloadCacheBase64(orderNumber: string, copyType: PrintCopyType) {
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";
  const renderPayload = await buildReceiptRenderPayload({
    orderNumber,
    copyType,
    restaurantName
  });
  const png = await renderReceiptToPng(renderPayload);
  return png.toString("base64");
}

export async function queuePrintJob(input: QueuePrintJobInput): Promise<QueuePrintJobResult> {
  if (!input.orderId && !input.orderNumber) {
    return { ok: false, status: 400, error: "orderId or orderNumber is required." };
  }

  const printerResult = await resolvePrinter(input);
  if ("error" in printerResult) {
    return { ok: false, status: printerResult.status, error: printerResult.error };
  }
  const { printer } = printerResult;

  const order = await prisma.order.findFirst({
    where: input.orderId
      ? { id: input.orderId }
      : { orderNumber: input.orderNumber }
  });
  if (!order) {
    return { ok: false, status: 404, error: "Order not found." };
  }

  if (input.source === "AUTO") {
    const existing = await prisma.printJob.findFirst({
      where: {
        orderId: order.id,
        copyType: input.copyType,
        status: { in: [PrintJobStatus.QUEUED, PrintJobStatus.DELIVERED, PrintJobStatus.COMPLETED] }
      },
      orderBy: { requestedAt: "desc" }
    });
    if (existing) {
      return { ok: true, job: existing, deduped: true };
    }
  }

  let payloadCacheBase64: string | null = null;
  if (input.preRenderPayload !== false) {
    try {
      payloadCacheBase64 = await buildPayloadCacheBase64(order.orderNumber, input.copyType);
    } catch {
      return { ok: false, status: 500, error: "Failed to render print payload." };
    }
  }

  const created = await prisma.printJob.create({
    data: {
      printerId: printer.id,
      orderId: order.id,
      orderNumberSnapshot: order.orderNumber,
      copyType: input.copyType,
      status: PrintJobStatus.QUEUED,
      requestedMime: "image/png",
      jobToken: newJobToken(),
      payloadCache: payloadCacheBase64
    }
  });

  logInfo("cloudprnt.job_queued", {
    printJobId: created.id,
    printerId: printer.id,
    orderNumber: order.orderNumber,
    copyType: created.copyType,
    source: input.source
  });

  return { ok: true, job: created };
}
