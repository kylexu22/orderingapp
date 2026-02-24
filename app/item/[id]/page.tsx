import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ItemBuilder } from "@/components/item-builder";
import { localizeText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";

export default async function ItemPage({ params }: { params: { id: string } }) {
  const lang = getServerLang();
  const item = await prisma.item.findFirst({
    where: { id: params.id, isActive: true, isComboOnly: false },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  if (!item) notFound();

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <Link
        href="/menu"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回餐牌" : "← Back to Menu"}
      </Link>
      <h1 className="text-2xl font-bold">{localizeText(item.name, lang)}</h1>
      <p className="text-gray-600">{localizeText(item.description, lang)}</p>
      <ItemBuilder item={item} lang={lang} />
    </div>
  );
}
