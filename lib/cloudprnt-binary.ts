import receiptline from "receiptline";

type FontMode = "normal" | "tall" | "double";

type ReceiptlineEncoding =
  | "cp437"
  | "cp852"
  | "cp858"
  | "cp860"
  | "cp863"
  | "cp865"
  | "cp866"
  | "cp1252"
  | "cp932"
  | "cp936"
  | "cp949"
  | "cp950"
  | "multilingual"
  | "shiftjis"
  | "gb18030"
  | "ksc5601"
  | "big5"
  | "tis620";

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

const DEFAULT_UTF8_INTL_COMMAND_HEX = "1B1D7420";
const LINE_RULE = "--------------------------------";

const RECEIPTLINE_ENCODINGS = new Set<ReceiptlineEncoding>([
  "cp437",
  "cp852",
  "cp858",
  "cp860",
  "cp863",
  "cp865",
  "cp866",
  "cp1252",
  "cp932",
  "cp936",
  "cp949",
  "cp950",
  "multilingual",
  "shiftjis",
  "gb18030",
  "ksc5601",
  "big5",
  "tis620"
]);

function escapeReceiptlineText(text: string) {
  return text.replace(/([\\|{}~_"`^])/g, "\\$1");
}

function escapeReceiptlinePropertyValue(text: string) {
  return text.replace(/([\\|{};])/g, "\\$1");
}

function normalizeEncoding(input: string | undefined) {
  return (input ?? "utf-8").trim().toLowerCase();
}

function resolveReceiptlineEncoding(normalizedEncoding: string): ReceiptlineEncoding {
  if (RECEIPTLINE_ENCODINGS.has(normalizedEncoding as ReceiptlineEncoding)) {
    return normalizedEncoding as ReceiptlineEncoding;
  }

  // receiptline does not accept utf-8 as an encoding token.
  // For Traditional Chinese Star printers we map UTF-8 request to big5 command mode.
  if (normalizedEncoding === "utf8" || normalizedEncoding === "utf-8") {
    return "big5";
  }

  return "big5";
}

function parseHexBytes(hexValue: string | undefined) {
  const clean = (hexValue ?? "").replace(/[^a-fA-F0-9]/g, "");
  if (!clean || clean.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function bytesToReceiptlineEscapedCommand(bytes: number[]) {
  return bytes.map((byte) => `\\x${byte.toString(16).padStart(2, "0")}`).join("");
}

function getKitchenScalePrefix(mode: FontMode) {
  if (mode === "double") return "^^^";
  if (mode === "tall") return "^^";
  return "";
}

function withKitchenScale(text: string, mode: FontMode) {
  const prefix = getKitchenScalePrefix(mode);
  if (!prefix) return text;
  return `${prefix}${text}`;
}

function buildReceiptlineDoc(payload: BinaryReceiptPayload, normalizedEncoding: string) {
  const kitchenMode = payload.kitchenFontMode ?? "double";
  const lines: string[] = [];

  if (normalizedEncoding === "utf8" || normalizedEncoding === "utf-8") {
    const commandBytes =
      parseHexBytes(process.env.CLOUDPRNT_STAR_UTF8_INTL_COMMAND_HEX) ??
      parseHexBytes(DEFAULT_UTF8_INTL_COMMAND_HEX);
    if (commandBytes && commandBytes.length > 0) {
      lines.push(`{command:${bytesToReceiptlineEscapedCommand(commandBytes)}}`);
    }
  }

  lines.push(
    `{text:${escapeReceiptlinePropertyValue(payload.restaurantName)};align:center}`
  );
  if (payload.kitchen) {
    lines.push("{text:KITCHEN COPY;align:center}");
  }
  lines.push(`{text:^#${escapeReceiptlinePropertyValue(payload.orderNumber)};align:center}`);

  const createdText = `Created: ${payload.createdText}`;
  const pickupText = `Pickup: ${payload.pickupText}`;
  const customerText = payload.customerText;
  const notesText = payload.notesText;

  lines.push(
    payload.kitchen
      ? withKitchenScale(escapeReceiptlineText(createdText), kitchenMode)
      : escapeReceiptlineText(createdText)
  );
  lines.push(
    payload.kitchen
      ? withKitchenScale(escapeReceiptlineText(pickupText), kitchenMode)
      : escapeReceiptlineText(pickupText)
  );
  lines.push(
    payload.kitchen
      ? withKitchenScale(escapeReceiptlineText(customerText), kitchenMode)
      : escapeReceiptlineText(customerText)
  );
  lines.push(
    payload.kitchen
      ? withKitchenScale(escapeReceiptlineText(notesText), kitchenMode)
      : escapeReceiptlineText(notesText)
  );
  lines.push(LINE_RULE);

  for (const line of payload.lines) {
    const baseLine = `${line.qty} x ${line.name}`;
    lines.push(
      payload.kitchen
        ? withKitchenScale(escapeReceiptlineText(baseLine), kitchenMode)
        : escapeReceiptlineText(baseLine)
    );

    for (const selection of line.selections) {
      const prefix = selection.indent ? "    - " : "  - ";
      const selectionText = `${prefix}${selection.text}`;
      lines.push(
        payload.kitchen
          ? withKitchenScale(escapeReceiptlineText(selectionText), kitchenMode)
          : escapeReceiptlineText(selectionText)
      );
    }
  }

  if (!payload.kitchen) {
    lines.push(LINE_RULE);
    lines.push(escapeReceiptlineText(`Subtotal: ${payload.subtotalText ?? "-"}`));
    lines.push(escapeReceiptlineText(`Tax: ${payload.taxText ?? "-"}`));
    lines.push(escapeReceiptlineText(`Total: ${payload.totalText ?? "-"}`));
  }

  lines.push(`{text:${escapeReceiptlinePropertyValue(payload.paidText)};align:center}`);
  lines.push("=");

  return lines.join("\n");
}

export function buildCloudPrntBinaryReceipt(payload: BinaryReceiptPayload): Uint8Array {
  const normalizedEncoding = normalizeEncoding(payload.encoding);
  const receiptlineEncoding = resolveReceiptlineEncoding(normalizedEncoding);
  const receiptDoc = buildReceiptlineDoc(payload, normalizedEncoding);

  const printer = {
    cpl: 48,
    encoding: receiptlineEncoding,
    spacing: true,
    cutting: true,
    command: "starmbcs2" as const
  };

  const commands = receiptline.transform(receiptDoc, printer);
  return Uint8Array.from(Buffer.from(commands, "binary"));
}
