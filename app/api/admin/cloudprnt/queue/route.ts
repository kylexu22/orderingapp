import { NextRequest, NextResponse } from "next/server";
import { PrintCopyType, PrintJobStatus } from "@prisma/client";
import { z } from "zod";
import { isAuthedRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queuePrintJob } from "@/lib/print-job-queue";

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

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const result = await queuePrintJob({
    printerId: payload.printerId,
    printerMac: payload.printerMac ?? null,
    printerName: payload.printerName ?? null,
    orderId: payload.orderId,
    orderNumber: payload.orderNumber,
    copyType: payload.copyType,
    source: payload.source,
    preRenderPayload: true
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, job: result.job, deduped: result.deduped ?? false });
}
