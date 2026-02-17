import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ItemBuilder } from "@/components/item-builder";

export default async function ItemPage({ params }: { params: { id: string } }) {
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
      <h1 className="text-2xl font-bold">{item.name}</h1>
      <p className="text-gray-600">{item.description}</p>
      <ItemBuilder item={item} />
    </div>
  );
}
