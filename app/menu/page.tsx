import Link from "next/link";
import { getMenuData } from "@/lib/menu";
import { centsToCurrency } from "@/lib/format";
import { DesktopCartPanel } from "@/components/desktop-cart-panel";
import { localizeText } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { getStoreOrderState } from "@/lib/store-status";
import { StoreHours } from "@/lib/types";
import { MenuScrollLink } from "@/components/menu-scroll-link";
import { MenuScrollRestore } from "@/components/menu-scroll-restore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MenuPage() {
  const lang = getServerLang();
  const { categories, combos, settings } = await getMenuData();
  const combosAnchorId = "category-combos";
  const visibleCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.isComboOnly)
    }))
    .filter((category) => category.items.length > 0);

  const orderState = settings
    ? getStoreOrderState({
        acceptingOrders: settings.acceptingOrders,
        timezone: settings.timezone,
        storeHours: settings.storeHours as StoreHours,
        closedDates: settings.closedDates as string[]
      })
    : "OPEN";
  const showStoreBanner = orderState !== "OPEN";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <MenuScrollRestore />
      <div className="space-y-6">
        {showStoreBanner ? (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {orderState === "CLOSED"
              ? lang === "zh"
                ? "本店目前休息中，暫時不能下單。你仍可瀏覽菜單。"
                : "The store is currently closed. Ordering is unavailable, but you can still view the menu."
              : lang === "zh"
                ? "本店暫停接單。你仍可瀏覽菜單。"
                : "Ordering is currently turned off. You can still view the menu."}
          </div>
        ) : null}
        <section className="menu-category-sticky border-b border-amber-900/10 bg-[var(--bg)] py-2">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
            <a
              href={`#${combosAnchorId}`}
              className="inline-block rounded-full border border-amber-900/20 bg-white px-4 py-1.5 text-sm"
            >
              {lang === "zh" ? "套餐" : "Combos"}
            </a>
            {visibleCategories.map((category) => (
              <a
                key={`btn-${category.id}`}
                href={`#category-${category.id}`}
                className="inline-block rounded-full border border-amber-900/20 bg-white px-4 py-1.5 text-sm"
              >
                {localizeText(category.name, lang)}
              </a>
            ))}
          </div>
        </section>

        <section id={combosAnchorId} className="space-y-3 scroll-mt-24">
          <div className="rounded-lg border border-[#6b221a] bg-[#8b2e24] px-3 py-2">
            <h2 className="font-display-serif text-xl font-semibold text-[#f5f0e8]">
              {lang === "zh" ? "套餐" : "Combos"}
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {combos.map((combo) => (
              <Link
                key={combo.id}
                href={`/combo/${combo.id}`}
                className="menu-food-card rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm"
              >
                <div className="font-display-serif text-lg font-semibold">{localizeText(combo.name, lang)}</div>
                <div className="text-sm text-gray-600">{localizeText(combo.description, lang)}</div>
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
              <h2 className="font-display-serif text-xl font-semibold text-[#f5f0e8]">
                {localizeText(category.name, lang)}
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {category.items.map((item) => (
                <MenuScrollLink
                  key={item.id}
                  href={`/item/${item.id}`}
                  className="menu-food-card rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm"
                >
                  <div className="font-display-serif text-base font-semibold">
                    {localizeText(item.name, lang)}
                  </div>
                  <div className="text-sm text-gray-600">{localizeText(item.description, lang)}</div>
                  <div className="mt-2 font-medium text-[var(--brand)]">
                    {centsToCurrency(item.basePriceCents)}
                  </div>
                </MenuScrollLink>
              ))}
            </div>
          </section>
        ))}
      </div>
      <DesktopCartPanel menu={{ categories: visibleCategories, combos }} lang={lang} />
    </div>
  );
}
