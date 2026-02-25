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
  retryAfterSeconds?: number;
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
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
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

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = setInterval(() => {
      setRetryAfterSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  const t = {
    titleLogin: lang === "zh" ? "登入 / 註冊" : "Log In / Sign Up",
    titleCode: lang === "zh" ? "6 位數驗證碼" : "6 Digit Code",
    mobilePlaceholder: lang === "zh" ? "手機號碼" : "Mobile Number",
    consentPrefix: lang === "zh" ? "登入即表示你同意" : "By logging in, I agree to the",
    terms: lang === "zh" ? "服務條款" : "Terms of Service",
    privacy: lang === "zh" ? "隱私政策" : "Privacy Policy",
    and: lang === "zh" ? "及" : "&",
    working: lang === "zh" ? "處理中..." : "Working...",
    continue: lang === "zh" ? "繼續" : "Continue",
    sentCodeTo: lang === "zh" ? "我們已發送驗證碼至" : "We've sent a code to",
    didntGetCode: lang === "zh" ? "未收到驗證碼？" : "Didn't get a code?",
    clickToResend: lang === "zh" ? "點擊重發" : "Click to Resend",
    resend: lang === "zh" ? "重發" : "Resend",
    back: lang === "zh" ? "返回" : "Back",
    verifyCode: lang === "zh" ? "驗證" : "Verify Code",
    verifying: lang === "zh" ? "驗證中..." : "Verifying...",
    close: lang === "zh" ? "關閉" : "Close",
    startVerifyFailed: lang === "zh" ? "無法開始驗證。" : "Failed to start verification.",
    verifyFailed: lang === "zh" ? "驗證失敗。" : "Verification failed.",
    networkError: lang === "zh" ? "網路錯誤。" : "Network error."
  };

  function afterLoginRedirect() {
    router.replace(lines.length ? "/checkout" : "/menu");
  }

  async function startLoginOrVerify() {
    setError("");
    if (retryAfterSeconds > 0) return;
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
        if (typeof data.retryAfterSeconds === "number" && data.retryAfterSeconds > 0) {
          setRetryAfterSeconds(data.retryAfterSeconds);
        }
        setError(data.error ?? t.startVerifyFailed);
        return;
      }
      if (data.skipVerification) {
        afterLoginRedirect();
        return;
      }
      setCodeSent(true);
      setRetryAfterSeconds(60);
      setDigits(Array(CODE_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch {
      setError(t.networkError);
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
        setError(data.error ?? t.verifyFailed);
        return;
      }
      afterLoginRedirect();
    } catch {
      setError(t.networkError);
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
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4 py-6">
      <div className="menu-food-card w-full max-w-xl border border-amber-900/20 bg-[var(--card)] p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-end">
          <Link
            href={lines.length ? "/cart" : "/menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/85 text-white"
            aria-label={t.close}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
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

        {!codeSent ? (
          <div className="space-y-5">
            <h1 className="text-center text-4xl font-bold tracking-tight">{t.titleLogin}</h1>
            <label className="block text-sm">
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setDigits(Array(CODE_LENGTH).fill(""));
                  setRetryAfterSeconds(0);
                }}
                className="w-full border border-black/10 bg-white px-4 py-3 text-xl placeholder:text-black/45 sm:text-2xl"
                placeholder={t.mobilePlaceholder}
              />
            </label>

            <label className="flex items-start gap-3 text-sm text-black/65">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-5 w-5"
              />
              <span>
                {t.consentPrefix}{" "}
                <Link href="/terms" className="underline">
                  {t.terms}
                </Link>{" "}
                {t.and}{" "}
                <Link href="/privacy" className="underline">
                  {t.privacy}
                </Link>
              </span>
            </label>

            <button
              type="button"
              onClick={startLoginOrVerify}
              disabled={sending || !phone.trim() || !agreed || retryAfterSeconds > 0}
              className="w-full bg-[var(--brand)] px-4 py-3 text-xl font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/35"
            >
              {sending ? t.working : retryAfterSeconds > 0 ? `${t.continue} (${retryAfterSeconds}s)` : t.continue}
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center space-y-5 rounded-2xl bg-transparent p-5 text-center">
            <h1 className="text-4xl font-bold tracking-tight">{t.titleCode}</h1>
            <p className="text-lg text-black/70">
              {t.sentCodeTo} <span className="font-semibold text-black/70">{phone}</span>
            </p>
            <div className="grid w-full max-w-sm grid-cols-6 gap-2 sm:gap-3">
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
                  className="h-14 w-full min-w-0 border border-amber-900/20 bg-white text-center text-2xl font-semibold text-[var(--ink)] sm:h-16"
                  style={{ borderRadius: 0 }}
                />
              ))}
            </div>
            <p className="text-base text-black/70">
              {t.didntGetCode}{" "}
              <button
                type="button"
                onClick={startLoginOrVerify}
                disabled={sending || retryAfterSeconds > 0}
                className="font-semibold text-[var(--brand)] underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retryAfterSeconds > 0 ? `${t.resend} (${retryAfterSeconds}s)` : t.clickToResend}
              </button>
            </p>
            <div className="grid w-full grid-row-2 gap-3 pt-1">
              <button
                type="button"
                onClick={verifyCode}
                disabled={verifying || code.length !== CODE_LENGTH}
                className="bg-[var(--brand)] px-4 py-3 text-lg font-bold uppercase tracking-wide text-white disabled:opacity-50"
              >
                {verifying ? t.verifying : t.verifyCode}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setDigits(Array(CODE_LENGTH).fill(""));
                  setRetryAfterSeconds(0);
                }}
                className="bg-transparent border border-black/20 px-4 py-3 text-lg font-bold uppercase tracking-wide text-grey"
              >
                {t.back}
              </button>
            </div>
          </div>
        )}

        {error ? <div className="mt-4 text-sm text-red-700">{error}</div> : null}
      </div>
    </div>
  );
}
