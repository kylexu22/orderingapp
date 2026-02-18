function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function normalizePhoneToE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    return `+${digits}`;
  }

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

async function twilioRequest(
  path: string,
  params: Record<string, string>
): Promise<Record<string, any>> {
  const accountSid = getRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = getRequiredEnv("TWILIO_AUTH_TOKEN");
  const serviceSid = getRequiredEnv("TWILIO_VERIFY_SERVICE_SID");

  const body = new URLSearchParams(params);
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${serviceSid}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );
  const json = (await res.json()) as Record<string, any>;
  if (!res.ok) {
    const message =
      typeof json?.message === "string" ? json.message : "Twilio Verify request failed.";
    throw new Error(message);
  }
  return json;
}

export async function sendVerifyCode(phoneE164: string): Promise<void> {
  await twilioRequest("Verifications", {
    To: phoneE164,
    Channel: "sms"
  });
}

export async function checkVerifyCode(phoneE164: string, code: string): Promise<boolean> {
  const json = await twilioRequest("VerificationCheck", {
    To: phoneE164,
    Code: code
  });
  return json?.status === "approved";
}

