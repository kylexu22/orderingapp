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
      const html = document.documentElement;
      const body = document.body;
      const prevHtmlBehavior = html.style.scrollBehavior;
      const prevBodyBehavior = body.style.scrollBehavior;

      html.style.scrollBehavior = "auto";
      body.style.scrollBehavior = "auto";
      window.scrollTo(0, y);

      requestAnimationFrame(() => {
        html.style.scrollBehavior = prevHtmlBehavior;
        body.style.scrollBehavior = prevBodyBehavior;
      });
    });
  }, []);

  return null;
}
