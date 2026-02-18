"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import Image from "next/image";
import { getClientLang, type Lang } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const { lines } = useCart();
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const [lang, setLang] = useState<Lang>("en");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(true);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  async function refreshAccountSession() {
    try {
      const res = await fetch("/api/account/session", { cache: "no-store" });
      const data = await res.json();
      setLoggedIn(Boolean(data?.loggedIn));
      setCustomerName(data?.customer?.name ?? "");
    } catch {
      setLoggedIn(false);
      setCustomerName("");
    } finally {
      setLoadingAccount(false);
    }
  }

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  useEffect(() => {
    void refreshAccountSession();
  }, [pathname]);

  function setLanguage(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setLang(next);
    window.location.reload();
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!drawerRef.current) return;
      if (!drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    }
    if (drawerOpen) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [drawerOpen]);

  useEffect(() => {
    function onFocus() {
      void refreshAccountSession();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    setLoggedIn(false);
    setCustomerName("");
    setDrawerOpen(false);
    window.location.href = "/menu";
  }

  const t = {
    cart: lang === "zh" ? `\u8cfc\u7269\u8eca (${count})` : `Cart (${count})`,
    language: lang === "zh" ? "\u8a9e\u8a00" : "Language",
    loggedIn: lang === "zh" ? "\u5df2\u767b\u5165\uff1a" : "Logged in:",
    profile: lang === "zh" ? "\u500b\u4eba\u8cc7\u6599" : "Profile",
    orderHistory: lang === "zh" ? "\u8a02\u55ae\u8a18\u9304" : "Order History",
    login: lang === "zh" ? "\u767b\u5165" : "Log In",
    logout: lang === "zh" ? "\u767b\u51fa" : "Log Out"
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#a67c5245] bg-[#1a1a1a]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-[#f5f0e8]">
          <Image
            src="/images/hongfarlogo.png"
            alt="Hong Far Cafe"
            width={42}
            height={24}
            className="h-7 w-auto"
          />
          <span className="font-['var(--font-noto-serif-sc)'] text-sm tracking-wide sm:text-base">
            Hong Far Cafe
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm text-[#f5f0e8]">
          {!isAdminRoute ? (
            <Link href="/cart" className="rounded bg-[var(--brand)] px-3 py-1.5 text-white">
              {t.cart}
            </Link>
          ) : null}
          {!isAdminRoute ? (
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="relative inline-flex h-9 w-9 items-center justify-center"
              aria-label="Open account menu"
            >
              <span
                className={`absolute h-0.5 w-5 bg-[#f5f0e8] transition-all duration-300 ${
                  drawerOpen ? "translate-y-0 rotate-45" : "-translate-y-1.5"
                }`}
              />
              <span
                className={`absolute h-0.5 w-5 bg-[#f5f0e8] transition-all duration-300 ${
                  drawerOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute h-0.5 w-5 bg-[#f5f0e8] transition-all duration-300 ${
                  drawerOpen ? "translate-y-0 -rotate-45" : "translate-y-1.5"
                }`}
              />
            </button>
          ) : null}
        </nav>
      </div>
      {!isAdminRoute ? (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 ${
              drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-label="Close menu backdrop"
          />
          <aside
            ref={drawerRef}
            className={`fixed right-0 top-0 z-50 h-screen w-80 max-w-[88vw] border-l border-[#c4a57444] bg-[#101113] p-5 text-[#f5f0e8] shadow-2xl transition-transform duration-300 ${
              drawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="text-lg font-semibold">Hong Far</div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-2xl leading-none text-[#f5f0e8]"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-[#c4a574]">{t.language}</div>
              <div className="inline-flex border border-[#c4a574]">
                <button
                  type="button"
                  onClick={() => setLanguage("zh")}
                  className={`px-3 py-1.5 ${lang === "zh" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
                >
                  中文
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`px-3 py-1.5 ${lang === "en" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
                >
                  EN
                </button>
              </div>
            </div>

            {!loadingAccount && loggedIn ? (
              <div className="mb-4 border-b border-[#c4a57433] pb-3 text-sm">
                {t.loggedIn} {customerName || "Customer"}
              </div>
            ) : null}

            <div className="space-y-3 text-base">
              {loggedIn ? (
                <>
                  <Link href="/profile" onClick={() => setDrawerOpen(false)} className="block hover:text-[#c4a574]">
                    {t.profile}
                  </Link>
                  <Link href="/orders" onClick={() => setDrawerOpen(false)} className="block hover:text-[#c4a574]">
                    {t.orderHistory}
                  </Link>
                  <button type="button" onClick={logout} className="block w-full text-left hover:text-[#c4a574]">
                    {t.logout}
                  </button>
                </>
              ) : (
                <Link href="/login" onClick={() => setDrawerOpen(false)} className="block hover:text-[#c4a574]">
                  {t.login}
                </Link>
              )}
            </div>
          </aside>
        </>
      ) : null}
    </header>
  );
}
