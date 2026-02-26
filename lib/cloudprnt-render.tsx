import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

type FontMode = "normal" | "tall" | "double";

export type ReceiptRenderSelection = {
  text: string;
  indent: boolean;
};

export type ReceiptRenderLine = {
  qty: number;
  name: string;
  lineTotalText?: string;
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
  const headerSize = Math.round(22 * kitchenScale);
  const orderNumberSize = Math.round(28 * kitchenScale);
  const pickupSize = payload.kitchen ? Math.round(24 * kitchenScale) : Math.round(30 * kitchenScale);
  const lineSize = Math.round(38 * kitchenScale);
  const selectionSize = lineSize;

  const weightedLength = (value: string) =>
    Array.from(value).reduce((acc, char) => {
      const code = char.codePointAt(0) ?? 0;
      const isCjk = (code >= 0x3400 && code <= 0x9fff) || (code >= 0xF900 && code <= 0xFAFF);
      return acc + (isCjk ? 1.05 : 0.58);
    }, 0);
  const wrappedRows = (value: string, fontSize: number, paddingLeft = 0) => {
    const usableWidth = RECEIPT_WIDTH - 24 - paddingLeft;
    const estimatedWidth = weightedLength(value) * fontSize;
    return Math.max(1, Math.ceil(estimatedWidth / Math.max(usableWidth, 1)));
  };

  let total = 36;
  total += Math.ceil(headerSize * 1.5);
  if (payload.kitchen) total += Math.ceil(headerSize * 1.5);
  total += Math.ceil(orderNumberSize * 1.5);
  total += Math.ceil(headerSize * 1.6); // created
  total += Math.ceil(pickupSize * 1.6);
  total += 28; // first divider/padding
  total += Math.ceil(headerSize * 1.5); // customer row
  total += Math.ceil(headerSize * 1.5); // notes row
  total += 28; // second divider/padding
  for (const line of payload.lines) {
    total += wrappedRows(`${line.qty} x ${line.name}`, lineSize) * Math.ceil(lineSize * 1.35);
    if (!payload.kitchen && line.lineTotalText) {
      total += Math.ceil(headerSize * 1.3);
    }
    for (const selection of line.selections) {
      const left = selection.indent ? 40 : 18;
      total +=
        wrappedRows(`- ${selection.text}`, selectionSize, left) * Math.ceil(selectionSize * 1.28);
    }
    total += 14;
  }
  if (!payload.kitchen) {
    total += 26;
    total += Math.ceil(headerSize * 1.4) * 3;
  }
  return Math.min(Math.max(total + 140, 800), 15000);
}

async function trimBottomWhitespaceOnly(inputPng: Buffer, minKeepHeight = 280, bottomPadding = 14) {
  const { data, info } = await sharp(inputPng)
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  let lastInkRow = -1;

  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * channels;
    let hasInk = false;
    for (let x = 0; x < width; x += 1) {
      const idx = rowStart + x * channels;
      const value = data[idx] ?? 255;
      if (value < 245) {
        hasInk = true;
        break;
      }
    }
    if (hasInk) {
      lastInkRow = y;
      break;
    }
  }

  if (lastInkRow < 0) {
    return inputPng;
  }

  const nextHeight = Math.max(minKeepHeight, Math.min(height, lastInkRow + 1 + bottomPadding));
  if (nextHeight >= height) return inputPng;

  return sharp(inputPng)
    .extract({
      left: 0,
      top: 0,
      width,
      height: nextHeight
    })
    .png()
    .toBuffer();
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

  const titleSize = Math.round(22 * kitchenScale);
  const orderNumberSize = Math.round(28 * kitchenScale);
  const bodySize = Math.round(21 * kitchenScale);
  const pickupSize = payload.kitchen ? Math.round(24 * kitchenScale) : Math.round(30 * kitchenScale);
  const lineSize = Math.round(38 * kitchenScale);
  const selectionSize = lineSize;
  const customerIdentitySize = payload.kitchen ? bodySize : Math.round(bodySize * 1.25);
  const customerLinePriceSize = payload.kitchen ? bodySize : Math.round(bodySize * 1.22);
  const totalsSize = payload.kitchen ? bodySize : Math.round(bodySize * 1.25);
  const headingWeight = payload.kitchen ? 500 : 700;
  const lineWeight = payload.kitchen ? 500 : 700;

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
        MozOsxFontSmoothing: "grayscale",
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
        <div style={{ fontSize: titleSize, fontWeight: headingWeight }}>{payload.restaurantName}</div>
        {payload.kitchen ? (
          <div style={{ marginTop: 4, fontSize: bodySize, fontWeight: headingWeight }}>KITCHEN COPY</div>
        ) : null}
        <div style={{ marginTop: 8, fontSize: orderNumberSize, fontWeight: headingWeight }}>{`#${payload.orderNumber}`}</div>
        <div style={{ marginTop: 6, fontSize: bodySize }}>{`Created: ${payload.createdText}`}</div>
        <div style={{ marginTop: 4, fontSize: pickupSize, fontWeight: 700 }}>{`Pickup: ${payload.pickupText}`}</div>
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
        <div style={{ fontSize: customerIdentitySize, fontWeight: headingWeight }}>{payload.customerText}</div>
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
            <div style={{ fontSize: lineSize, fontWeight: lineWeight }}>{`${line.qty} x ${line.name}`}</div>
            {!payload.kitchen && line.lineTotalText ? (
              <div style={{ marginTop: 2, fontSize: customerLinePriceSize }}>{line.lineTotalText}</div>
            ) : null}
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
            fontSize: totalsSize
          }}
        >
          <div>{`Subtotal: ${payload.subtotalText ?? "-"}`}</div>
          <div style={{ marginTop: 4 }}>{`Tax: ${payload.taxText ?? "-"}`}</div>
          <div style={{ marginTop: 6, fontWeight: 700, fontSize: Math.round(totalsSize * 1.1) }}>{`Total: ${payload.totalText ?? "-"}`}</div>
        </div>
      ) : null}
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
  const basePng = Buffer.from(pngData.asPng());
  const croppedPng = await trimBottomWhitespaceOnly(basePng);

  // Force a high-contrast 1-bit-like output to avoid printer-side anti-alias ambiguity.
  const bwPng = await sharp(croppedPng)
    .removeAlpha()
    .grayscale()
    .threshold(140, { grayscale: true })
    .png({
      palette: true,
      colors: 2,
      compressionLevel: 9,
      effort: 10,
      dither: 0
    })
    .toBuffer();

  return bwPng;
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

  const titleSize = Math.round(22 * kitchenScale);
  const orderNumberSize = Math.round(28 * kitchenScale);
  const bodySize = Math.round(21 * kitchenScale);
  const pickupSize = payload.kitchen ? Math.round(24 * kitchenScale) : Math.round(30 * kitchenScale);
  const lineSize = Math.round(38 * kitchenScale);
  const selectionSize = lineSize;
  const customerIdentitySize = payload.kitchen ? bodySize : Math.round(bodySize * 1.25);
  const customerLinePriceSize = payload.kitchen ? bodySize : Math.round(bodySize * 1.22);
  const totalsSize = payload.kitchen ? bodySize : Math.round(bodySize * 1.25);

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
        <div style={{ marginTop: 8, fontSize: orderNumberSize, fontWeight: 700 }}>{`#${payload.orderNumber}`}</div>
        <div style={{ marginTop: 6, fontSize: bodySize }}>{`Created: ${payload.createdText}`}</div>
        <div style={{ marginTop: 4, fontSize: pickupSize, fontWeight: 700 }}>{`Pickup: ${payload.pickupText}`}</div>
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
        <div style={{ fontSize: customerIdentitySize, fontWeight: 700 }}>{payload.customerText}</div>
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
            <div style={{ fontSize: lineSize, fontWeight: payload.kitchen ? 500 : 700 }}>{`${line.qty} x ${line.name}`}</div>
            {!payload.kitchen && line.lineTotalText ? (
              <div style={{ marginTop: 2, fontSize: customerLinePriceSize }}>{line.lineTotalText}</div>
            ) : null}
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
            fontSize: totalsSize
          }}
        >
          <div>{`Subtotal: ${payload.subtotalText ?? "-"}`}</div>
          <div style={{ marginTop: 4 }}>{`Tax: ${payload.taxText ?? "-"}`}</div>
          <div style={{ marginTop: 6, fontWeight: 700, fontSize: Math.round(totalsSize * 1.1) }}>{`Total: ${payload.totalText ?? "-"}`}</div>
        </div>
      ) : null}
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
