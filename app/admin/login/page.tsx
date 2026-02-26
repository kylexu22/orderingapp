"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="relative mt-3">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border py-2 pl-3 pr-12"
          placeholder="Admin password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-600 hover:text-black"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6A3 3 0 0013.4 13.4" />
              <path d="M9.9 5.1A9.8 9.8 0 0112 5c6 0 9.8 7 9.8 7a17.2 17.2 0 01-4.1 4.8" />
              <path d="M6.2 6.2A17 17 0 002.2 12s3.8 7 9.8 7a9.7 9.7 0 004.1-.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M2.2 12S6 5 12 5s9.8 7 9.8 7-3.8 7-9.8 7-9.8-7-9.8-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
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
