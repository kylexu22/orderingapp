"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
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
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(new Set());
  const [attentionOrderIds, setAttentionOrderIds] = useState<Set<string>>(new Set());
  const [swipeOffsetByOrderId, setSwipeOffsetByOrderId] = useState<Record<string, number>>({});
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const dragStateRef = useRef<{
    orderId: string;
    pointerId: number;
    startX: number;
    startOffset: number;
  } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const keepAliveObjectUrlRef = useRef<string | null>(null);
  const isAlertPlayingRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastRealtimeMessageAtRef = useRef<number>(Date.now());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedOrdersRef = useRef(false);
  const SWIPE_REVEAL_PX = 180;

  const startSilentKeepAliveLoop = useCallback(async () => {
    try {
      if (!keepAliveAudioRef.current) {
        const sampleRate = 8000;
        const seconds = 2;
        const numSamples = sampleRate * seconds;
        const bytesPerSample = 2;
        const dataSize = numSamples * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset: number, value: string) => {
          for (let i = 0; i < value.length; i += 1) {
            view.setUint8(offset + i, value.charCodeAt(i));
          }
        };

        writeString(0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true);
        view.setUint16(32, bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeString(36, "data");
        view.setUint32(40, dataSize, true);

        const blob = new Blob([buffer], { type: "audio/wav" });
        const objectUrl = URL.createObjectURL(blob);
        keepAliveObjectUrlRef.current = objectUrl;

        const audio = new Audio(objectUrl);
        audio.loop = true;
        audio.preload = "auto";
        audio.setAttribute("playsinline", "true");
        keepAliveAudioRef.current = audio;
      }

      await keepAliveAudioRef.current.play();
      return true;
    } catch {
      return false;
    }
  }, []);

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
    if (isAlertPlayingRef.current) return;
    const ok = await ensureAudioReady();
    if (!ok || !audioContextRef.current) return;
    isAlertPlayingRef.current = true;
    const context = audioContextRef.current;
    const now = context.currentTime;
    const totalDurationSeconds = 2.5;
    const cycleSeconds = 0.5;
    const cycles = Math.floor(totalDurationSeconds / cycleSeconds);

    for (let i = 0; i < cycles; i += 1) {
      const start = now + i * cycleSeconds;
      const gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      const osc1 = context.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, start);
      osc1.connect(gain);
      osc1.start(start);
      osc1.stop(start + 0.11);

      const osc2 = context.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1040, start + 0.11);
      osc2.connect(gain);
      osc2.start(start + 0.11);
      osc2.stop(start + 0.22);
    }

    window.setTimeout(() => {
      isAlertPlayingRef.current = false;
    }, totalDurationSeconds * 1000 + 100);
  }, [ensureAudioReady]);

  const loadOrders = useCallback(async () => {
    const res = await fetch("/api/orders");
    if (!res.ok) return;
    const data = await res.json();
    const nextOrders = (data.orders ?? []) as AdminOrder[];
    setOrders(nextOrders);

    const nextKnownIds = new Set(nextOrders.map((order) => order.id));
    if (!hasHydratedOrdersRef.current) {
      knownOrderIdsRef.current = nextKnownIds;
      hasHydratedOrdersRef.current = true;
      return;
    }

    const newlySeenActiveOrders = nextOrders.filter((order) => {
      const isActive =
        order.status !== OrderStatus.PICKED_UP && order.status !== OrderStatus.CANCELLED;
      return isActive && !knownOrderIdsRef.current.has(order.id);
    });

    if (newlySeenActiveOrders.length > 0) {
      const newIds = newlySeenActiveOrders.map((order) => order.id);
      setHighlightedOrderIds((prev) => new Set([...prev, ...newIds]));
      setAttentionOrderIds((prev) => new Set([...prev, ...newIds]));
      void playNewOrderSound();
    }

    knownOrderIdsRef.current = nextKnownIds;
  }, [playNewOrderSound]);

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
    return () => {
      if (keepAliveAudioRef.current) {
        keepAliveAudioRef.current.pause();
      }
      if (keepAliveObjectUrlRef.current) {
        URL.revokeObjectURL(keepAliveObjectUrlRef.current);
      }
    };
  }, []);

  async function enableSoundAlerts() {
    const ready = await ensureAudioReady();
    if (!ready) return;
    await startSilentKeepAliveLoop();
  }

  useEffect(() => {
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeRealtime = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const connectRealtime = () => {
      clearReconnectTimer();
      closeRealtime();
      const events = new EventSource("/api/orders/stream");
      eventSourceRef.current = events;
      lastRealtimeMessageAtRef.current = Date.now();

      events.onopen = () => {
        setError("");
        lastRealtimeMessageAtRef.current = Date.now();
      };

      events.addEventListener("ping", () => {
        lastRealtimeMessageAtRef.current = Date.now();
      });

      events.addEventListener("ORDER_CREATED", (event) => {
        lastRealtimeMessageAtRef.current = Date.now();
        try {
          const payload = JSON.parse((event as MessageEvent).data ?? "{}") as { id?: string };
          const orderId = payload.id;
          if (orderId) {
            setHighlightedOrderIds((prev) => new Set([...prev, orderId]));
            setAttentionOrderIds((prev) => new Set([...prev, orderId]));
            knownOrderIdsRef.current.add(orderId);
          }
        } catch {
          // ignore payload parse errors
        }
        void playNewOrderSound();
        void loadOrders();
      });

      events.addEventListener("ORDER_UPDATED", () => {
        lastRealtimeMessageAtRef.current = Date.now();
        void loadOrders();
      });

      events.onerror = () => {
        setError("Realtime disconnected. Reconnecting...");
        closeRealtime();
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connectRealtime();
          void loadOrders();
        }, 1500);
      };
    };

    const refreshRealtimeOnForeground = () => {
      if (document.visibilityState !== "visible") return;
      connectRealtime();
      void loadOrders();
    };

    connectRealtime();

    const pollTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const staleMs = Date.now() - lastRealtimeMessageAtRef.current;
      if (staleMs > 35_000) {
        connectRealtime();
      }
      void loadOrders();
    }, 15_000);

    document.addEventListener("visibilitychange", refreshRealtimeOnForeground);
    window.addEventListener("focus", refreshRealtimeOnForeground);
    window.addEventListener("pageshow", refreshRealtimeOnForeground);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", refreshRealtimeOnForeground);
      window.removeEventListener("focus", refreshRealtimeOnForeground);
      window.removeEventListener("pageshow", refreshRealtimeOnForeground);
      clearReconnectTimer();
      closeRealtime();
    };
  }, [loadOrders, playNewOrderSound]);

  async function sendToPastOrders(orderId: string) {
    setHighlightedOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    setAttentionOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: OrderStatus.PICKED_UP })
    });
    if (!res.ok) return;
    setSwipeOffsetByOrderId((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    loadOrders();
  }

  function isInteractiveTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button, a, input, textarea, select, label"));
  }

  function handleOrderPointerDown(orderId: string, event: PointerEvent<HTMLElement>) {
    if (tab !== "CURRENT") return;
    if (isInteractiveTarget(event.target)) return;
    const currentOffset = swipeOffsetByOrderId[orderId] ?? 0;
    dragStateRef.current = {
      orderId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: currentOffset
    };
    setDraggingOrderId(orderId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleOrderPointerMove(orderId: string, event: PointerEvent<HTMLElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.orderId !== orderId || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const nextOffset = Math.max(0, Math.min(SWIPE_REVEAL_PX, drag.startOffset + deltaX));
    setSwipeOffsetByOrderId((prev) => ({
      ...prev,
      [orderId]: nextOffset
    }));
  }

  function handleOrderPointerEnd(orderId: string, event: PointerEvent<HTMLElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.orderId !== orderId || drag.pointerId !== event.pointerId) return;
    const currentOffset = swipeOffsetByOrderId[orderId] ?? 0;
    const shouldReveal = currentOffset >= SWIPE_REVEAL_PX * 0.55;
    setSwipeOffsetByOrderId((prev) => ({
      ...prev,
      [orderId]: shouldReveal ? SWIPE_REVEAL_PX : 0
    }));
    setDraggingOrderId(null);
    dragStateRef.current = null;
  }

  async function printPassPrnt(orderNumber: string, orderId: string, kitchen = false) {
    setHighlightedOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    setAttentionOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
    try {
      const ticketRes = await fetch(
        `/api/orders/${orderNumber}/ticket${kitchen ? "?kitchen=1" : ""}`
      );
      if (!ticketRes.ok) {
        throw new Error("Ticket fetch failed");
      }
      const ticketHtml = await ticketRes.text();
      const backUrl = `${window.location.origin}/close-tab`;
      const passPrntUrl =
        `starpassprnt://v1/print/nopreview` +
        `?html=${encodeURIComponent(ticketHtml)}` +
        `&back=${encodeURIComponent(backUrl)}` +
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
        <Link
          href="/admin/orders"
          className="rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Orders
        </Link>
        <Link href="/admin/menu" className="rounded border px-4 py-2 text-sm font-semibold">
          Menu
        </Link>
        <Link href="/admin/settings" className="rounded border px-4 py-2 text-sm font-semibold">
          Settings
        </Link>
      </div>
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
            onClick={() => void enableSoundAlerts()}
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
        <div key={order.id} className="relative overflow-hidden rounded-xl">
          {tab === "CURRENT" ? (
            <div className="absolute inset-y-0 left-0 w-[180px] bg-green-700">
              <button
                onClick={() => void sendToPastOrders(order.id)}
                aria-label="Confirm complete order"
                className="flex h-full w-full items-center justify-center bg-green-700 text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 12.5l2.3 2.3 4.7-4.7" />
                </svg>
              </button>
            </div>
          ) : null}
          <article
            onPointerDown={(event) => handleOrderPointerDown(order.id, event)}
            onPointerMove={(event) => handleOrderPointerMove(order.id, event)}
            onPointerUp={(event) => handleOrderPointerEnd(order.id, event)}
            onPointerCancel={(event) => handleOrderPointerEnd(order.id, event)}
            className={`relative rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm ${
              highlightedOrderIds.has(order.id) ? "new-order-pulse" : ""
            } ${attentionOrderIds.has(order.id) ? "border-yellow-500" : ""}`}
            style={{
              transform:
                tab === "CURRENT" ? `translateX(${swipeOffsetByOrderId[order.id] ?? 0}px)` : undefined,
              transition:
                draggingOrderId === order.id ? "none" : "transform 180ms ease-out",
              touchAction: tab === "CURRENT" ? "pan-y" : undefined
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">#{order.orderNumber}</div>
                <div className="text-sm">Created {fmtDateTime(order.createdAt)}</div>
                <div className="text-lg font-bold">
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
                  onClick={() => void printPassPrnt(order.orderNumber, order.id)}
                  className="rounded bg-black px-4 py-2 text-lg font-semibold text-white"
                >
                  Print
                </button>
                <button
                  onClick={() => void printPassPrnt(order.orderNumber, order.id, true)}
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
                <span className="text-xs text-gray-600">Swipe card right to complete</span>
              </div>
            ) : (
              <div className="mt-3">
                <span className="rounded bg-amber-100 px-3 py-1 font-medium">{order.status}</span>
              </div>
            )}

            <div className="mt-3 text-sm">
              Subtotal {centsToCurrency(order.subtotalCents)} | Tax {centsToCurrency(order.taxCents)} |
              Total <strong>{centsToCurrency(order.totalCents)}</strong>
            </div>
          </article>
        </div>
      ))}

      {visibleOrders.length === 0 ? (
        <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">No orders in this section.</div>
      ) : null}
      <style jsx global>{`
        @keyframes newOrderPulseYellow {
          0% {
            background-color: #fff9c4;
          }
          50% {
            background-color: #fde68a;
          }
          100% {
            background-color: #fff9c4;
          }
        }
        .new-order-pulse {
          animation: newOrderPulseYellow 2.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
