"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { OrderStatus, PrintCopyType } from "@prisma/client";
import { centsToCurrency, fmtDateTime, fmtTime } from "@/lib/format";
import { getClientLang, localizeText, type Lang } from "@/lib/i18n";
import { getStoreOrderState } from "@/lib/store-status";
import type { StoreHours } from "@/lib/types";
import { formatOrderSelectionsForDisplay } from "@/lib/order-selection-display";

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
      selectedModifierOptionId?: string | null;
      priceDeltaSnapshotCents: number;
    }>;
  }>;
};

type CloudPrntPrinter = {
  id: string;
  name: string | null;
  macAddress: string;
  isActive: boolean;
  lastSeenAt: string | null;
};

type AdminSoundWindow = Window & {
  __adminAudioContext?: AudioContext;
  __adminKeepAliveAudio?: HTMLAudioElement;
  __adminKeepAliveObjectUrl?: string;
};

type DayHours = {
  isClosed: boolean;
  open: string;
  close: string;
};

type StoreHoursPayload = Record<string, Array<{ open: string; close: string }>>;

const ET_TIMEZONE = "America/Toronto";

export default function AdminOrdersPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"CURRENT" | "PAST">("CURRENT");
  const [pastScope, setPastScope] = useState<"TODAY" | "ALL">("TODAY");
  const [pastPage, setPastPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number | null>(null);
  const [acceptingOrders, setAcceptingOrders] = useState<boolean | null>(null);
  const [storeHoursByDay, setStoreHoursByDay] = useState<Record<string, DayHours>>({});
  const [storeTimezone, setStoreTimezone] = useState("America/Toronto");
  const [statusNow, setStatusNow] = useState(() => new Date());
  const [prepSaveLoading, setPrepSaveLoading] = useState(false);
  const [autoPrintSaveLoading, setAutoPrintSaveLoading] = useState(false);
  const [prepSaveError, setPrepSaveError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [defaultAutoPrintPrinterId, setDefaultAutoPrintPrinterId] = useState("");
  const [cloudPrntPrinters, setCloudPrntPrinters] = useState<CloudPrntPrinter[]>([]);
  const [cloudPrntPrinterId, setCloudPrntPrinterId] = useState("");
  const [cloudPrntPrinterName, setCloudPrntPrinterName] = useState("");
  const [printBusyByOrderId, setPrintBusyByOrderId] = useState<Record<string, boolean>>({});
  const [printSentByOrderId, setPrintSentByOrderId] = useState<Record<string, string>>({});
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
  const PAST_PAGE_SIZE = 20;

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  function setLanguage(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setLang(next);
  }

  const t = {
    orders: lang === "zh" ? "訂單" : "Orders",
    currentOrders: lang === "zh" ? "目前訂單" : "Current Orders",
    pastOrders: lang === "zh" ? "過往訂單" : "Past Orders",
    enableSound: lang === "zh" ? "開啟聲音提示" : "Enable Sound Alerts",
    soundOn: lang === "zh" ? "聲音提示已啟用" : "Sound alerts enabled",
    autoPrint: lang === "zh" ? "自動打印" : "Auto Print",
    autoPrintOn: lang === "zh" ? "自動打印已啟用" : "Auto print enabled",
    autoPrintOff: lang === "zh" ? "自動打印已關閉" : "Auto print disabled",
    autoPrintPrinter: lang === "zh" ? "自動打印機" : "Auto-Print Printer",
    orderTime: lang === "zh" ? "備餐時間" : "Order Time",
    readyTime: lang === "zh" ? "出餐時間" : "Ready Time",
    current: lang === "zh" ? "目前" : "Current",
    today: lang === "zh" ? "今日" : "Today",
    allTime: lang === "zh" ? "全部" : "All Time",
    print: lang === "zh" ? "列印" : "Print",
    printKitchen: lang === "zh" ? "廚房列印" : "Print for Kitchen",
    created: lang === "zh" ? "下單時間" : "Created",
    pickup: lang === "zh" ? "取餐時間" : "Pickup",
    notes: lang === "zh" ? "備註" : "Notes",
    subtotal: lang === "zh" ? "小計" : "Subtotal",
    tax: lang === "zh" ? "稅項" : "Tax",
    total: lang === "zh" ? "總計" : "Total",
    noOrders: lang === "zh" ? "此分類目前沒有訂單。" : "No orders in this section.",
    analytics: lang === "zh" ? "分析" : "Analytics",
    menu: lang === "zh" ? "餐單" : "Menu",
    settings: lang === "zh" ? "設定" : "Settings",
    admin: "Admin",
    statusOpen: lang === "zh" ? "營業中，接受訂單" : "Store open, accepting orders",
    statusClosed: lang === "zh" ? "店舖已關閉，暫停接受訂單" : "Store closed, not accepting orders",
    statusOrderingOff:
      lang === "zh" ? "已手動暫停接單（不接受訂單）" : "Ordering turned off (not accepting orders)",
    cloudprntReady: lang === "zh" ? "CloudPRNT 已連接" : "CloudPRNT connected",
    cloudprntMissing: lang === "zh" ? "未找到 CloudPRNT 打印機" : "No CloudPRNT printer found",
    printerStatus: lang === "zh" ? "打印機狀態" : "Printer Status",
    printQueueFailed: lang === "zh" ? "加入打印隊列失敗。" : "Failed to queue print job.",
    sentToPrinter: lang === "zh" ? "已發送至打印機" : "Sent to Printer",
    autoPrintSaveFailed: lang === "zh" ? "更新自動打印設定失敗。" : "Failed to update auto print setting.",
    shiftControls: lang === "zh" ? "當值控制" : "Shift Controls",
    soundControl: lang === "zh" ? "聲音提醒" : "Sound Alerts",
    language: lang === "zh" ? "語言" : "Language",
    soundStatus: lang === "zh" ? "聲音提醒狀態" : "Sound Alert Status"
  };

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.settings) return;
      setPrepTimeMinutes(data.settings.prepTimeMinutes ?? null);
      setAcceptingOrders(Boolean(data.settings.acceptingOrders));
      setAutoPrintEnabled(Boolean(data.settings.autoPrintEnabled));
      setDefaultAutoPrintPrinterId(data.settings.defaultAutoPrintPrinterId ?? "");
      setStoreTimezone(data.settings.timezone ?? "America/Toronto");

      const incoming = (data.settings.storeHours ?? {}) as StoreHoursPayload;
      const normalized: Record<string, DayHours> = {};
      for (let i = 0; i < 7; i += 1) {
        const key = String(i);
        const window = incoming[key]?.[0];
        normalized[key] = window
          ? { isClosed: false, open: window.open, close: window.close }
          : { isClosed: true, open: "11:00", close: "21:00" };
      }
      setStoreHoursByDay(normalized);
    } catch {
      // no-op
    }
  }, []);

  const startSilentKeepAliveLoop = useCallback(async () => {
    try {
      const w = window as AdminSoundWindow;
      if (w.__adminKeepAliveAudio) {
        keepAliveAudioRef.current = w.__adminKeepAliveAudio;
      }
      if (w.__adminKeepAliveObjectUrl) {
        keepAliveObjectUrlRef.current = w.__adminKeepAliveObjectUrl;
      }

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
        w.__adminKeepAliveAudio = audio;
        w.__adminKeepAliveObjectUrl = objectUrl;
      }

      await keepAliveAudioRef.current.play();
      localStorage.setItem("admin_sound_enabled", "1");
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
      const w = window as AdminSoundWindow;
      if (!audioContextRef.current) {
        audioContextRef.current = w.__adminAudioContext ?? new Ctx();
        w.__adminAudioContext = audioContextRef.current;
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
    const totalDurationSeconds = 3.5;
    const cycleSeconds = 0.5;
    const cycles = Math.floor(totalDurationSeconds / cycleSeconds);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-10, now);
    limiter.knee.setValueAtTime(8, now);
    limiter.ratio.setValueAtTime(20, now);
    limiter.attack.setValueAtTime(0.002, now);
    limiter.release.setValueAtTime(0.08, now);
    limiter.connect(context.destination);

    for (let i = 0; i < cycles; i += 1) {
      const start = now + i * cycleSeconds;
      const gain = context.createGain();
      gain.connect(limiter);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.95, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      const osc1 = context.createOscillator();
      osc1.type = "square";
      osc1.frequency.setValueAtTime(880, start);
      osc1.connect(gain);
      osc1.start(start);
      osc1.stop(start + 0.11);

      const osc2 = context.createOscillator();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(1040, start + 0.11);
      osc2.connect(gain);
      osc2.start(start + 0.11);
      osc2.stop(start + 0.22);

      const osc3 = context.createOscillator();
      osc3.type = "sawtooth";
      osc3.frequency.setValueAtTime(1320, start + 0.04);
      osc3.connect(gain);
      osc3.start(start + 0.04);
      osc3.stop(start + 0.18);
    }

    window.setTimeout(() => {
      isAlertPlayingRef.current = false;
    }, totalDurationSeconds * 1000 + 100);
  }, [ensureAudioReady]);

  const queueCloudPrntPrint = useCallback(
    async (
      orderNumber: string,
      orderId: string,
      copyType: PrintCopyType,
      options?: {
        clearAttention?: boolean;
        showSentMessage?: boolean;
        suppressAlert?: boolean;
        source?: "AUTO" | "MANUAL";
      }
    ) => {
      if (!cloudPrntPrinterId) {
        if (!options?.suppressAlert) {
          alert(t.cloudprntMissing);
        }
        return false;
      }

      const clearAttention = options?.clearAttention ?? true;
      const showSentMessage = options?.showSentMessage ?? false;

      setPrintBusyByOrderId((prev) => ({ ...prev, [orderId]: true }));
      if (clearAttention) {
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
      }

      try {
        const res = await fetch("/api/admin/cloudprnt/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            printerId: cloudPrntPrinterId,
            orderId,
            orderNumber,
            copyType,
            source: options?.source ?? "MANUAL"
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? t.printQueueFailed);
        }
        if (showSentMessage) {
          setPrintSentByOrderId((prev) => ({ ...prev, [orderId]: t.sentToPrinter }));
          window.setTimeout(() => {
            setPrintSentByOrderId((prev) => {
              if (!prev[orderId]) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
          }, 2500);
        }
        return true;
      } catch (error) {
        if (!options?.suppressAlert) {
          alert(error instanceof Error ? error.message : t.printQueueFailed);
        }
        return false;
      } finally {
        setPrintBusyByOrderId((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }
    },
    [cloudPrntPrinterId, t.cloudprntMissing, t.printQueueFailed, t.sentToPrinter]
  );

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

  const loadCloudPrntPrinters = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cloudprnt/queue", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const printers = ((data?.printers ?? []) as CloudPrntPrinter[]).filter((printer) => printer.isActive);
      setCloudPrntPrinters(printers);
      if (!printers.length) {
        setCloudPrntPrinterId("");
        setCloudPrntPrinterName("");
        return;
      }

      const preferredId = defaultAutoPrintPrinterId || cloudPrntPrinterId;
      const preferred = preferredId ? printers.find((printer) => printer.id === preferredId) : null;
      if (preferred) {
        setCloudPrntPrinterId(preferred.id);
        setCloudPrntPrinterName(preferred.name ?? preferred.macAddress);
        return;
      }

      const sorted = [...printers].sort((a, b) => {
        const aSeen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bSeen = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bSeen - aSeen;
      });
      const fallbackPreferred = sorted[0];
      setCloudPrntPrinterId(fallbackPreferred.id);
      setCloudPrntPrinterName(fallbackPreferred.name ?? fallbackPreferred.macAddress);
    } catch {
      // no-op
    }
  }, [cloudPrntPrinterId, defaultAutoPrintPrinterId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadCloudPrntPrinters();
    const timer = window.setInterval(() => {
      void loadCloudPrntPrinters();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadCloudPrntPrinters]);

  useEffect(() => {
    void loadSettings();
    const timer = window.setInterval(() => {
      void loadSettings();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => setStatusNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const shouldAutoEnable = localStorage.getItem("admin_sound_enabled") === "1";
    if (shouldAutoEnable) {
      void ensureAudioReady().then(async (ready) => {
        if (ready) {
          await startSilentKeepAliveLoop();
        }
      });
    } else {
      void ensureAudioReady();
    }
    const unlock = async () => {
      const ready = await ensureAudioReady();
      if (ready) {
        await startSilentKeepAliveLoop();
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudioReady, startSilentKeepAliveLoop]);

  useEffect(() => {
    const prevHtmlOverflowX = document.documentElement.style.overflowX;
    const prevBodyOverflowX = document.body.style.overflowX;
    if (drawerOpen) {
      document.documentElement.style.overflowX = "hidden";
      document.body.style.overflowX = "hidden";
    } else {
      document.documentElement.style.overflowX = prevHtmlOverflowX;
      document.body.style.overflowX = prevBodyOverflowX;
    }
    return () => {
      document.documentElement.style.overflowX = prevHtmlOverflowX;
      document.body.style.overflowX = prevBodyOverflowX;
    };
  }, [drawerOpen]);

  useEffect(() => {
    return () => {
      // Keep audio loop/context alive across admin page navigation.
    };
  }, []);

  async function enableSoundAlerts() {
    const ready = await ensureAudioReady();
    if (!ready) return;
    await startSilentKeepAliveLoop();
  }

  async function setPrepTimeQuick(nextPrep: number) {
    if (acceptingOrders === null || Object.keys(storeHoursByDay).length === 0 || prepSaveLoading) return;
    setPrepSaveLoading(true);
    setPrepSaveError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepTimeMinutes: nextPrep,
          acceptingOrders,
          storeHoursByDay,
          autoPrintEnabled,
          defaultAutoPrintPrinterId: defaultAutoPrintPrinterId || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setPrepSaveError(data?.error ?? "Failed to update order time.");
        return;
      }
      setPrepTimeMinutes(nextPrep);
    } catch {
      setPrepSaveError("Failed to update order time.");
    } finally {
      setPrepSaveLoading(false);
    }
  }

  async function setAutoPrintGlobal(nextValue: boolean) {
    if (
      prepTimeMinutes === null ||
      acceptingOrders === null ||
      Object.keys(storeHoursByDay).length === 0 ||
      autoPrintSaveLoading
    ) {
      return;
    }
    setAutoPrintSaveLoading(true);
    setPrepSaveError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepTimeMinutes,
          acceptingOrders,
          storeHoursByDay,
          autoPrintEnabled: nextValue,
          defaultAutoPrintPrinterId: defaultAutoPrintPrinterId || null
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPrepSaveError(data?.error ?? t.autoPrintSaveFailed);
        return;
      }
      setAutoPrintEnabled(nextValue);
    } catch {
      setPrepSaveError(t.autoPrintSaveFailed);
    } finally {
      setAutoPrintSaveLoading(false);
    }
  }

  async function setAutoPrintPrinterGlobal(nextPrinterId: string) {
    if (
      prepTimeMinutes === null ||
      acceptingOrders === null ||
      Object.keys(storeHoursByDay).length === 0 ||
      autoPrintSaveLoading
    ) {
      return;
    }
    setAutoPrintSaveLoading(true);
    setPrepSaveError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepTimeMinutes,
          acceptingOrders,
          storeHoursByDay,
          autoPrintEnabled,
          defaultAutoPrintPrinterId: nextPrinterId || null
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPrepSaveError(data?.error ?? t.autoPrintSaveFailed);
        return;
      }
      setDefaultAutoPrintPrinterId(nextPrinterId);
      const selected = cloudPrntPrinters.find((printer) => printer.id === nextPrinterId);
      if (selected) {
        setCloudPrntPrinterId(selected.id);
        setCloudPrntPrinterName(selected.name ?? selected.macAddress);
      }
    } catch {
      setPrepSaveError(t.autoPrintSaveFailed);
    } finally {
      setAutoPrintSaveLoading(false);
    }
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
  const todayEt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const pastOrders = sorted.filter((order) => {
    const isPast = order.status === OrderStatus.PICKED_UP || order.status === OrderStatus.CANCELLED;
    if (!isPast) return false;
    if (pastScope === "ALL") return true;
    const orderDateEt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ET_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(order.createdAt));
    return orderDateEt === todayEt;
  });
  const totalPastPages = Math.max(1, Math.ceil(pastOrders.length / PAST_PAGE_SIZE));
  const safePastPage = Math.min(Math.max(1, pastPage), totalPastPages);
  const pagedPastOrders =
    pastScope === "ALL"
      ? pastOrders.slice((safePastPage - 1) * PAST_PAGE_SIZE, safePastPage * PAST_PAGE_SIZE)
      : pastOrders;
  const visibleOrders = tab === "CURRENT" ? currentOrders : pagedPastOrders;
  const storeHours: StoreHours = useMemo(() => {
    const out: StoreHours = {};
    for (let i = 0; i < 7; i += 1) {
      const key = String(i);
      const day = storeHoursByDay[key];
      if (!day || day.isClosed) {
        out[key] = [];
      } else {
        out[key] = [{ open: day.open, close: day.close }];
      }
    }
    return out;
  }, [storeHoursByDay]);
  const storeOrderState = useMemo(() => {
    if (acceptingOrders === null) return null;
    return getStoreOrderState(
      {
        acceptingOrders,
        timezone: storeTimezone,
        storeHours,
        closedDates: []
      },
      statusNow
    );
  }, [acceptingOrders, storeHours, storeTimezone, statusNow]);

  useEffect(() => {
    setPastPage(1);
  }, [pastScope]);

  useEffect(() => {
    if (pastPage > totalPastPages) {
      setPastPage(totalPastPages);
    }
  }, [pastPage, totalPastPages]);

  return (
    <>
      <div className="space-y-4 pb-8">
        <div className="flex w-full items-center justify-between pt-4">
        <Link
          href="/admin/orders"
          className="rounded border bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          {t.orders}
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          className="relative inline-flex h-9 w-9 items-center justify-center border"
          aria-label="Open admin menu"
        >
          <span
            className={`absolute h-0.5 w-5 bg-black transition-all duration-300 ${
              drawerOpen ? "translate-y-0 rotate-45" : "-translate-y-1.5"
            }`}
          />
          <span
            className={`absolute h-0.5 w-5 bg-black transition-all duration-300 ${
              drawerOpen ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute h-0.5 w-5 bg-black transition-all duration-300 ${
              drawerOpen ? "translate-y-0 -rotate-45" : "translate-y-1.5"
            }`}
          />
        </button>
      </div>
      <section className="space-y-4 rounded-xl border border-amber-900/20 bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {storeOrderState ? (
            <div
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                storeOrderState === "OPEN"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {storeOrderState === "OPEN"
                ? t.statusOpen
                : storeOrderState === "CLOSED"
                  ? t.statusClosed
                  : t.statusOrderingOff}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("CURRENT")}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              tab === "CURRENT" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
            }`}
          >
            {t.currentOrders}
          </button>
          <button
            type="button"
            onClick={() => setTab("PAST")}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
              tab === "PAST" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
            }`}
          >
            {t.pastOrders}
          </button>
        </div>

        {!soundEnabled ? (
          <div className="grid gap-2 sm:grid-cols-1">
            <button
              type="button"
              onClick={() => void enableSoundAlerts()}
              className="rounded border bg-white px-4 py-2 text-left text-sm font-semibold text-black"
            >
              {t.soundControl}: {t.enableSound}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t.readyTime}:</span>
          {[15, 30, 45, 60].map((minutes) => (
            <button
              key={minutes}
              type="button"
              disabled={prepSaveLoading}
              onClick={() => void setPrepTimeQuick(minutes)}
              className={`rounded-full border px-4 py-2 text-base font-semibold ${
                prepTimeMinutes === minutes ? "bg-[var(--brand)] text-white" : "bg-white text-black"
              } ${prepSaveLoading ? "opacity-60" : ""}`}
            >
              {minutes}
            </button>
          ))}
          {prepTimeMinutes ? (
            <span className="text-sm text-gray-600">
              {t.current}: {prepTimeMinutes} min
            </span>
          ) : null}
        </div>
      </section>
      {tab === "PAST" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPastScope("TODAY")}
            className={`rounded border px-4 py-2 text-sm font-semibold ${
              pastScope === "TODAY" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
            }`}
          >
            {t.today}
          </button>
          <button
            type="button"
            onClick={() => setPastScope("ALL")}
            className={`rounded border px-4 py-2 text-sm font-semibold ${
              pastScope === "ALL" ? "bg-[var(--brand)] text-white" : "bg-white text-black"
            }`}
          >
            {t.allTime}
          </button>
          {pastScope === "ALL" ? (
            <>
              <button
                type="button"
                onClick={() => setPastPage((p) => Math.max(1, p - 1))}
                disabled={safePastPage <= 1}
                className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {lang === "zh" ? "上一頁" : "Prev"}
              </button>
              <span className="text-sm">
                {lang === "zh"
                  ? `第 ${safePastPage} / ${totalPastPages} 頁`
                  : `Page ${safePastPage} / ${totalPastPages}`}
              </span>
              <button
                type="button"
                onClick={() => setPastPage((p) => Math.min(totalPastPages, p + 1))}
                disabled={safePastPage >= totalPastPages}
                className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {lang === "zh" ? "下一頁" : "Next"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {prepSaveError ? <p className="text-sm text-red-700">{prepSaveError}</p> : null}

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
                <div className="text-sm">{t.created} {fmtDateTime(order.createdAt)}</div>
                <div className="text-lg font-bold">
                  {t.pickup}:{" "}
                  {order.pickupType === "ASAP"
                    ? `ASAP ~ ${fmtTime(order.estimatedReadyTime)}`
                    : fmtDateTime(order.pickupTime as string)}
                </div>
                <div className="text-sm">
                  {order.customerName} | {order.phone}
                </div>
                {order.notes ? <div className="text-sm">{t.notes}: {order.notes}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    void queueCloudPrntPrint(order.orderNumber, order.id, PrintCopyType.FRONT, {
                      clearAttention: true,
                      showSentMessage: true
                    })
                  }
                  disabled={!cloudPrntPrinterId || Boolean(printBusyByOrderId[order.id])}
                  className="rounded bg-black px-4 py-2 text-lg font-semibold text-white disabled:opacity-50"
                >
                  {t.print}
                </button>
                <button
                  onClick={() =>
                    void queueCloudPrntPrint(order.orderNumber, order.id, PrintCopyType.KITCHEN, {
                      clearAttention: true,
                      showSentMessage: true
                    })
                  }
                  disabled={!cloudPrntPrinterId || Boolean(printBusyByOrderId[order.id])}
                  className="rounded border border-black px-4 py-2 text-lg font-semibold text-black disabled:opacity-50"
                >
                  {t.printKitchen}
                </button>
              </div>
            </div>
            {printSentByOrderId[order.id] ? (
              <div className="mt-2 text-sm font-semibold text-green-700">{printSentByOrderId[order.id]}</div>
            ) : null}

            <div className="mt-3 space-y-2 text-base">
              {order.lines.map((line) => (
                <div key={line.id}>
                  <div className="font-semibold">
                    {line.qty} x {localizeText(line.nameSnapshot, lang)}
                  </div>
                  {formatOrderSelectionsForDisplay({
                    selections: line.selections,
                    lang,
                    localize: (value) => localizeText(value, lang)
                  }).map((row) => (
                    <div
                      key={row.key}
                      className={`${row.indent ? "pl-8" : "pl-4"} text-sm text-gray-700`}
                    >
                      - {row.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {tab !== "CURRENT" ? (
              <div className="mt-3">
                <span className="rounded bg-amber-100 px-3 py-1 font-medium">{order.status}</span>
              </div>
            ) : null}

            <div className="mt-3 text-sm">
              {t.subtotal} {centsToCurrency(order.subtotalCents)} | {t.tax} {centsToCurrency(order.taxCents)} |
              {t.total} <strong>{centsToCurrency(order.totalCents)}</strong>
            </div>
          </article>
        </div>
      ))}

        {visibleOrders.length === 0 ? (
          <div className="rounded-xl bg-[var(--card)] p-4 shadow-sm">{t.noOrders}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setDrawerOpen(false)}
        className={`menu-backdrop fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-label="Close admin menu backdrop"
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[60] h-screen w-80 max-w-[88vw] overflow-y-auto overflow-x-hidden border-l border-[#c4a57444] bg-[#101113] px-5 pb-5 pt-4 text-[#f5f0e8] shadow-2xl transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="text-lg font-semibold">{t.admin}</div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center text-[#f5f0e8]"
            aria-label="Close admin menu"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6L18 18" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 text-base">
          <div className="rounded border border-[#c4a57433] p-3">
            <div className="mb-2 text-sm font-semibold">{t.language}</div>
            <div className="inline-flex overflow-hidden rounded-full border border-[#c4a574]">
              <button
                type="button"
                onClick={() => setLanguage("zh")}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  lang === "zh" ? "bg-[#c4a574] text-black" : "bg-white text-black"
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  lang === "en" ? "bg-[#c4a574] text-black" : "bg-white text-black"
                }`}
              >
                EN
              </button>
            </div>
          </div>
          <div className="rounded border border-[#c4a57433] p-3 text-sm">
            <div className="mb-1 font-semibold">{t.printerStatus}</div>
            <div className={cloudPrntPrinterId ? "text-green-300" : "text-red-300"}>
              {cloudPrntPrinterId
                ? `${t.cloudprntReady}: ${cloudPrntPrinterName || cloudPrntPrinterId}`
                : t.cloudprntMissing}
            </div>
          </div>
          {soundEnabled ? (
            <div className="rounded border border-[#c4a57433] p-3 text-sm">
              <div className="mb-1 font-semibold">{t.soundStatus}</div>
              <div className="text-green-300">{t.soundOn}</div>
            </div>
          ) : null}
          <div className="rounded border border-[#c4a57433] p-3 text-sm">
            <div className="mb-2 font-semibold">{t.autoPrint}</div>
            <label className="mb-2 block text-xs text-[#d6d0c8]">
              {t.autoPrintPrinter}
              <select
                value={defaultAutoPrintPrinterId}
                disabled={autoPrintSaveLoading || cloudPrntPrinters.length === 0}
                onChange={(e) => void setAutoPrintPrinterGlobal(e.target.value)}
                className="mt-1 w-full rounded border border-[#c4a57455] bg-[#16181b] px-2 py-2 text-sm text-[#f5f0e8] disabled:opacity-60"
              >
                <option value="">
                  {lang === "zh" ? "自動選擇（最近連線）" : "Auto-select (most recently seen)"}
                </option>
                {cloudPrntPrinters.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.name ?? printer.macAddress}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void setAutoPrintGlobal(!autoPrintEnabled)}
              disabled={
                autoPrintSaveLoading ||
                prepTimeMinutes === null ||
                acceptingOrders === null ||
                Object.keys(storeHoursByDay).length === 0
              }
              className={`w-full rounded border px-4 py-2 text-left text-sm font-semibold ${
                autoPrintEnabled
                  ? "border-green-700 bg-green-50 text-green-800"
                  : "border-gray-300 bg-white text-black"
              } disabled:opacity-60`}
            >
              {autoPrintEnabled ? t.autoPrintOn : t.autoPrintOff}
            </button>
          </div>
          <Link
            href="/admin/analytics"
            onClick={() => setDrawerOpen(false)}
            className="block border-b border-[#c4a57433] pb-2 hover:text-[#c4a574]"
          >
            {t.analytics}
          </Link>
          <Link
            href="/admin/menu"
            onClick={() => setDrawerOpen(false)}
            className="block border-b border-[#c4a57433] pb-2 hover:text-[#c4a574]"
          >
            {t.menu}
          </Link>
          <Link
            href="/admin/settings"
            onClick={() => setDrawerOpen(false)}
            className="block border-b border-[#c4a57433] pb-2 hover:text-[#c4a574]"
          >
            {t.settings}
          </Link>
        </div>
      </aside>
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
    </>
  );
}
