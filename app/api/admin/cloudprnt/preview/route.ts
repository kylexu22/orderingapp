import { NextRequest, NextResponse } from "next/server";
import { PrintCopyType } from "@prisma/client";
import { isAuthedRequest } from "@/lib/auth";
import { buildReceiptRenderPayload } from "@/lib/cloudprnt-payload";
import { renderReceiptToPng, renderReceiptToSvg } from "@/lib/cloudprnt-render";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normalizeCopyType(raw: string | null): PrintCopyType {
  if (!raw) return PrintCopyType.FRONT;
  const upper = raw.toUpperCase();
  return upper === PrintCopyType.KITCHEN ? PrintCopyType.KITCHEN : PrintCopyType.FRONT;
}

function normalizeFormat(raw: string | null): "png" | "svg" {
  if (!raw) return "png";
  return raw.toLowerCase() === "svg" ? "svg" : "png";
}

export async function GET(req: NextRequest) {
  if (!isAuthedRequest(req)) return unauthorized();

  const { searchParams } = new URL(req.url);
  const orderNumber = searchParams.get("orderNumber");
  if (!orderNumber) {
    return NextResponse.json({ error: "orderNumber is required" }, { status: 400 });
  }

  const copyType = normalizeCopyType(searchParams.get("copyType"));
  const format = normalizeFormat(searchParams.get("format"));
  const restaurantName = process.env.RESTAURANT_NAME ?? "Restaurant";

  try {
    const payload = await buildReceiptRenderPayload({
      orderNumber,
      copyType,
      restaurantName
    });

    if (format === "svg") {
      const svg = await renderReceiptToSvg(payload);
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    const png = await renderReceiptToPng(payload);
    const bytes = Uint8Array.from(png);
    return new NextResponse(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview render failed" },
      { status: 500 }
    );
  }
}
