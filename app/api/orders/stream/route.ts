import { addSseClient, removeSseClient } from "@/lib/sse";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let clientId = "";
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const id = crypto.randomUUID();
      clientId = id;
      addSseClient({
        id,
        send: (chunk) => controller.enqueue(encoder.encode(chunk))
      });
      controller.enqueue(encoder.encode(`event: connected\ndata: ok\n\n`));

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
      }, 15_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (clientId) removeSseClient(clientId);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
