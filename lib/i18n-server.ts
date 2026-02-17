import { cookies } from "next/headers";
import type { Lang } from "@/lib/i18n";

export function getServerLang(): Lang {
  const lang = cookies().get("lang")?.value;
  return lang === "zh" ? "zh" : "en";
}

