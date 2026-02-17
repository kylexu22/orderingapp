import { OrderStreamEvent } from "@/lib/types";

type Client = {
  id: string;
  send: (payload: string) => void;
};

declare global {
  // eslint-disable-next-line no-var
  var orderSseClients: Client[] | undefined;
}

function getClients() {
  if (!global.orderSseClients) {
    global.orderSseClients = [];
  }
  return global.orderSseClients;
}

export function addSseClient(client: Client) {
  getClients().push(client);
}

export function removeSseClient(id: string) {
  global.orderSseClients = getClients().filter((c) => c.id !== id);
}

export function broadcastOrderEvent(event: OrderStreamEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  for (const client of getClients()) {
    try {
      client.send(payload);
    } catch {
      removeSseClient(client.id);
    }
  }
}
