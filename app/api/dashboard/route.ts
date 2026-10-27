import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [startups, xTips, runs, allContent] = await Promise.all([
      db.getStartups(200),
      db.getAllXTips(200),
      db.getRuns(10),
      db.getAllContent(500),
    ]);

    const contentByStartup = new Map<string, any[]>();
    const contentByXTip = new Map<string, any[]>();
    for (const c of allContent) {
      if (c.startup_id) {
        if (!contentByStartup.has(c.startup_id)) contentByStartup.set(c.startup_id, []);
        contentByStartup.get(c.startup_id)!.push(c);
      }
      if (c.x_tip_id) {
        if (!contentByXTip.has(c.x_tip_id)) contentByXTip.set(c.x_tip_id, []);
        contentByXTip.get(c.x_tip_id)!.push(c);
      }
    }

    const enrichedStartups = startups.map((s: any) => ({
      ...s,
      content_status: s.content_status || "none",
      has_content: contentByStartup.has(s.id),
      content_count: contentByStartup.get(s.id)?.length || 0,
      quality_score: contentByStartup.get(s.id)?.[0]?.quality_score || null,
    }));

    const enrichedXTips = xTips.map((t: any) => ({
      ...t,
      has_content: contentByXTip.has(t.id),
      content_count: contentByXTip.get(t.id)?.length || 0,
      quality_score: contentByXTip.get(t.id)?.[0]?.quality_score || null,
    }));

    const stats = {
      total_startups: startups.length,
      total_x_tips: xTips.length,
      content_ready: enrichedStartups.filter((s: any) => s.content_status === "completed" || s.has_content).length
        + enrichedXTips.filter((t: any) => t.has_content).length,
      reels_created: enrichedStartups.filter((s: any) => s.reel_created).length,
      pending: enrichedStartups.filter((s: any) => s.content_status === "none" && !s.has_content && !s.reel_created).length
        + enrichedXTips.filter((t: any) => !t.has_content && !t.is_used).length,
      in_progress: enrichedStartups.filter((s: any) =>
        ["researching", "generating", "hooks", "scripting", "refining"].includes(s.content_status)
      ).length,
    };

    return NextResponse.json({
      startups: enrichedStartups,
      xTips: enrichedXTips,
      runs,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
