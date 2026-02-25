import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

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
};

const RECEIPT_WIDTH = 576;

let fontRegularPromise: Promise<Buffer> | null = null;
let fontBoldPromise: Promise<Buffer> | null = null;

function loadRegularFont() {
  if (!fontRegularPromise) {
    const fontPath = path.join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "noto-sans-sc",
      "files",
      "noto-sans-sc-chinese-simplified-400-normal.woff"
    );
    fontRegularPromise = readFile(fontPath);
  }
  return fontRegularPromise;
}

function loadBoldFont() {
  if (!fontBoldPromise) {
    const fontPath = path.join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "noto-sans-sc",
      "files",
      "noto-sans-sc-chinese-simplified-700-normal.woff"
    );
    fontBoldPromise = readFile(fontPath);
  }
  return fontBoldPromise;
}

function estimateReceiptHeight(payload: ReceiptRenderPayload) {
  const base = payload.kitchen ? 360 : 320;
  const lineHeight = payload.kitchen ? 70 : 56;
  const selectionHeight = payload.kitchen ? 50 : 42;

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
  const [regularFont, boldFont] = await Promise.all([loadRegularFont(), loadBoldFont()]);
  const height = estimateReceiptHeight(payload);

  const titleSize = payload.kitchen ? 36 : 34;
  const bodySize = payload.kitchen ? 26 : 24;
  const lineSize = payload.kitchen ? 44 : 34;
  const selectionSize = payload.kitchen ? 34 : 28;

  const svg = await satori(
    <div
      style={{
        width: RECEIPT_WIDTH,
        minHeight: height,
        backgroundColor: "#fff",
        color: "#000",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Noto Sans SC",
        boxSizing: "border-box",
        padding: "10px 12px"
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
          borderTop: "1px dashed #222",
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
          borderTop: "1px dashed #222",
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
            borderTop: "1px dashed #222",
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
          name: "Noto Sans SC",
          data: regularFont,
          weight: 400,
          style: "normal"
        },
        {
          name: "Noto Sans SC",
          data: boldFont,
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
