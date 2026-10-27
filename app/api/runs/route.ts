import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { runDiscovery } from "@/lib/research";
import { getActiveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const data = await db.getRuns(limit);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch runs" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const settings = await getActiveSettings();

    if (!settings.perplexity_api_key) {
      return NextResponse.json(
        { error: "Perplexity API key not configured. Go to Settings." },
        { status: 400 }
      );
    }

    const run = await db.createRun();

    performDiscovery(run.id, settings).catch((err) => {
      console.error("Discovery failed:", err);
      db.updateRun(run.id, { status: "failed" });
    });

    return NextResponse.json(run);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create run" },
      { status: 500 }
    );
  }
}

async function performDiscovery(runId: string, settings: any) {
  try {
    // Fetch existing names FIRST so we can both (a) hand them to Perplexity
    // as a "do NOT return these" list, and (b) post-filter duplicates.
    const existingNames = await db.getAllStartupNames();

    const results = await runDiscovery(
      settings.perplexity_api_key,
      Array.from(existingNames) as string[]
    );

    let insertedStartups = 0;
    for (const startup of results.startups) {
      if (startup.name && existingNames.has(startup.name.toLowerCase())) continue;
      const ok = await db.insertStartup({
        ...startup,
        run_id: runId,
        discovered_at: new Date().toISOString(),
        is_used: false,
        reel_created: false,
        content_status: "none",
      });
      if (ok) insertedStartups++;
    }

    let insertedTips = 0;
    for (const tip of results.xTips) {
      const ok = await db.insertXTip({
        ...tip,
        run_id: runId,
        discovered_at: new Date().toISOString(),
        is_used: false,
      });
      if (ok) insertedTips++;
    }

    let insertedTrending = 0;
    for (const topic of results.trending) {
      const ok = await db.insertTrending({
        ...topic,
        run_id: runId,
        discovered_at: new Date().toISOString(),
      });
      if (ok) insertedTrending++;
    }

    await db.updateRun(runId, {
      status: "ready",
      startups_found: insertedStartups,
      x_tips_found: insertedTips,
      trending_found: insertedTrending,
      raw_startups: results.rawStartups,
      raw_x_builders: results.rawXBuilders,
      raw_trending: results.rawTrending,
    });
  } catch (error: any) {
    console.error("Discovery error:", error);
    await db.updateRun(runId, {
      status: "failed",
      raw_startups: `ERROR: ${error?.message || String(error)}`,
    });
    throw error;
  }
}
