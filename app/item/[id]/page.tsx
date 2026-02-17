import { notFound } from "next/navigation";
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
      <h1 className="text-2xl font-bold">{localizeText(item.name, lang)}</h1>
      <p className="text-gray-600">{localizeText(item.description, lang)}</p>
      <ItemBuilder item={item} lang={lang} />
    </div>
  );
}
