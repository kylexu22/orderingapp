"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CustomerFooter } from "@/components/customer-footer";
import { CartToast } from "@/components/cart-toast";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <>
      {!isLanding ? <SiteHeader /> : null}
      <main className={isLanding ? "" : "mx-auto w-full max-w-6xl px-4 pb-4 pt-20"}>{children}</main>
      {!isLanding ? <CustomerFooter /> : null}
      {!isLanding ? <CartToast /> : null}
    </>
  );
}
