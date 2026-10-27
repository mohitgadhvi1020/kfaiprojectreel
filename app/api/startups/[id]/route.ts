import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const startupId = params.id;

    const [startup, content, research] = await Promise.all([
      db.getStartupById(startupId),
      db.getContentByStartupId(startupId),
      db.getResearchByStartupId(startupId),
    ]);

    if (!startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    return NextResponse.json({
      startup: { ...startup, content_status: startup.content_status || "none" },
      content,
      research,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch startup details" },
      { status: 500 }
    );
  }
}
