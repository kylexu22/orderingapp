import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ComboBuilder } from "@/components/combo-builder";

export default async function ComboPage({ params }: { params: { id: string } }) {
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
      <h1 className="text-2xl font-bold">{combo.name}</h1>
      <p className="text-gray-600">{combo.description}</p>
      <ComboBuilder combo={combo} groups={combo.groups} items={items} />
    </div>
  );
}
