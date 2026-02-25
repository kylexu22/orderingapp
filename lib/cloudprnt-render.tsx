import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

type FontMode = "normal" | "tall" | "double";

export type ReceiptRenderSelection = {
  text: string;
  indent: boolean;
};

export type ReceiptRenderLine = {
  qty: number;
  name: string;
  selections: ReceiptRenderSelection[];
};

export type ReceiptRenderPayload = {
  restaurantName: string;
  orderNumber: string;
  createdText: string;
  pickupText: string;
  customerText: string;
  notesText: string;
  kitchen: boolean;
  lines: ReceiptRenderLine[];
  subtotalText?: string;
  taxText?: string;
  totalText?: string;
  paidText: string;
  kitchenFontMode?: FontMode;
};

const RECEIPT_WIDTH = 576;
const COLOR_BLACK = "#000000";
const COLOR_WHITE = "#FFFFFF";

let fontSCRegularPromise: Promise<Buffer> | null = null;
let fontSCBoldPromise: Promise<Buffer> | null = null;
let fontTCRegularPromise: Promise<Buffer> | null = null;
let fontTCBoldPromise: Promise<Buffer> | null = null;

function loadSCRegularFont() {
  if (!fontSCRegularPromise) {
    const fontPath = path.join(process.cwd(), "assets", "fonts", "noto-sans-sc-400.woff");
    fontSCRegularPromise = readFile(fontPath);
  }
  return fontSCRegularPromise;
}

function loadSCBoldFont() {
  if (!fontSCBoldPromise) {
    const fontPath = path.join(process.cwd(), "assets", "fonts", "noto-sans-sc-700.woff");
    fontSCBoldPromise = readFile(fontPath);
  }
  return fontSCBoldPromise;
}

function loadTCRegularFont() {
  if (!fontTCRegularPromise) {
    const fontPath = path.join(process.cwd(), "assets", "fonts", "noto-sans-tc-400.woff");
    fontTCRegularPromise = readFile(fontPath);
  }
  return fontTCRegularPromise;
}

function loadTCBoldFont() {
  if (!fontTCBoldPromise) {
    const fontPath = path.join(process.cwd(), "assets", "fonts", "noto-sans-tc-700.woff");
    fontTCBoldPromise = readFile(fontPath);
  }
  return fontTCBoldPromise;
}

function estimateReceiptHeight(payload: ReceiptRenderPayload) {
  const kitchenMode = payload.kitchenFontMode ?? "double";
  const kitchenScale = payload.kitchen
    ? kitchenMode === "double"
      ? 1.35
      : kitchenMode === "tall"
        ? 1.2
        : 1.05
    : 1;
  const base = Math.round(320 * kitchenScale);
  const lineHeight = Math.round(56 * kitchenScale);
  const selectionHeight = Math.round(42 * kitchenScale);

  let total = base;
  for (const line of payload.lines) {
    total += lineHeight;
    total += line.selections.length * selectionHeight;
    total += 10;
  }
  if (!payload.kitchen) total += 180;
  return Math.min(Math.max(total + 80, 600), 8000);
}

export async function renderReceiptToPng(payload: ReceiptRenderPayload): Promise<Buffer> {
  const [scRegular, scBold, tcRegular, tcBold] = await Promise.all([
    loadSCRegularFont(),
    loadSCBoldFont(),
    loadTCRegularFont(),
    loadTCBoldFont()
  ]);
  const height = estimateReceiptHeight(payload);
  const kitchenMode = payload.kitchenFontMode ?? "double";
  const kitchenScale = payload.kitchen
    ? kitchenMode === "double"
      ? 1.35
      : kitchenMode === "tall"
        ? 1.2
        : 1.05
    : 1;

  const titleSize = Math.round(34 * kitchenScale);
  const bodySize = Math.round(24 * kitchenScale);
  const lineSize = Math.round(34 * kitchenScale);
  const selectionSize = Math.round(28 * kitchenScale);

  const svg = await satori(
    <div
      style={{
        width: RECEIPT_WIDTH,
        minHeight: height,
        backgroundColor: COLOR_WHITE,
        color: COLOR_BLACK,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Noto Sans TC, Noto Sans SC",
        boxSizing: "border-box",
        padding: "10px 12px",
        imageRendering: "pixelated",
        WebkitFontSmoothing: "none",
        textRendering: "geometricPrecision",
        ...( { fontSmooth: "never" } as Record<string, string> )
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 700 }}>{payload.restaurantName}</div>
        {payload.kitchen ? (
          <div style={{ marginTop: 4, fontSize: bodySize, fontWeight: 700 }}>KITCHEN COPY</div>
        ) : null}
        <div style={{ marginTop: 8, fontSize: titleSize + 2, fontWeight: 700 }}>{`#${payload.orderNumber}`}</div>
        <div style={{ marginTop: 6, fontSize: bodySize }}>{`Created: ${payload.createdText}`}</div>
        <div style={{ marginTop: 4, fontSize: bodySize }}>{`Pickup: ${payload.pickupText}`}</div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderTop: "1px dashed #000000",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ fontSize: bodySize, fontWeight: 700 }}>{payload.customerText}</div>
        <div style={{ marginTop: 4, fontSize: bodySize }}>{payload.notesText}</div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderTop: "1px dashed #000000",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column"
        }}
      >
        {payload.lines.map((line, lineIndex) => (
          <div
            key={`${lineIndex}-${line.name}`}
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: lineIndex === 0 ? 0 : 12
            }}
          >
            <div style={{ fontSize: lineSize, fontWeight: 700 }}>{`${line.qty} x ${line.name}`}</div>
            {line.selections.map((selection, selectionIndex) => (
              <div
                key={`${lineIndex}-${selectionIndex}`}
                style={{
                  marginTop: 2,
                  paddingLeft: selection.indent ? 40 : 18,
                  fontSize: selectionSize
                }}
              >
                {`- ${selection.text}`}
              </div>
            ))}
          </div>
        ))}
      </div>

      {!payload.kitchen ? (
        <div
          style={{
          marginTop: 14,
          borderTop: "1px dashed #000000",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column",
            fontSize: bodySize
          }}
        >
          <div>{`Subtotal: ${payload.subtotalText ?? "-"}`}</div>
          <div style={{ marginTop: 4 }}>{`Tax: ${payload.taxText ?? "-"}`}</div>
          <div style={{ marginTop: 6, fontWeight: 700 }}>{`Total: ${payload.totalText ?? "-"}`}</div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          width: "100%",
          textAlign: "center",
          fontSize: bodySize + 4,
          fontWeight: 700
        }}
      >
        {payload.paidText}
      </div>
    </div>,
    {
      width: RECEIPT_WIDTH,
      height,
      fonts: [
        {
          name: "Noto Sans TC",
          data: tcRegular,
          weight: 400,
          style: "normal"
        },
        {
          name: "Noto Sans TC",
          data: tcBold,
          weight: 700,
          style: "normal"
        },
        {
          name: "Noto Sans SC",
          data: scRegular,
          weight: 400,
          style: "normal"
        },
        {
          name: "Noto Sans SC",
          data: scBold,
          weight: 700,
          style: "normal"
        }
      ]
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: RECEIPT_WIDTH }
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

export async function renderReceiptToSvg(payload: ReceiptRenderPayload): Promise<string> {
  const [scRegular, scBold, tcRegular, tcBold] = await Promise.all([
    loadSCRegularFont(),
    loadSCBoldFont(),
    loadTCRegularFont(),
    loadTCBoldFont()
  ]);
  const height = estimateReceiptHeight(payload);
  const kitchenMode = payload.kitchenFontMode ?? "double";
  const kitchenScale = payload.kitchen
    ? kitchenMode === "double"
      ? 1.35
      : kitchenMode === "tall"
        ? 1.2
        : 1.05
    : 1;

  const titleSize = Math.round(34 * kitchenScale);
  const bodySize = Math.round(24 * kitchenScale);
  const lineSize = Math.round(34 * kitchenScale);
  const selectionSize = Math.round(28 * kitchenScale);

  return satori(
    <div
      style={{
        width: RECEIPT_WIDTH,
        minHeight: height,
        backgroundColor: COLOR_WHITE,
        color: COLOR_BLACK,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Noto Sans TC, Noto Sans SC",
        boxSizing: "border-box",
        padding: "10px 12px",
        imageRendering: "pixelated",
        WebkitFontSmoothing: "none",
        textRendering: "geometricPrecision",
        ...( { fontSmooth: "never" } as Record<string, string> )
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 700 }}>{payload.restaurantName}</div>
        {payload.kitchen ? (
          <div style={{ marginTop: 4, fontSize: bodySize, fontWeight: 700 }}>KITCHEN COPY</div>
        ) : null}
        <div style={{ marginTop: 8, fontSize: titleSize + 2, fontWeight: 700 }}>{`#${payload.orderNumber}`}</div>
        <div style={{ marginTop: 6, fontSize: bodySize }}>{`Created: ${payload.createdText}`}</div>
        <div style={{ marginTop: 4, fontSize: bodySize }}>{`Pickup: ${payload.pickupText}`}</div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderTop: "1px dashed #000000",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ fontSize: bodySize, fontWeight: 700 }}>{payload.customerText}</div>
        <div style={{ marginTop: 4, fontSize: bodySize }}>{payload.notesText}</div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderTop: "1px dashed #000000",
          paddingTop: 12,
          display: "flex",
          flexDirection: "column"
        }}
      >
        {payload.lines.map((line, lineIndex) => (
          <div
            key={`${lineIndex}-${line.name}`}
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: lineIndex === 0 ? 0 : 12
            }}
          >
            <div style={{ fontSize: lineSize, fontWeight: 700 }}>{`${line.qty} x ${line.name}`}</div>
            {line.selections.map((selection, selectionIndex) => (
              <div
                key={`${lineIndex}-${selectionIndex}`}
                style={{
                  marginTop: 2,
                  paddingLeft: selection.indent ? 40 : 18,
                  fontSize: selectionSize
                }}
              >
                {`- ${selection.text}`}
              </div>
            ))}
          </div>
        ))}
      </div>

      {!payload.kitchen ? (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px dashed #000000",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            fontSize: bodySize
          }}
        >
          <div>{`Subtotal: ${payload.subtotalText ?? "-"}`}</div>
          <div style={{ marginTop: 4 }}>{`Tax: ${payload.taxText ?? "-"}`}</div>
          <div style={{ marginTop: 6, fontWeight: 700 }}>{`Total: ${payload.totalText ?? "-"}`}</div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          width: "100%",
          textAlign: "center",
          fontSize: bodySize + 4,
          fontWeight: 700
        }}
      >
        {payload.paidText}
      </div>
    </div>,
    {
      width: RECEIPT_WIDTH,
      height,
      fonts: [
        {
          name: "Noto Sans TC",
          data: tcRegular,
          weight: 400,
          style: "normal"
        },
        {
          name: "Noto Sans TC",
          data: tcBold,
          weight: 700,
          style: "normal"
        },
        {
          name: "Noto Sans SC",
          data: scRegular,
          weight: 400,
          style: "normal"
        },
        {
          name: "Noto Sans SC",
          data: scBold,
          weight: 700,
          style: "normal"
        }
      ]
    }
  );
}
