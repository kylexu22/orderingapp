"use client";

import { useEffect } from "react";
import { MENU_SCROLL_KEY } from "@/components/menu-scroll-state";

export function MenuScrollRestore() {
  useEffect(() => {
    const saved = sessionStorage.getItem(MENU_SCROLL_KEY);
    if (!saved) return;

    const y = Number(saved);
    sessionStorage.removeItem(MENU_SCROLL_KEY);
    if (!Number.isFinite(y) || y < 0) return;

    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  }, []);

  return null;
}

