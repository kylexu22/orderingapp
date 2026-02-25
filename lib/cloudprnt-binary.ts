import iconv from "iconv-lite";

type Align = "left" | "center";

type FontMode = "normal" | "tall" | "double";

export type BinaryReceiptSelection = {
  text: string;
  indent: boolean;
};

export type BinaryReceiptLine = {
  qty: number;
  name: string;
  selections: BinaryReceiptSelection[];
};

export type BinaryReceiptPayload = {
  restaurantName: string;
  orderNumber: string;
  createdText: string;
  pickupText: string;
  customerText: string;
  notesText: string;
  kitchen: boolean;
  lines: BinaryReceiptLine[];
  subtotalText?: string;
  taxText?: string;
  totalText?: string;
  paidText: string;
  encoding?: string;
  kitchenFontMode?: FontMode;
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function alignByte(align: Align) {
  return align === "center" ? 1 : 0;
}

function sizeByte(mode: FontMode) {
  if (mode === "double") return 0x11;
  if (mode === "tall") return 0x01;
  return 0x00;
}

function encodeText(text: string, encoding: string) {
  return iconv.encode(text, encoding);
}

function pushCommand(out: number[], ...bytes: number[]) {
  out.push(...bytes);
}

function pushBuffer(out: number[], buffer: Buffer) {
  for (const b of buffer) out.push(b);
}

function pushLine(
  out: number[],
  text: string,
  opts: {
    align?: Align;
    bold?: boolean;
    mode?: FontMode;
    encoding: string;
  }
) {
  pushCommand(out, ESC, 0x61, alignByte(opts.align ?? "left")); // align
  pushCommand(out, ESC, 0x45, opts.bold ? 1 : 0); // bold on/off
  pushCommand(out, GS, 0x21, sizeByte(opts.mode ?? "normal")); // char size
  pushBuffer(out, encodeText(text, opts.encoding));
  pushCommand(out, LF);
}

export function buildCloudPrntBinaryReceipt(payload: BinaryReceiptPayload): Uint8Array {
  const encoding = payload.encoding ?? "big5";
  const kitchenMode = payload.kitchenFontMode ?? "double";
  const out: number[] = [];

  // Initialize printer
  pushCommand(out, ESC, 0x40);

  const bigMode: FontMode = payload.kitchen ? kitchenMode : "normal";
  const midMode: FontMode = payload.kitchen ? "tall" : "normal";

  pushLine(out, payload.restaurantName, {
    align: "center",
    bold: true,
    mode: midMode,
    encoding
  });
  if (payload.kitchen) {
    pushLine(out, "KITCHEN COPY", {
      align: "center",
      bold: true,
      mode: midMode,
      encoding
    });
  }
  pushLine(out, `#${payload.orderNumber}`, {
    align: "center",
    bold: true,
    mode: bigMode,
    encoding
  });
  pushLine(out, `Created: ${payload.createdText}`, { align: "left", bold: false, mode: bigMode, encoding });
  pushLine(out, `Pickup: ${payload.pickupText}`, { align: "left", bold: true, mode: bigMode, encoding });
  pushLine(out, payload.customerText, { align: "left", bold: false, mode: bigMode, encoding });
  pushLine(out, payload.notesText, { align: "left", bold: false, mode: bigMode, encoding });
  pushLine(out, "--------------------------------", { align: "left", bold: false, mode: "normal", encoding });

  for (const line of payload.lines) {
    pushLine(out, `${line.qty} x ${line.name}`, {
      align: "left",
      bold: true,
      mode: bigMode,
      encoding
    });
    for (const selection of line.selections) {
      const prefix = selection.indent ? "    - " : "  - ";
      pushLine(out, `${prefix}${selection.text}`, {
        align: "left",
        bold: false,
        mode: bigMode,
        encoding
      });
    }
  }

  if (!payload.kitchen) {
    pushLine(out, "--------------------------------", { align: "left", bold: false, mode: "normal", encoding });
    pushLine(out, `Subtotal: ${payload.subtotalText ?? "-"}`, { align: "left", bold: false, mode: "normal", encoding });
    pushLine(out, `Tax: ${payload.taxText ?? "-"}`, { align: "left", bold: false, mode: "normal", encoding });
    pushLine(out, `Total: ${payload.totalText ?? "-"}`, { align: "left", bold: true, mode: "normal", encoding });
  }

  pushLine(out, payload.paidText, { align: "center", bold: true, mode: bigMode, encoding });
  pushLine(out, "", { align: "left", bold: false, mode: "normal", encoding });

  // Feed and cut
  pushCommand(out, GS, 0x56, 0x42, 0x00);

  return Uint8Array.from(out);
}

