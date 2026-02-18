"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useCart } from "@/lib/cart-store";
import { getClientLang, type Lang } from "@/lib/i18n";

const CODE_LENGTH = 6;

type VerifyStartResponse = {
  ok?: boolean;
  skipVerification?: boolean;
  error?: string;
};

type VerifyCheckResponse = {
  ok?: boolean;
  error?: string;
};

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
      const text = await res.text();
      let data: VerifyStartResponse = {};
      try {
        data = text ? (JSON.parse(text) as VerifyStartResponse) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "\u767c\u9001\u9a57\u8b49\u78bc\u5931\u6557\u3002" : "Failed to send code."));
        return;
      }
      if (data.skipVerification) {
        router.replace("/checkout");
        return;
      }
      setCodeSent(true);
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch {
      setError(lang === "zh" ? "\u7db2\u7d61\u932f\u8aa4\u3002" : "Network error.");
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
      const text = await res.text();
      let data: VerifyCheckResponse = {};
      try {
        data = text ? (JSON.parse(text) as VerifyCheckResponse) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        setError(data.error ?? (lang === "zh" ? "\u9a57\u8b49\u5931\u6557\u3002" : "Verification failed."));
        return;
      }
      router.replace("/checkout");
    } catch {
      setError(lang === "zh" ? "\u7db2\u7d61\u932f\u8aa4\u3002" : "Network error.");
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
        {lang === "zh" ? "\u2190 \u8fd4\u56de\u8cfc\u7269\u8eca" : "\u2190 Back to Cart"}
      </Link>
      <h1 className="text-2xl font-bold">{lang === "zh" ? "\u96fb\u8a71\u9a57\u8b49" : "Phone Verification"}</h1>

      <label className="block text-sm">
        {lang === "zh" ? "\u96fb\u8a71\u865f\u78bc" : "Phone Number"}
        <input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setCodeSent(false);
            setDigits(Array(CODE_LENGTH).fill(""));
          }}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder={lang === "zh" ? "\u4f8b\u5982 9057709236" : "e.g. 9057709236"}
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
            ? "\u767c\u9001\u4e2d..."
            : "Sending..."
          : lang === "zh"
            ? "\u9a57\u8b49\u4e26\u7e7c\u7e8c"
            : "Verify and Continue"}
      </button>

      {codeSent ? (
        <div className="space-y-3 rounded border border-amber-900/20 p-3">
          <div className="text-sm font-semibold">{lang === "zh" ? "\u8f38\u5165 6 \u4f4d\u9a57\u8b49\u78bc" : "Enter 6-digit code"}</div>
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
            {verifying
              ? lang === "zh"
                ? "\u9a57\u8b49\u4e2d..."
                : "Verifying..."
              : lang === "zh"
                ? "\u78ba\u8a8d\u9a57\u8b49\u78bc"
                : "Verify Code"}
          </button>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
