import { prisma } from "@/lib/prisma";
import { getCustomerIdFromCookieHeader } from "@/lib/customer-session";

export async function getAuthenticatedCustomerFromRequest(req: Request) {
  const customerId = getCustomerIdFromCookieHeader(req.headers.get("cookie"));
  if (!customerId) return null;
  return prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, name: true, email: true }
  });
}

