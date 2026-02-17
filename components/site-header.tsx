"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import Image from "next/image";
import { getClientLang, type Lang } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const { lines } = useCart();
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const [lang, setLang] = useState<Lang>("en");
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  function setLanguage(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    setLang(next);
    window.location.reload();
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
        <nav className="flex items-center gap-4 text-sm text-[#f5f0e8]">
          <div className="inline-flex border border-[#c4a574]">
            <button
              type="button"
              onClick={() => setLanguage("zh")}
              className={`px-2 py-1 ${lang === "zh" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-2 py-1 ${lang === "en" ? "bg-[#c4a574] text-black" : "text-[#f5f0e8]"}`}
            >
              EN
            </button>
          </div>
          {!isAdminRoute ? (
            <Link href="/cart" className="rounded bg-[var(--brand)] px-3 py-1.5 text-white">
              {lang === "zh" ? `購物車 (${count})` : `Cart (${count})`}
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
