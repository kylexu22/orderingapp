"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getClientLang, type Lang } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLang(getClientLang());
    fetch("/api/account/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.loggedIn) router.replace("/menu");
      })
      .catch(() => undefined);
  }, [router]);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "登入失敗。" : "Login failed."));
        return;
      }
      router.push("/menu");
    } catch {
      setError(lang === "zh" ? "網絡錯誤。" : "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold">{lang === "zh" ? "登入" : "Log In"}</h1>
      <label className="block text-sm">
        {lang === "zh" ? "電話號碼" : "Phone Number"}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={loading || !phone.trim()}
        className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? (lang === "zh" ? "登入中..." : "Signing in...") : lang === "zh" ? "登入" : "Log In"}
      </button>
      <p className="text-sm text-gray-600">
        {lang === "zh"
          ? "若此裝置尚未驗證，請先完成電話驗證。"
          : "If this device is not trusted yet, please verify your phone first."}{" "}
        <Link href="/verify" className="underline">
          {lang === "zh" ? "前往驗證" : "Go to verify"}
        </Link>
      </p>
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
