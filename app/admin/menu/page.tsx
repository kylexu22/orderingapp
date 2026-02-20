import { getMenuData } from "@/lib/menu";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMenuPage() {
  const { categories, combos } = await getMenuData();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="rounded border px-4 py-2 text-sm font-semibold">
          Orders
        </Link>
        <Link
          href="/admin/menu"
          className="rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Menu
        </Link>
        <Link href="/admin/settings" className="rounded border px-4 py-2 text-sm font-semibold">
          Settings
        </Link>
        <Link href="/admin/analytics" className="rounded border px-4 py-2 text-sm font-semibold">
          Analytics
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Menu (Read Only)</h1>
      <p className="rounded bg-amber-100 p-3 text-sm">
        Edit via seed script or direct database updates for MVP.
      </p>
      <section className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Categories + Items</h2>
        {categories.map((c) => (
          <div key={c.id} className="mt-3">
            <div className="font-semibold">{c.name}</div>
            <ul className="list-disc pl-5 text-sm">
              {c.items.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Combos</h2>
        <ul className="list-disc pl-5 text-sm">
          {combos.map((combo) => (
            <li key={combo.id}>{combo.name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
