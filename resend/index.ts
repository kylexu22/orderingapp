export type SendEmailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
};

type SendEmailResponse = {
  id: string;
};

type ResendApiError = {
  message: string;
  name?: string;
};

export class Resend {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? "";
  }

  emails = {
    send: async (payload: SendEmailPayload): Promise<{ data: SendEmailResponse | null; error: ResendApiError | null }> => {
      if (!this.apiKey) {
        return {
          data: null,
          error: { message: "Missing Resend API key." }
        };
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const json = (await res.json()) as { id?: string; message?: string; name?: string };

        if (!res.ok || !json.id) {
          return {
            data: null,
            error: {
              message: json.message ?? "Failed to send email via Resend.",
              name: json.name
            }
          };
        }

        return {
          data: { id: json.id },
          error: null
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: error instanceof Error ? error.message : "Unknown email transport error."
          }
        };
      }
    }
  };
}
