import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "200");
    const data = await db.getStartups(limit);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch startups" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, reel_created } = await request.json();
    if (!id || typeof reel_created !== "boolean") {
      return NextResponse.json(
        { error: "id and reel_created (boolean) are required" },
        { status: 400 }
      );
    }
    await db.updateStartup(id, { reel_created });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update startup" },
      { status: 500 }
    );
  }
}
