import { NextResponse } from "next/server";
import { getMenuData } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getMenuData();
  return NextResponse.json(data);
}
