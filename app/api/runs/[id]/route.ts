import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const runId = params.id;

    const [run, startups, xTips, trending, content, research] =
      await Promise.all([
        db.getRunById(runId),
        db.getStartupsByRunId(runId),
        db.getXTipsByRunId(runId),
        db.getTrendingByRunId(runId),
        db.getContentByRunId(runId),
        db.getResearchByRunId(runId),
      ]);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({
      run,
      startups,
      xTips,
      trending,
      content,
      research,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch run details" },
      { status: 500 }
    );
  }
}
