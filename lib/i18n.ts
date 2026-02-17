export type Lang = "zh" | "en";

export function getClientLang(): Lang {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("lang="));
  if (!cookie) return "en";
  return cookie.slice("lang=".length) === "zh" ? "zh" : "en";
}

function splitBilingual(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { zh: "", en: "" };

  const pipeSplit = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  if (pipeSplit.length >= 2) {
    return { zh: pipeSplit[0], en: pipeSplit.slice(1).join(" | ") };
  }

  const firstLatinIdx = trimmed.search(/[A-Za-z]/);
  if (firstLatinIdx > 0) {
    const zh = trimmed.slice(0, firstLatinIdx).trim();
    const en = trimmed.slice(firstLatinIdx).trim();
    if (zh && en) return { zh, en };
  }

  const hasZh = /[\u3400-\u9FFF]/.test(trimmed);
  const hasEn = /[A-Za-z]/.test(trimmed);
  if (hasZh && !hasEn) return { zh: trimmed, en: "" };
  if (!hasZh && hasEn) return { zh: "", en: trimmed };
  return { zh: trimmed, en: trimmed };
}

export function localizeText(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  const { zh, en } = splitBilingual(value);
  const normalizedZh = zh.includes("中文待翻譯") ? "" : zh;
  if (lang === "zh") return normalizedZh || en || value;
  return en || zh || value;
}
