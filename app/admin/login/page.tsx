"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Login failed");
      setLoading(false);
      return;
    }
    router.push("/admin/orders");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md rounded-xl bg-[var(--card)] p-5 shadow-sm">
      <h1 className="text-xl font-semibold">Admin Login</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-3 w-full rounded border px-3 py-2"
        placeholder="Admin password"
      />
      {error ? <div className="mt-2 text-sm text-red-700">{error}</div> : null}
      <button
        onClick={submit}
        disabled={loading}
        className="mt-3 rounded bg-[var(--brand)] px-4 py-2 text-white"
      >
        {loading ? "Checking..." : "Sign in"}
      </button>
    </div>
  );
}
