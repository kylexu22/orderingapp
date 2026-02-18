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
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    setLang(getClientLang());
    fetch("/api/account/session")
      .then((res) => res.json())
      .then((data) => {
        setLoggedIn(Boolean(data?.loggedIn));
        setCustomerName(data?.customer?.name ?? "");
      })
      .finally(() => setLoadingAccount(false));
  }, []);

  function setLanguage(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setLang(next);
    window.location.reload();
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", onDocClick);
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    setLoggedIn(false);
    setCustomerName("");
    setMenuOpen(false);
    window.location.href = "/menu";
  }

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
              {lang === "zh" ? `??? (${count})` : `Cart (${count})`}
            </Link>
          ) : null}
          {!isAdminRoute ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center border border-[#c4a574] text-[#f5f0e8]"
                aria-label="Open account menu"
              >
                <span className="text-lg leading-none">?</span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-56 border border-[#c4a57455] bg-[#111] p-3 text-[#f5f0e8] shadow-xl">
                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-[#c4a574]">
                      {lang === "zh" ? "??" : "Language"}
                    </div>
                    <div className="mt-1 inline-flex border border-[#c4a574]">
                      <button
                        type="button"
                        onClick={() => setLanguage("zh")}
                        className={`px-2 py-1 ${lang === "zh" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
                      >
                        ??
                      </button>
                      <button
                        type="button"
                        onClick={() => setLanguage("en")}
                        className={`px-2 py-1 ${lang === "en" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                  {!loadingAccount && loggedIn ? (
                    <div className="mb-3 border-b border-[#c4a57433] pb-2 text-sm">
                      {lang === "zh" ? "???:" : "Logged in:"} {customerName || "Customer"}
                    </div>
                  ) : null}
                  <div className="space-y-2 text-sm">
                    {loggedIn ? (
                      <>
                        <Link href="/profile" className="block hover:text-[#c4a574]" onClick={() => setMenuOpen(false)}>
                          {lang === "zh" ? "????" : "Profile"}
                        </Link>
                        <Link href="/orders" className="block hover:text-[#c4a574]" onClick={() => setMenuOpen(false)}>
                          {lang === "zh" ? "????" : "Order History"}
                        </Link>
                        <button type="button" onClick={logout} className="block w-full text-left hover:text-[#c4a574]">
                          {lang === "zh" ? "??" : "Log Out"}
                        </button>
                      </>
                    ) : (
                      <Link href="/login" className="block hover:text-[#c4a574]" onClick={() => setMenuOpen(false)}>
                        {lang === "zh" ? "??" : "Log In"}
                      </Link>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
