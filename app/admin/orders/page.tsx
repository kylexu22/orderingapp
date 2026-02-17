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

const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.ACCEPTED,
  OrderStatus.READY,
  OrderStatus.PICKED_UP
];

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
  const [printMode, setPrintMode] = useState<"BROWSER" | "STAR_WEBPRNT">("BROWSER");

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

  async function setStatus(orderId: string, status: OrderStatus) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) return;
    loadOrders();
  }

  function printBrowser(orderNumber: string) {
    const w = window.open(`/api/orders/${orderNumber}/ticket`, "_blank", "noopener,noreferrer");
    if (!w) {
      alert("Popup blocked. Please allow popups for printing.");
      return;
    }
    w.onload = () => {
      try {
        w.focus();
        w.print();
        setTimeout(() => w.print(), 600);
      } catch {
        alert("Print failed. Please use browser print manually and set Copies = 2.");
      }
    };
  }

  async function printStarWebPrnt(orderNumber: string) {
    const endpoint = process.env.NEXT_PUBLIC_STAR_WEBPRNT_URL;
    if (!endpoint) {
      alert("NEXT_PUBLIC_STAR_WEBPRNT_URL is not configured. Falling back to browser print.");
      printBrowser(orderNumber);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderNumber}/ticket?format=text`);
      if (!res.ok) throw new Error("Ticket fetch failed");
      const ticketText = await res.text();

      const esc = (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<StarWebPrint>
  <request>
    <text>${esc(ticketText).replaceAll("\n", "&#10;")}</text>
    <cut type="partial"/>
  </request>
</StarWebPrint>`;

      for (let i = 0; i < 2; i += 1) {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/xml; charset=utf-8" },
          body: xml,
          mode: "cors"
        });
      }
      alert("Sent 2 copies to Star WebPRNT.");
    } catch {
      alert("Star WebPRNT failed. Falling back to browser print.");
      printBrowser(orderNumber);
    }
  }

  function print(orderNumber: string) {
    if (printMode === "STAR_WEBPRNT") {
      void printStarWebPrnt(orderNumber);
      return;
    }
    printBrowser(orderNumber);
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

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--brand)]">iPad Order Console</h1>
        <p className="text-sm text-gray-600">Print each order twice: front + kitchen copy.</p>
        <label className="mt-2 inline-flex items-center gap-2 text-sm">
          Print Mode
          <select
            value={printMode}
            onChange={(e) => setPrintMode(e.target.value as "BROWSER" | "STAR_WEBPRNT")}
            className="rounded border px-2 py-1"
          >
            <option value="BROWSER">Browser Fallback (Default)</option>
            <option value="STAR_WEBPRNT">Star WebPRNT (Optional)</option>
          </select>
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>

      {sorted.map((order) => (
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
                onClick={() => print(order.orderNumber)}
                className="rounded bg-black px-4 py-2 text-lg font-semibold text-white"
              >
                Print x2
              </button>
              <button
                onClick={() => print(order.orderNumber)}
                className="rounded border px-4 py-2 text-lg font-semibold"
              >
                Reprint
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
                    - {s.label}: {s.selectedItemNameSnapshot || s.selectedModifierOptionNameSnapshot}
                    {s.priceDeltaSnapshotCents ? ` (${centsToCurrency(s.priceDeltaSnapshotCents)})` : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-amber-100 px-3 py-1 font-medium">{order.status}</span>
            {STATUS_FLOW.map((status) => (
              <button
                key={status}
                onClick={() => setStatus(order.id, status)}
                className="rounded border px-3 py-1 text-sm"
              >
                {status}
              </button>
            ))}
            <button
              onClick={() => setStatus(order.id, OrderStatus.CANCELLED)}
              className="rounded border border-red-700 px-3 py-1 text-sm text-red-700"
            >
              CANCELLED
            </button>
          </div>

          <div className="mt-3 text-sm">
            Subtotal {centsToCurrency(order.subtotalCents)} | Tax {centsToCurrency(order.taxCents)} | Total{" "}
            <strong>{centsToCurrency(order.totalCents)}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

