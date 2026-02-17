"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import Image from "next/image";

export function SiteHeader() {
  const { lines } = useCart();
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

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
          <Link href="/cart" className="rounded bg-[var(--brand)] px-3 py-1.5 text-white">
            Cart ({count})
          </Link>
          <Link href="/admin/orders" className="text-[#c4a574] underline">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
