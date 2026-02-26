import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthedRequest } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = isAuthedRequest(req);

  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi = pathname.startsWith("/api/orders") && req.method !== "POST";
  const isAdminEntry = pathname === "/admin" || pathname === "/admin/login";

  if (authed && isAdminEntry) {
    const url = new URL("/admin/orders", req.url);
    return NextResponse.redirect(url);
  }

  if ((isAdminPage || isAdminApi) && !authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/admin/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/orders/:path*"]
};
