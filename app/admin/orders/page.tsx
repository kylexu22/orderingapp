"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"CURRENT" | "PAST">("CURRENT");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureAudioReady = useCallback(async () => {
    try {
      const Ctx =
        typeof window !== "undefined"
          ? (window.AudioContext ||
              (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : null;
      if (!Ctx) return false;
      if (!audioContextRef.current) {
        audioContextRef.current = new Ctx();
      }
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      const isRunning = audioContextRef.current.state === "running";
      setSoundEnabled(isRunning);
      return isRunning;
    } catch {
      return false;
    }
  }, []);

  const playNewOrderSound = useCallback(async () => {
    const ok = await ensureAudioReady();
    if (!ok || !audioContextRef.current) return;
    const context = audioContextRef.current;
    const now = context.currentTime;

    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    const osc1 = context.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.12);

    const osc2 = context.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1040, now + 0.12);
    osc2.connect(gain);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.24);
  }, [ensureAudioReady]);

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
    void ensureAudioReady();
    const unlock = () => {
      void ensureAudioReady();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudioReady]);

  useEffect(() => {
    const events = new EventSource("/api/orders/stream");
    events.addEventListener("ORDER_CREATED", () => {
      void playNewOrderSound();
      loadOrders();
    });
    events.addEventListener("ORDER_UPDATED", () => {
      loadOrders();
    });
    events.onerror = () => {
      setError("Realtime disconnected. Retrying...");
    };
    return () => events.close();
  }, [loadOrders, playNewOrderSound]);

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
      const passPrntUrl =
        `starpassprnt://v1/print/nopreview` +
        `?html=${encodeURIComponent(ticketHtml)}` +
        `&size=3` +
        `&cut=partial` +
        `&popup=no`;

      window.location.replace(passPrntUrl);
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
        {!soundEnabled ? (
          <button
            type="button"
            onClick={() => void ensureAudioReady()}
            className="border px-4 py-2 text-sm font-semibold"
          >
            Enable Sound Alerts
          </button>
        ) : (
          <span className="text-xs text-green-700">Sound alerts enabled</span>
        )}
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
