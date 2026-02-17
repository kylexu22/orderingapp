"use client";

import { useCart } from "@/lib/cart-store";

export function CartToast() {
  const { toastMessage } = useCart();
  return (
    <div
      className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-lg bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 ${
        toastMessage ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {toastMessage ?? ""}
    </div>
  );
}
