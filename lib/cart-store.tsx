"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CartLineInput } from "@/lib/types";

type CartState = {
  lines: CartLineInput[];
  addLine: (line: CartLineInput, message?: string) => void;
  updateQty: (index: number, qty: number) => void;
  removeLine: (index: number) => void;
  clear: () => void;
  toastMessage: string | null;
  clearToast: () => void;
};

const CartContext = createContext<CartState | null>(null);
const CART_KEY = "ordering_system_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLineInput[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CartLineInput[];
      setLines(parsed);
    } catch {
      window.localStorage.removeItem(CART_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  }, [lines]);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 1600);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      addLine: (line, message) => {
        setLines((prev) => [...prev, line]);
        setToastMessage(message ?? "Added to cart");
      },
      updateQty: (index, qty) =>
        setLines((prev) =>
          prev.map((line, i) => (i === index ? { ...line, qty: Math.max(1, qty) } : line))
        ),
      removeLine: (index) => setLines((prev) => prev.filter((_, i) => i !== index)),
      clear: () => setLines([]),
      toastMessage,
      clearToast: () => setToastMessage(null)
    }),
    [lines, toastMessage]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
