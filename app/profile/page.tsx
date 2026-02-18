"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientLang, type Lang } from "@/lib/i18n";

export default function ProfilePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLang(getClientLang());
    fetch("/api/account/profile")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data?.customer) return;
        setName(data.customer.name ?? "");
        setEmail(data.customer.email ?? "");
        setPhone(data.customer.phone ?? "");
      })
      .catch(() => setError(lang === "zh" ? "載入失敗。" : "Failed to load profile."));
  }, [lang, router]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "儲存失敗。" : "Failed to save."));
        return;
      }
      setMessage(lang === "zh" ? "已儲存。" : "Saved.");
    } catch {
      setError(lang === "zh" ? "網絡錯誤。" : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold">{lang === "zh" ? "個人資料" : "Profile"}</h1>
      <label className="block text-sm">
        {lang === "zh" ? "姓名" : "Name"}
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="block text-sm">
        {lang === "zh" ? "電郵（選填）" : "Email (optional)"}
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
      </label>
      <label className="block text-sm">
        {lang === "zh" ? "電話" : "Phone"}
        <input value={phone} readOnly className="mt-1 w-full rounded border bg-gray-100 px-3 py-2" />
      </label>
      <button type="button" onClick={save} disabled={saving} className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50">
        {saving ? (lang === "zh" ? "儲存中..." : "Saving...") : lang === "zh" ? "儲存" : "Save"}
      </button>
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      {message ? <div className="text-sm text-green-700">{message}</div> : null}
    </div>
  );
}

