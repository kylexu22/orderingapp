import { NextRequest } from "next/server";

export const ADMIN_COOKIE = "admin_session";

export function isAdminPasswordValid(password: string): boolean {
  return password.length > 0 && password === (process.env.ADMIN_PASSWORD ?? "");
}

export function getExpectedAdminCookieValue(): string {
  return `v1:${process.env.ADMIN_PASSWORD ?? ""}`;
}

export function isAuthedRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return cookie === getExpectedAdminCookieValue();
}
