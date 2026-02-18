"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToCurrency, fmtDateTime } from "@/lib/format";
import { getClientLang, type Lang } from "@/lib/i18n";

type HistoryOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  totalCents: number;
};

export default function OrderHistoryPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLang(getClientLang());
    fetch("/api/account/orders")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => setOrders(data?.orders ?? []))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold">{lang === "zh" ? "訂單記錄" : "Order History"}</h1>
      {loading ? <div>{lang === "zh" ? "載入中..." : "Loading..."}</div> : null}
      {!loading && orders.length === 0 ? (
        <div className="text-sm text-gray-600">{lang === "zh" ? "尚未有任何訂單。" : "No orders yet."}</div>
      ) : null}
      <div className="space-y-2">
        {orders.map((order) => (
          <div key={order.id} className="rounded border border-amber-900/20 p-3">
            <div className="font-semibold">#{order.orderNumber}</div>
            <div className="text-sm text-gray-600">{fmtDateTime(order.createdAt)}</div>
            <div className="text-sm">{lang === "zh" ? "狀態" : "Status"}: {order.status}</div>
            <div className="text-sm font-semibold">{lang === "zh" ? "總計" : "Total"}: {centsToCurrency(order.totalCents)}</div>
            <Link href={`/order/${order.orderNumber}`} className="mt-2 inline-block text-sm underline">
              {lang === "zh" ? "查看" : "View"}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

