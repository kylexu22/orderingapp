import { NextResponse } from "next/server";
import { z } from "zod";
import { OrderStatus, PickupType, PrintCopyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOrder } from "@/lib/order-service";
import { sendOrderConfirmationEmail } from "@/lib/order-confirmation-email";
import { broadcastOrderEvent } from "@/lib/sse";
import { logError, logInfo } from "@/lib/logger";
import { queuePrintJob } from "@/lib/print-job-queue";
import { getVerifiedPhoneFromCookieHeader } from "@/lib/verify-session";
import { normalizePhoneToE164 } from "@/lib/twilio-verify";
import {
  buildCustomerSessionCookie,
  getCustomerSessionCookieName,
  getCustomerSessionMaxAgeSeconds
} from "@/lib/customer-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const modifierSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1)
});

const comboSelectionSchema = z.object({
  comboGroupId: z.string().min(1),
  comboOptionId: z.string().min(1),
  selectedItemId: z.string().optional(),
  modifiers: z.array(modifierSchema).optional()
});

const lineSchema = z.discriminatedUnion("lineType", [
  z.object({
    lineType: z.literal("ITEM"),
    refId: z.string().min(1),
    qty: z.number().int().min(1),
    lineNote: z.string().max(300).optional(),
    modifiers: z.array(modifierSchema)
  }),
  z.object({
    lineType: z.literal("COMBO"),
    refId: z.string().min(1),
    qty: z.number().int().min(1),
    lineNote: z.string().max(300).optional(),
    comboSelections: z.array(comboSelectionSchema)
  })
]);

const createOrderSchema = z.object({
  customerName: z.string().min(1),
  email: z.string().trim().min(1).max(254).email(),
  phone: z.string().min(1),
  notes: z.string().optional(),
  pickupType: z.nativeEnum(PickupType),
  pickupTime: z.string().optional(),
  honeypot: z.string().optional(),
  lines: z.array(lineSchema).min(1)
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rate = checkRateLimit(`checkout:${ip}`, 8, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rate.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  let parsed: z.infer<typeof createOrderSchema>;
  try {
    const json = await req.json();
    parsed = createOrderSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
  }

  try {
    const verifiedPhone = getVerifiedPhoneFromCookieHeader(req.headers.get("cookie"));
    const submittedPhone = normalizePhoneToE164(parsed.phone);
    if (!verifiedPhone || !submittedPhone || verifiedPhone !== submittedPhone) {
      return NextResponse.json(
        { error: "Phone number verification is required before checkout." },
        { status: 400 }
      );
    }

    const order = await createOrder(parsed);
    logInfo("order.created", {
      orderNumber: order.orderNumber,
      totalCents: order.totalCents
    });
    broadcastOrderEvent({
      type: "ORDER_CREATED",
      payload: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString()
      }
    });
    const emailTask = (async () => {
      try {
        const emailResult = await sendOrderConfirmationEmail({
          order,
          recipientEmail: order.customer?.email ?? parsed.email
        });
        if (emailResult.skipped) {
          logInfo("order.confirmation_email.skipped", {
            orderNumber: order.orderNumber,
            reason: emailResult.reason
          });
        } else {
          logInfo("order.confirmation_email.sent", {
            orderNumber: order.orderNumber,
            messageId: emailResult.messageId
          });
        }
      } catch (emailError) {
        logError("order.confirmation_email_failed", {
          orderNumber: order.orderNumber,
          message: emailError instanceof Error ? emailError.message : "unknown"
        });
      }
    })();

    const autoPrintTask = (async () => {
      const [frontResult, kitchenResult] = await Promise.all([
        queuePrintJob({
          orderId: order.id,
          orderNumber: order.orderNumber,
          copyType: PrintCopyType.FRONT,
          source: "AUTO",
          preRenderPayload: false
        }),
        queuePrintJob({
          orderId: order.id,
          orderNumber: order.orderNumber,
          copyType: PrintCopyType.KITCHEN,
          source: "AUTO",
          preRenderPayload: false
        })
      ]);

      const results = [
        { copyType: PrintCopyType.FRONT, result: frontResult },
        { copyType: PrintCopyType.KITCHEN, result: kitchenResult }
      ];
      for (const entry of results) {
        if (!entry.result.ok) {
          logInfo("order.auto_print.skipped", {
            orderNumber: order.orderNumber,
            copyType: entry.copyType,
            reason: entry.result.error,
            status: entry.result.status
          });
          continue;
        }
        logInfo("order.auto_print.queued", {
          orderNumber: order.orderNumber,
          copyType: entry.copyType,
          printJobId: entry.result.job.id,
          deduped: entry.result.deduped ?? false
        });
      }
    })().catch((printError) => {
      logError("order.auto_print_failed", {
        orderNumber: order.orderNumber,
        message: printError instanceof Error ? printError.message : "unknown"
      });
    });

    await Promise.allSettled([emailTask, autoPrintTask]);

    const res = NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber
    });
    if (order.customerId) {
      res.cookies.set(getCustomerSessionCookieName(), buildCustomerSessionCookie(order.customerId), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getCustomerSessionMaxAgeSeconds()
      });
    }
    return res;
  } catch (error) {
    logError("order.create_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const filterStatus =
    status && (Object.values(OrderStatus) as string[]).includes(status)
      ? (status as OrderStatus)
      : undefined;
  const orders = await prisma.order.findMany({
    where: filterStatus ? { status: filterStatus } : undefined,
    orderBy: { createdAt: "desc" },
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
  return NextResponse.json({ orders });
}
