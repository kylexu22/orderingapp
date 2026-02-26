"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import Image from "next/image";
import { getClientLang, type Lang } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type AccountSessionResponse = {
  loggedIn?: boolean;
  hasAccount?: boolean;
  customer?: { name?: string };
};

export function SiteHeader() {
  const { lines } = useCart();
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const [lang, setLang] = useState<Lang>("en");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(true);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const isCustomerRoute = !isAdminRoute;

  async function refreshAccountSession() {
    try {
      const res = await fetch("/api/account/session", { cache: "no-store" });
      const data = (await res.json()) as AccountSessionResponse;
      setLoggedIn(Boolean(data?.loggedIn));
      setHasAccount(Boolean(data?.hasAccount));
      setCustomerName(data?.customer?.name ?? "");
    } catch {
      setLoggedIn(false);
      setHasAccount(false);
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
    function onFocus() {
      void refreshAccountSession();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    setLoggedIn(false);
    setHasAccount(false);
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
    logout: lang === "zh" ? "\u767b\u51fa" : "Log Out",
    privacy: lang === "zh" ? "\u96b1\u79c1\u653f\u7b56" : "Privacy Policy"
  };

  const languageToggle = (
    <div className="inline-flex overflow-hidden rounded-full border border-[#c4a574]">
      <button
        type="button"
        onClick={() => setLanguage("zh")}
        className={`px-3 py-1.5 ${lang === "zh" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
      >
        {"\u4e2d\u6587"}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`px-3 py-1.5 ${lang === "en" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
      >
        EN
      </button>
    </div>
  );

  return (
    <header className="fixed left-0 right-0 top-0 z-40 border-b border-[#a67c5245] bg-[#1a1a1a]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        {isCustomerRoute ? (
          <div className="flex items-center gap-3 text-[#f5f0e8]">
            <Link href="/" className="inline-flex h-9 w-9 items-center justify-center text-2xl leading-none">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 fill-current"
              >
                <path d="M12 3.2 3 10.6v10.2h6.3v-6.2h5.4v6.2H21V10.6L12 3.2zm7.2 16H16V13h-8v6.2H4.8v-7.8l7.2-5.9 7.2 5.9v7.8z" />
              </svg>
            </Link>
            {languageToggle}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[#f5f0e8]">
            <Image
              src="/images/hongfarlogo.png"
              alt="Hong Far Cafe"
              width={42}
              height={24}
              className="h-7 w-auto"
            />
          </div>
        )}
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
            className={`menu-backdrop fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 ${
              drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-label="Close menu backdrop"
          />
          <aside
            ref={drawerRef}
            className={`fixed inset-y-0 right-0 z-[60] h-screen w-80 max-w-[88vw] overflow-y-auto overflow-x-hidden border-l border-[#c4a57444] bg-[#101113] p-5 text-[#f5f0e8] shadow-2xl transition-transform duration-300 ${
              drawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="mb-5 flex items-center justify-between">
                <div className="font-display-serif text-lg font-semibold">Hong Far Cafe</div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center text-[#f5f0e8]"
                  aria-label="Close menu"
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
              {!isCustomerRoute ? (
                <div className="mb-4">
                  <div className="mb-2 text-xs uppercase tracking-wide text-[#c4a574]">{t.language}</div>
                  {languageToggle}
                </div>
              ) : null}

              {!loadingAccount && loggedIn ? (
                <div className="mb-4 border-b border-[#c4a57433] pb-3 text-sm">
                  {t.loggedIn} {customerName || "Customer"}
                </div>
              ) : null}

              <div className="space-y-3 text-base">
                {loggedIn ? (
                  <>
                    {hasAccount ? (
                      <>
                        <Link href="/profile" onClick={() => setDrawerOpen(false)} className="block hover:text-[#c4a574]">
                          {t.profile}
                        </Link>
                        <Link href="/orders" onClick={() => setDrawerOpen(false)} className="block hover:text-[#c4a574]">
                          {t.orderHistory}
                        </Link>
                      </>
                    ) : null}
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
              <div className="mt-auto pt-6">
                <Link
                  href="/privacy"
                  onClick={() => setDrawerOpen(false)}
                  className="block border-t border-[#c4a57433] pt-3 text-sm hover:text-[#c4a574]"
                >
                  {t.privacy}
                </Link>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </header>
  );
}
