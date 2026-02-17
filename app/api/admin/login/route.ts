import { NextResponse } from "next/server";
import { ADMIN_COOKIE, getExpectedAdminCookieValue, isAdminPasswordValid } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json();
  const password = String(body?.password ?? "");
  if (!isAdminPasswordValid(password)) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, getExpectedAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  return res;
}
