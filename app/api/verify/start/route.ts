import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizePhoneToE164, sendVerifyCode } from "@/lib/twilio-verify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({
  phone: z.string().min(1)
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const phoneE164 = normalizePhoneToE164(parsed.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Invalid phone number format." }, { status: 400 });
  }

  const rate = checkRateLimit(`verify:start:${ip}:${phoneE164}`, 5, 10 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${rate.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  try {
    await sendVerifyCode(phoneE164);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send verification code." },
      { status: 400 }
    );
  }
}

