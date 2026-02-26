import { NextRequest, NextResponse } from "next/server";
import { PrintCopyType, PrintJobStatus } from "@prisma/client";
import { z } from "zod";
import { isAuthedRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/logger";
import { buildReceiptRenderPayload } from "@/lib/cloudprnt-payload";
import { renderReceiptToPng } from "@/lib/cloudprnt-render";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const createPrintJobSchema = z.object({
  printerId: z.string().min(1).optional(),
  printerMac: z.string().min(1).optional(),
  printerName: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  orderNumber: z.string().min(1).optional(),
  source: z.enum(["AUTO", "MANUAL"]).default("MANUAL"),
  copyType: z.nativeEnum(PrintCopyType).default(PrintCopyType.FRONT),
  requestedMime: z.string().default("image/png")
});

function normalizeMac(raw: string | null | undefined) {
  if (!raw) return null;
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g)?.join(":") ?? null;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function newJobToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  const [printers, queue, queuedByPrinter] = await Promise.all([
    prisma.printer.findMany({
      orderBy: { createdAt: "asc" }
    }),
    prisma.printJob.findMany({
      where: {
        status: { in: [PrintJobStatus.QUEUED, PrintJobStatus.DELIVERED] }
      },
      orderBy: { requestedAt: "asc" },
      take: 100,
      include: {
        printer: {
          select: { id: true, name: true, macAddress: true }
        }
      }
    }),
    prisma.printJob.groupBy({
      by: ["printerId"],
      where: { status: PrintJobStatus.QUEUED },
      _count: { _all: true }
    })
  ]);

  const queuedCountMap = new Map(
    queuedByPrinter.map((entry) => [entry.printerId, entry._count._all])
  );

  return NextResponse.json({
    printers: printers.map((printer) => ({
      ...printer,
      queuedCount: queuedCountMap.get(printer.id) ?? 0
    })),
    queue
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  let payload: z.infer<typeof createPrintJobSchema>;
  try {
    payload = createPrintJobSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid print job payload." }, { status: 400 });
  }

  if (!payload.orderId && !payload.orderNumber) {
    return NextResponse.json({ error: "orderId or orderNumber is required." }, { status: 400 });
  }
  if (!payload.printerId && !payload.printerMac) {
    return NextResponse.json({ error: "printerId or printerMac is required." }, { status: 400 });
  }
  if (payload.source === "AUTO") {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "default" },
      select: { autoPrintEnabled: true }
    });
    if (!settings?.autoPrintEnabled) {
      return NextResponse.json({ error: "Global auto print is disabled." }, { status: 409 });
    }
  }

  const printerMac = normalizeMac(payload.printerMac ?? null);
  let printer =
    payload.printerId
      ? await prisma.printer.findUnique({ where: { id: payload.printerId } })
      : null;

  if (!printer && printerMac) {
    printer = await prisma.printer.upsert({
      where: { macAddress: printerMac },
      create: {
        macAddress: printerMac,
        name: payload.printerName ?? undefined
      },
      update: {
        name: payload.printerName ?? undefined
      }
    });
  }

  if (!printer) {
    return NextResponse.json({ error: "Printer not found." }, { status: 404 });
  }

  const order = await prisma.order.findFirst({
    where: payload.orderId
      ? { id: payload.orderId }
      : { orderNumber: payload.orderNumber }
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let payloadCacheBase64: string | null = null;
  try {
    const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";
    const renderPayload = await buildReceiptRenderPayload({
      orderNumber: order.orderNumber,
      copyType: payload.copyType,
      restaurantName
    });
    const png = await renderReceiptToPng(renderPayload);
    payloadCacheBase64 = png.toString("base64");
  } catch {
    return NextResponse.json({ error: "Failed to render print payload." }, { status: 500 });
  }

  const created = await prisma.printJob.create({
    data: {
      printerId: printer.id,
      orderId: order.id,
      orderNumberSnapshot: order.orderNumber,
      copyType: payload.copyType,
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
    copyType: created.copyType
  });

  return NextResponse.json({ ok: true, job: created });
}
