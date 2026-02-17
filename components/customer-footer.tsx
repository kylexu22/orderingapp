"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getClientLang, type Lang } from "@/lib/i18n";

export function CustomerFooter() {
  const pathname = usePathname() ?? "";
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="mt-10 border-t border-[#a67c5245] bg-[#1a1a1a] text-[#f5f0e8]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 text-center">
        <Image
          src="/images/hongfarlogo.png"
          alt="Hong Far Cafe logo"
          width={170}
          height={98}
          className="mx-auto mb-3 h-auto w-[min(170px,58vw)]"
        />
        <p className="font-['var(--font-noto-serif-sc)'] text-lg tracking-wide">Hong Far Cafe</p>
        <p className="text-sm opacity-90">9425 Leslie St, Richmond Hill, ON</p>
        <p className="text-sm opacity-90">
          <Link href="tel:+19057709236" className="text-[#c4a574]">
            (905) 770-9236
          </Link>
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.08em] opacity-75">
          {lang === "zh" ? "版權所有 2026 HONG FAR H.K. CAFE INC." : "Copyright 2026 HONG FAR H.K. CAFE INC."}
        </p>
      </div>
    </footer>
  );
}
