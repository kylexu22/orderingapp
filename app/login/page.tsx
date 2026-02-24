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

export default function LoginPage() {
  const router = useRouter();
  const { lines } = useCart();
  const [lang, setLang] = useState<Lang>("en");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setLang(getClientLang());
  }, []);

  useEffect(() => {
    fetch("/api/account/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.loggedIn) {
          router.replace(lines.length ? "/checkout" : "/menu");
        }
      })
      .catch(() => undefined);
  }, [lines.length, router]);

  const code = useMemo(() => digits.join(""), [digits]);

  function afterLoginRedirect() {
    router.replace(lines.length ? "/checkout" : "/menu");
  }

  async function startLoginOrVerify() {
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
        setError(data.error ?? (lang === "zh" ? "???????" : "Failed to start verification."));
        return;
      }
      if (data.skipVerification) {
        afterLoginRedirect();
        return;
      }
      setCodeSent(true);
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch {
      setError(lang === "zh" ? "?????" : "Network error.");
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
        setError(data.error ?? (lang === "zh" ? "?????" : "Verification failed."));
        return;
      }
      afterLoginRedirect();
    } catch {
      setError(lang === "zh" ? "?????" : "Network error.");
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
    if (index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
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
      for (let i = 0; i < CODE_LENGTH; i += 1) next[i] = pasted[i] ?? "";
      return next;
    });
    const last = Math.min(pasted.length, CODE_LENGTH) - 1;
    if (last >= 0) inputRefs.current[last]?.focus();
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Log In / Sign Up</h1>
          <Link
            href={lines.length ? "/cart" : "/menu"}
            className="inline-flex h-10 w-10 items-center justify-center text-black/80"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6L18 18" />
              <path d="M18 6L6 18" />
            </svg>
          </Link>
        </div>

        <label className="block text-sm">
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setCodeSent(false);
              setDigits(Array(CODE_LENGTH).fill(""));
            }}
            className="w-full border border-black/10 bg-white px-4 py-3 text-2xl placeholder:text-black/45"
            placeholder="Mobile Number"
          />
        </label>

        {!codeSent ? (
          <label className="flex items-start gap-3 text-sm text-black/65">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            <span>
              By logging in, I agree to the{" "}
              <Link href="/terms" className="underline">
                Terms of Service
              </Link>{" "}
              &{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
            </span>
          </label>
        ) : null}

        <button
          type="button"
          onClick={startLoginOrVerify}
          disabled={sending || !phone.trim() || !agreed}
          className="w-full bg-[var(--brand)] px-4 py-3 text-xl font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/35"
        >
          {sending ? "Working..." : "Continue"}
        </button>

        {codeSent ? (
          <div className="space-y-3 border border-amber-900/20 bg-white p-3">
            <div className="text-sm font-semibold">{lang === "zh" ? "?? 6 ????" : "Enter 6-digit code"}</div>
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
                  className="h-12 w-10 border text-center text-lg font-semibold"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={verifyCode}
              disabled={verifying || code.length !== CODE_LENGTH}
              className="bg-[var(--brand)] px-4 py-2 text-white disabled:opacity-50"
            >
              {verifying ? (lang === "zh" ? "???..." : "Verifying...") : lang === "zh" ? "?????" : "Verify Code"}
            </button>
          </div>
        ) : null}

        {error ? <div className="text-sm text-red-700">{error}</div> : null}
      </div>
    </div>
  );
}
