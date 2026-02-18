import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedCustomerFromRequest } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).optional().or(z.literal(""))
});

export async function GET(req: Request) {
  const customer = await getAuthenticatedCustomerFromRequest(req);
  if (!customer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ customer });
}

export async function PATCH(req: Request) {
  const customer = await getAuthenticatedCustomerFromRequest(req);
  if (!customer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof updateSchema>;
  try {
    parsed = updateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: parsed.name,
      email: parsed.email ? parsed.email : null
    },
    select: { id: true, phone: true, name: true, email: true }
  });
  return NextResponse.json({ customer: updated });
}

