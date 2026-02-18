"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useCart } from "@/lib/cart-store";
import { getClientLang, type Lang } from "@/lib/i18n";

const CODE_LENGTH = 6;

export default function VerifyPage() {
  const router = useRouter();
  const { lines } = useCart();
  const [lang, setLang] = useState<Lang>("en");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  useEffect(() => {
    if (!lines.length) {
      router.replace("/cart");
      return;
    }
    fetch("/api/verify/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.verified) {
          router.replace("/checkout");
        }
      })
      .catch(() => undefined);
  }, [lines.length, router]);

  const code = useMemo(() => digits.join(""), [digits]);

  async function sendCode() {
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/verify/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "發送驗證碼失敗。" : "Failed to send code."));
        return;
      }
      setCodeSent(true);
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch {
      setError(lang === "zh" ? "網絡錯誤。" : "Network error.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (code.length !== CODE_LENGTH) return;
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "驗證失敗。" : "Verification failed."));
        return;
      }
      router.replace("/checkout");
    } catch {
      setError(lang === "zh" ? "網絡錯誤。" : "Network error.");
    } finally {
      setVerifying(false);
    }
  }

  function onCodeChange(index: number, value: string) {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = cleaned.slice(-1);
      return next;
    });
    if (index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function onCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function onCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        next[i] = pasted[i] ?? "";
      }
      return next;
    });
    const lastIndex = Math.min(pasted.length, CODE_LENGTH) - 1;
    if (lastIndex >= 0) inputRefs.current[lastIndex]?.focus();
  }

  if (!lines.length) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 border border-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white"
      >
        {lang === "zh" ? "← 返回購物車" : "← Back to Cart"}
      </Link>
      <h1 className="text-2xl font-bold">{lang === "zh" ? "電話驗證" : "Phone Verification"}</h1>

      <label className="block text-sm">
        {lang === "zh" ? "電話號碼" : "Phone Number"}
        <input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setCodeSent(false);
            setDigits(Array(CODE_LENGTH).fill(""));
          }}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder={lang === "zh" ? "例如 9057709236" : "e.g. 9057709236"}
        />
      </label>

      <button
        type="button"
        onClick={sendCode}
        disabled={sending || !phone.trim()}
        className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
      >
        {sending
          ? lang === "zh"
            ? "發送中..."
            : "Sending..."
          : lang === "zh"
            ? "發送驗證碼"
            : "Send Verification Code"}
      </button>

      {codeSent ? (
        <div className="space-y-3 rounded border border-amber-900/20 p-3">
          <div className="text-sm font-semibold">{lang === "zh" ? "輸入 6 位驗證碼" : "Enter 6-digit code"}</div>
          <div className="flex gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                value={digit}
                onChange={(e) => onCodeChange(index, e.target.value)}
                onKeyDown={(e) => onCodeKeyDown(index, e)}
                onPaste={onCodePaste}
                inputMode="numeric"
                maxLength={1}
                className="h-12 w-10 rounded border text-center text-lg font-semibold"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={verifyCode}
            disabled={verifying || code.length !== CODE_LENGTH}
            className="rounded bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
          >
            {verifying ? (lang === "zh" ? "驗證中..." : "Verifying...") : lang === "zh" ? "確認驗證碼" : "Verify Code"}
          </button>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
