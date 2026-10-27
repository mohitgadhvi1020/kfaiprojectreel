/**
 * POST /api/monitor/:id/extract-hook-clip
 *
 * Downloads the monitored item's source Instagram reel, finds the most
 * scroll-stopping ~3-second moment via timestamped transcription, cuts that
 * segment with ffmpeg, and saves it to /public/hooks/<id>.mp4 so it can be used
 * as the video's cold-open hook. The clip path + chosen window are persisted on
 * the monitored_content row.
 */

import { NextResponse } from "next/server";
import { getMonitoredContentById, updateMonitoredContent } from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";
import { extractHookClip } from "@/lib/hook-clip";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const item: any = await getMonitoredContentById(params.id);
    if (!item) {
      return NextResponse.json({ error: "Monitored item not found" }, { status: 404 });
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key is required (used to find the best moment via transcription)." },
        { status: 400 }
      );
    }

    const result = await extractHookClip(item, settings.openai_api_key);

    await updateMonitoredContent(params.id, {
      hook_clip_path: result.clipPath,
      hook_clip_start: result.start,
      hook_clip_end: result.end,
      hook_clip_quote: result.quote,
      hook_clip_reason: result.reason,
      hook_clip_generated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[extract-hook-clip] failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to extract hook clip from the source reel." },
      { status: 500 }
    );
  }
}
