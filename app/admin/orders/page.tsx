"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderStatus } from "@prisma/client";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";

type AdminOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  customerName: string;
  phone: string;
  notes: string | null;
  pickupType: "ASAP" | "SCHEDULED";
  pickupTime: string | null;
  estimatedReadyTime: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: Array<{
    id: string;
    nameSnapshot: string;
    qty: number;
    lineType: "ITEM" | "COMBO";
    lineTotalCents: number;
    selections: Array<{
      id: string;
      selectionKind: "COMBO_PICK" | "MODIFIER";
      label: string;
      selectedItemNameSnapshot: string | null;
      selectedModifierOptionNameSnapshot: string | null;
      priceDeltaSnapshotCents: number;
    }>;
  }>;
};

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.start();
    setTimeout(() => oscillator.stop(), 170);
  } catch {
    // Audio can be blocked until user interaction.
  }
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"CURRENT" | "PAST">("CURRENT");

  const loadOrders = useCallback(async () => {
    const res = await fetch("/api/orders");
    if (!res.ok) return;
    const data = await res.json();
    setOrders(data.orders);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const events = new EventSource("/api/orders/stream");
    events.addEventListener("ORDER_CREATED", () => {
      beep();
      loadOrders();
    });
    events.addEventListener("ORDER_UPDATED", () => {
      loadOrders();
    });
    events.onerror = () => {
      setError("Realtime disconnected. Retrying...");
    };
    return () => events.close();
  }, [loadOrders]);

  async function sendToPastOrders(orderId: string) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: OrderStatus.PICKED_UP })
    });
    if (!res.ok) return;
    loadOrders();
  }

  async function printPassPrnt(orderNumber: string, kitchen = false) {
    try {
      const ticketRes = await fetch(
        `/api/orders/${orderNumber}/ticket${kitchen ? "?kitchen=1" : ""}`
      );
      if (!ticketRes.ok) {
        throw new Error("Ticket fetch failed");
      }
      const ticketHtml = await ticketRes.text();
      const backUrl = window.location.href;
      const passPrntUrl =
        `starpassprnt://v1/print/nopreview` +
        `?html=${encodeURIComponent(ticketHtml)}` +
        `&back=${encodeURIComponent(backUrl)}` +
        `&size=3` +
        `&cut=partial` +
        `&popup=no`;

      window.location.href = passPrntUrl;
    } catch {
      alert("PassPRNT print failed.");
    }
  }

  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        if (a.status === OrderStatus.NEW && b.status !== OrderStatus.NEW) return -1;
        if (a.status !== OrderStatus.NEW && b.status === OrderStatus.NEW) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [orders]
  );

  const currentOrders = sorted.filter(
    (order) => order.status !== OrderStatus.PICKED_UP && order.status !== OrderStatus.CANCELLED
  );
  const pastOrders = sorted.filter(
    (order) => order.status === OrderStatus.PICKED_UP || order.status === OrderStatus.CANCELLED
  );
  const visibleOrders = tab === "CURRENT" ? currentOrders : pastOrders;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("CURRENT")}
          className={`border px-4 py-2 text-sm font-semibold ${
            tab === "CURRENT" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
          }`}
        >
          Current Orders
        </button>
        <button
          type="button"
          onClick={() => setTab("PAST")}
          className={`border px-4 py-2 text-sm font-semibold ${
            tab === "PAST" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
          }`}
        >
          Past Orders
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {visibleOrders.map((order) => (
        <article
          key={order.id}
          className={`rounded-xl border p-4 shadow-sm ${
            order.status === OrderStatus.NEW
              ? "border-red-600 bg-red-50"
              : "border-amber-900/20 bg-[var(--card)]"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-bold">#{order.orderNumber}</div>
              <div className="text-sm">Created {fmtDateTime(order.createdAt)}</div>
              <div className="text-sm font-semibold">
                Pickup:{" "}
                {order.pickupType === "ASAP"
                  ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
                  : fmtDateTime(order.pickupTime as string)}
              </div>
              <div className="text-sm">
                {order.customerName} | {order.phone}
              </div>
              {order.notes ? <div className="text-sm">Notes: {order.notes}</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void printPassPrnt(order.orderNumber)}
                className="rounded bg-black px-4 py-2 text-lg font-semibold text-white"
              >
                Print
              </button>
              <button
                onClick={() => void printPassPrnt(order.orderNumber, true)}
                className="rounded border border-black px-4 py-2 text-lg font-semibold text-black"
              >
                Print for Kitchen
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-base">
            {order.lines.map((line) => (
              <div key={line.id}>
                <div className="font-semibold">
                  {line.qty} x {line.nameSnapshot}
                </div>
                {line.selections.map((s) => (
                  <div key={s.id} className="pl-4 text-sm text-gray-700">
                    {s.selectionKind === "COMBO_PICK" ? (
                      <>- {s.selectedItemNameSnapshot}</>
                    ) : (
                      <>
                        - {s.label}: {s.selectedModifierOptionNameSnapshot}
                        {s.priceDeltaSnapshotCents
                          ? ` (${centsToCurrency(s.priceDeltaSnapshotCents)})`
                          : ""}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {tab === "CURRENT" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-100 px-3 py-1 font-medium">{order.status}</span>
              <button
                onClick={() => void sendToPastOrders(order.id)}
                className="rounded border px-3 py-1 text-sm font-semibold"
              >
                Send to Past Orders
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <span className="rounded bg-amber-100 px-3 py-1 font-medium">{order.status}</span>
            </div>
          )}

          <div className="mt-3 text-sm">
            Subtotal {centsToCurrency(order.subtotalCents)} | Tax {centsToCurrency(order.taxCents)} | Total{" "}
            <strong>{centsToCurrency(order.totalCents)}</strong>
          </div>
        </article>
      ))}

      {visibleOrders.length === 0 ? (
        <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">No orders in this section.</div>
      ) : null}
    </div>
  );
}
