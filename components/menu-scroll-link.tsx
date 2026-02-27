"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { MENU_SCROLL_KEY } from "@/components/menu-scroll-state";

type MenuScrollLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function MenuScrollLink({ href, className, children }: MenuScrollLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        sessionStorage.setItem(MENU_SCROLL_KEY, String(window.scrollY));
      }}
    >
      {children}
    </Link>
  );
}

