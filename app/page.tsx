import Link from "next/link";
import { getMenuData } from "@/lib/menu";
import { centsToCurrency } from "@/lib/format";
import { DesktopCartPanel } from "@/components/desktop-cart-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { categories, combos } = await getMenuData();
  const combosAnchorId = "category-combos";
  const visibleCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.isComboOnly)
    }))
    .filter((category) => category.items.length > 0);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <div className="space-y-6">
        <section className="sticky top-16 z-20 -mx-4 bg-[var(--bg)] px-4 py-2">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
            <a
              href={`#${combosAnchorId}`}
              className="inline-block rounded-full border border-amber-900/20 bg-white px-4 py-1.5 text-sm"
            >
              Combos
            </a>
            {visibleCategories.map((category) => (
              <a
                key={`btn-${category.id}`}
                href={`#category-${category.id}`}
                className="inline-block rounded-full border border-amber-900/20 bg-white px-4 py-1.5 text-sm"
              >
                {category.name}
              </a>
            ))}
          </div>
        </section>

        <section id={combosAnchorId} className="space-y-3 scroll-mt-24">
          <div className="rounded-lg border border-[#6b221a] bg-[#8b2e24] px-3 py-2">
            <h2 className="text-xl font-semibold text-[#f5f0e8]">Combos</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {combos.map((combo) => (
              <Link
                key={combo.id}
                href={`/combo/${combo.id}`}
                className="rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm"
              >
                <div className="text-lg font-semibold">{combo.name}</div>
                <div className="text-sm text-gray-600">{combo.description}</div>
                <div className="mt-2 font-medium text-[var(--brand)]">
                  {centsToCurrency(combo.basePriceCents)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {visibleCategories.map((category) => (
          <section id={`category-${category.id}`} key={category.id} className="space-y-3 scroll-mt-24">
            <div className="rounded-lg border border-[#6b221a] bg-[#8b2e24] px-3 py-2">
              <h2 className="text-xl font-semibold text-[#f5f0e8]">{category.name}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {category.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/item/${item.id}`}
                  className="rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm"
                >
                  <div className="text-base font-semibold">{item.name}</div>
                  <div className="text-sm text-gray-600">{item.description}</div>
                  <div className="mt-2 font-medium text-[var(--brand)]">
                    {centsToCurrency(item.basePriceCents)}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <DesktopCartPanel menu={{ categories: visibleCategories, combos }} />
    </div>
  );
}
