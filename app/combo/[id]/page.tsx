import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ComboBuilder } from "@/components/combo-builder";
import { localizeText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";

export default async function ComboPage({ params }: { params: { id: string } }) {
  const lang = getServerLang();
  const [combo, items] = await Promise.all([
    prisma.combo.findFirst({
      where: { id: params.id, isActive: true },
      include: {
        groups: {
          orderBy: { sortOrder: "asc" },
          include: {
            options: {
              orderBy: { sortOrder: "asc" }
            }
          }
        }
      }
    }),
    prisma.item.findMany({
      where: { isActive: true },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            sortOrder: true
          }
        },
        modifierGroups: {
          include: { options: true }
        }
      }
    })
  ]);
  if (!combo) notFound();

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <Link
        href="/menu"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回餐牌" : "← Back to Menu"}
      </Link>
      <h1 className="font-display-serif text-2xl font-bold">{localizeText(combo.name, lang)}</h1>
      <p className="text-gray-600">{localizeText(combo.description, lang)}</p>
      <ComboBuilder combo={combo} groups={combo.groups} items={items} lang={lang} />
    </div>
  );
}
