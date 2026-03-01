import { NextResponse } from "next/server";
import { Prisma, PrintCopyType, PrintJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logger";
import { getStoreOrderState } from "@/lib/store-status";
import type { StoreHours } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const CLOUDPRNT_POLL_INTERVAL_MS = 2000;
const CLOUDPRNT_POLL_INTERVAL_CLOSED_MS = 30000;
const CLOUDPRNT_POLL_INTERVAL_ORDERING_OFF_MS = 60000;
const CLOUDPRNT_POLL_INTERVAL_QUIET_MS = Number(process.env.CLOUDPRNT_POLL_INTERVAL_QUIET_MS ?? "60000");
const CLOUDPRNT_QUIET_HOURS_START = process.env.CLOUDPRNT_QUIET_HOURS_START ?? "22:30";
const CLOUDPRNT_QUIET_HOURS_END = process.env.CLOUDPRNT_QUIET_HOURS_END ?? "10:00";
const CLOUDPRNT_QUIET_HOURS_TIMEZONE =
  process.env.CLOUDPRNT_QUIET_HOURS_TIMEZONE ?? "America/Toronto";
const CLOUDPRNT_HEARTBEAT_WRITE_INTERVAL_MS = Number(
  process.env.CLOUDPRNT_HEARTBEAT_WRITE_INTERVAL_MS ?? "300000"
);

function parseClockToMinutes(raw: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour * 60 + minute;
}

function getMinutesInTimezone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isWithinQuietHours(now = new Date()) {
  const startMinutes = parseClockToMinutes(CLOUDPRNT_QUIET_HOURS_START);
  const endMinutes = parseClockToMinutes(CLOUDPRNT_QUIET_HOURS_END);
  if (startMinutes === null || endMinutes === null) return false;
  const currentMinutes = getMinutesInTimezone(now, CLOUDPRNT_QUIET_HOURS_TIMEZONE);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function isFinitePositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

function shouldRefreshHeartbeat(lastSeenAt: Date | null, nowMs: number) {
  if (!lastSeenAt) return true;
  if (!isFinitePositiveNumber(CLOUDPRNT_HEARTBEAT_WRITE_INTERVAL_MS)) return true;
  return nowMs - lastSeenAt.getTime() >= CLOUDPRNT_HEARTBEAT_WRITE_INTERVAL_MS;
}

function asStoreHours(value: Prisma.JsonValue | null | undefined): StoreHours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: StoreHours = {};
  for (const [day, windowsRaw] of Object.entries(value)) {
    if (!Array.isArray(windowsRaw)) continue;
    out[day] = windowsRaw
      .filter(
        (window): window is { open: string; close: string } =>
          typeof window === "object" &&
          window !== null &&
          typeof (window as { open?: unknown }).open === "string" &&
          typeof (window as { close?: unknown }).close === "string"
      )
      .map((window) => ({ open: window.open, close: window.close }));
  }
  return out;
}

function asClosedDates(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function resolveCloudPrntPollIntervalMs() {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
    select: {
      acceptingOrders: true,
      timezone: true,
      storeHours: true,
      closedDates: true
    }
  });

  if (!settings) return CLOUDPRNT_POLL_INTERVAL_MS;

  const orderState = getStoreOrderState({
    acceptingOrders: settings.acceptingOrders,
    timezone: settings.timezone,
    storeHours: asStoreHours(settings.storeHours),
    closedDates: asClosedDates(settings.closedDates)
  });

  if (orderState === "ORDERING_OFF") return CLOUDPRNT_POLL_INTERVAL_ORDERING_OFF_MS;
  if (orderState === "CLOSED") return CLOUDPRNT_POLL_INTERVAL_CLOSED_MS;
  return CLOUDPRNT_POLL_INTERVAL_MS;
}

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

function supportedMimeTypesForJob(copyType: PrintCopyType) {
  return ["image/png"];
}

function decodePayloadCache(payloadCache: string | null | undefined) {
  if (!payloadCache) return null;
  try {
    return Buffer.from(payloadCache, "base64");
  } catch {
    return null;
  }
}

async function buildPrintPayload(orderNumber: string, copyType: PrintCopyType, mimeType: string) {
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";

  if (mimeType !== "image/png") {
    throw new Error(`Unsupported CloudPRNT mime type for Satori renderer: ${mimeType}`);
  }

  const [{ buildReceiptRenderPayload }, { renderReceiptToPng }] = await Promise.all([
    import("@/lib/cloudprnt-payload"),
    import("@/lib/cloudprnt-render")
  ]);
  const payload = await buildReceiptRenderPayload({
    orderNumber,
    copyType,
    restaurantName
  });

  return renderReceiptToPng(payload);
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
  const isBasicAuthed = isCloudPrntAuthorized(req);
  if (isWithinQuietHours()) {
    if (!isBasicAuthed) {
      return getCloudPrntUnauthorizedResponse();
    }
    return NextResponse.json({
      jobReady: false,
      clientAction: "POST",
      pollInterval: CLOUDPRNT_POLL_INTERVAL_QUIET_MS
    });
  }

  const body = await readBodyAsJson(req);
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

  const now = new Date();
  const existingPrinter = await prisma.printer.findUnique({
    where: { macAddress },
    select: {
      id: true,
      uid: true,
      name: true,
      lastSeenAt: true,
      lastError: true
    }
  });

  let printerId = existingPrinter?.id;
  if (!existingPrinter) {
    const createdPrinter = await prisma.printer.create({
      data: {
        macAddress,
        uid: uid ?? undefined,
        name: name ?? undefined,
        lastSeenAt: now,
        lastStatusJson: body as Prisma.InputJsonValue
      },
      select: { id: true }
    });
    printerId = createdPrinter.id;
  } else {
    const shouldTouchHeartbeat = shouldRefreshHeartbeat(existingPrinter.lastSeenAt, now.getTime());
    const uidChanged = uid !== null && uid !== existingPrinter.uid;
    const nameChanged = name !== null && name !== existingPrinter.name;
    const shouldClearError = Boolean(existingPrinter.lastError);

    if (shouldTouchHeartbeat || uidChanged || nameChanged || shouldClearError) {
      await prisma.printer.update({
        where: { id: existingPrinter.id },
        data: {
          uid: uidChanged ? uid : undefined,
          name: nameChanged ? name : undefined,
          lastSeenAt: shouldTouchHeartbeat ? now : undefined,
          lastStatusJson: shouldTouchHeartbeat ? (body as Prisma.InputJsonValue) : undefined,
          lastError: shouldClearError ? null : undefined
        }
      });
    }
  }
  if (!printerId) {
    return NextResponse.json({ error: "Failed to resolve printer." }, { status: 500 });
  }

  const queuedJob = await prisma.printJob.findFirst({
    where: {
      printerId,
      status: PrintJobStatus.QUEUED
    },
    orderBy: { requestedAt: "asc" }
  });
  const retryDeliveredJob = queuedJob
    ? null
    : await prisma.printJob.findFirst({
        where: {
          printerId,
          status: PrintJobStatus.DELIVERED
        },
        orderBy: { requestedAt: "asc" }
      });
  const nextJob = queuedJob ?? retryDeliveredJob;

  if (!nextJob) {
    const pollInterval = await resolveCloudPrntPollIntervalMs();
    return NextResponse.json({
      jobReady: false,
      clientAction: "POST",
      pollInterval
    });
  }

  logInfo("cloudprnt.job_ready", {
    printerId,
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
    const cachedPayload = decodePayloadCache(job.payloadCache);
    const payload = cachedPayload ?? (await buildPrintPayload(job.order.orderNumber, job.copyType, mimeType));
    if (job.status === PrintJobStatus.QUEUED) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.DELIVERED,
          deliveredAt: new Date(),
          payloadCache: cachedPayload ? job.payloadCache : Buffer.from(payload).toString("base64")
        }
      });
    }
    const responseBody = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);

    logInfo("cloudprnt.job_payload_served", {
      jobId: job.id,
      orderNumber: job.order.orderNumber,
      copyType: job.copyType,
      jobStatus: job.status,
      mimeType,
      byteLength: responseBody.byteLength
    });
    const byteLength =
      responseBody.byteLength;
    return new NextResponse(responseBody as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
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
