import { NextRequest, NextResponse } from "next/server";
import { getCloudPrntQuietHoursConfig, isWithinCloudPrntQuietHours } from "@/lib/cloudprnt-quiet-hours";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const CLOUDPRNT_DISABLED_ENV_KEY = "CLOUDPRNT_API_DISABLED";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getProjectIdentifier() {
  return (
    process.env.VERCEL_PROJECT_ID_OR_NAME ??
    process.env.VERCEL_PROJECT_ID ??
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID ??
    ""
  ).trim();
}

function getVercelApiQuery() {
  const params = new URLSearchParams();
  const teamId = (process.env.VERCEL_TEAM_ID ?? process.env.VERCEL_ORG_ID ?? "").trim();
  const slug = (process.env.VERCEL_TEAM_SLUG ?? "").trim();
  if (teamId) params.set("teamId", teamId);
  if (slug) params.set("slug", slug);
  return params.toString();
}

async function updateCloudPrntDisabledEnv(value: "0" | "1") {
  const accessToken = process.env.VERCEL_ACCESS_TOKEN;
  const projectIdOrName = getProjectIdentifier();
  if (!accessToken || !projectIdOrName) {
    throw new Error("Missing Vercel project configuration.");
  }

  const query = new URLSearchParams();
  query.set("upsert", "true");
  const scopeQuery = getVercelApiQuery();
  if (scopeQuery) {
    for (const [key, nextValue] of new URLSearchParams(scopeQuery).entries()) {
      query.set(key, nextValue);
    }
  }

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/env?${query.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        key: CLOUDPRNT_DISABLED_ENV_KEY,
        value,
        type: "plain",
        target: ["production"],
        comment: "Managed automatically by /api/cron/cloudprnt-availability"
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update Vercel env (${response.status}).`);
  }
}

async function triggerRedeploy() {
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!deployHookUrl) {
    throw new Error("Missing VERCEL_DEPLOY_HOOK_URL.");
  }

  const response = await fetch(deployHookUrl, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to trigger deploy hook (${response.status}).`);
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return unauthorized();
  }

  try {
    const desiredDisabled = isWithinCloudPrntQuietHours();
    const currentDisabled = process.env[CLOUDPRNT_DISABLED_ENV_KEY] === "1";
    const quietHours = getCloudPrntQuietHoursConfig();

    if (desiredDisabled === currentDisabled) {
      return NextResponse.json({
        ok: true,
        changed: false,
        desiredDisabled,
        currentDisabled,
        quietHours
      });
    }

    await updateCloudPrntDisabledEnv(desiredDisabled ? "1" : "0");
    await triggerRedeploy();

    return NextResponse.json({
      ok: true,
      changed: true,
      desiredDisabled,
      previousDisabled: currentDisabled,
      quietHours
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync CloudPRNT availability."
      },
      { status: 500 }
    );
  }
}
