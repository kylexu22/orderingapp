"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { CustomerFooter } from "@/components/customer-footer";
import { CartToast } from "@/components/cart-toast";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isAdminRoute = pathname.startsWith("/admin");
  const showHeader = !isLanding && !isAdminRoute;
  const mainClassName = isLanding
    ? ""
    : `mx-auto w-full max-w-6xl px-4 pb-4 ${showHeader ? "pt-20" : "pt-0"}`;

  return (
    <>
      {showHeader ? <SiteHeader /> : null}
      <main className={mainClassName}>{children}</main>
      {!isLanding ? <CustomerFooter /> : null}
      {!isLanding ? <CartToast /> : null}
    </>
  );
}
