import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthedRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dayHoursSchema = z.object({
  isClosed: z.boolean(),
  open: z.string().regex(hhmmRegex),
  close: z.string().regex(hhmmRegex)
});

const payloadSchema = z.object({
  prepTimeMinutes: z.number().int().min(1).max(180),
  acceptingOrders: z.boolean(),
  storeHoursByDay: z.record(dayHoursSchema)
});

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  const settings = await prisma.storeSettings.findUnique({
    where: { id: "default" }
  });
  if (!settings) {
    return NextResponse.json({ error: "Store settings missing." }, { status: 404 });
  }

  return NextResponse.json({
    settings: {
      prepTimeMinutes: settings.prepTimeMinutes,
      slotIntervalMinutes: settings.slotIntervalMinutes,
      timezone: settings.timezone,
      storeHours: settings.storeHours,
      acceptingOrders: settings.acceptingOrders
    }
  });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  const nextStoreHours: Record<string, Array<{ open: string; close: string }>> = {};
  for (const [day, hours] of Object.entries(payload.storeHoursByDay)) {
    if (hours.isClosed) {
      nextStoreHours[day] = [];
      continue;
    }
    if (toMinutes(hours.open) >= toMinutes(hours.close)) {
      return NextResponse.json(
        { error: "Open time must be earlier than close time." },
        { status: 400 }
      );
    }
    nextStoreHours[day] = [{ open: hours.open, close: hours.close }];
  }

  const updated = await prisma.storeSettings.update({
    where: { id: "default" },
    data: {
      prepTimeMinutes: payload.prepTimeMinutes,
      acceptingOrders: payload.acceptingOrders,
      storeHours: nextStoreHours
    }
  });

  return NextResponse.json({
    ok: true,
    settings: {
      prepTimeMinutes: updated.prepTimeMinutes,
      slotIntervalMinutes: updated.slotIntervalMinutes,
      timezone: updated.timezone,
      storeHours: updated.storeHours,
      acceptingOrders: updated.acceptingOrders
    }
  });
}
