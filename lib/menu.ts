import { prisma } from "@/lib/prisma";

export async function getMenuData() {
  const [categories, combos, settings] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { name: "asc" },
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
        }
      }
    }),
    prisma.combo.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
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
    prisma.storeSettings.findUnique({
      where: { id: "default" }
    })
  ]);

  return { categories, combos, settings };
}
