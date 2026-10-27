/**
 * POST /api/monitor/:id/generate-dialogue
 *
 * Turns a monitored YouTube/Instagram item into a 2-character dialogue video.
 * We reuse the existing /api/video/generate pipeline (dialogue script →
 * ElevenLabs voices → Remotion render with character avatars + subtitles +
 * background video). This route's only job is to:
 *   1. Load the monitored item
 *   2. Compile its transcript/summary/insights into a "topic" prompt
 *   3. Forward to /api/video/generate and persist the returned jobId on the
 *      monitored_content row so the UI can show status & the download URL.
 *
 * Body: { characterSetId: string, targetDuration?: number, backgroundVideoPath?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getMonitoredContentById, updateMonitoredContent } from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";
import { analyzeInstagramContent } from "@/lib/content-analyzer";
import { generateHooksAndOpener } from "@/lib/hooks-opener";
import { fetchInstagramPostByUrl } from "@/lib/instagram-monitor";
import {
  buildInstagramRawText,
  transcribeInstagramMedia,
} from "@/lib/instagram-transcriber";

function safe(s: any): string {
  if (s == null) return "";
  if (Array.isArray(s)) return s.filter(Boolean).join("\n- ");
  return String(s);
}

const APIFY_BACKFILL_LOG = path.join(process.cwd(), ".data", "apify-backfills.json");
const MAX_APIFY_BACKFILLS_PER_DAY = Number(process.env.APIFY_IG_BACKFILLS_PER_DAY || 20);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readBackfillLog(): Record<string, Array<{ itemId: string; url: string; at: string }>> {
  if (!fs.existsSync(APIFY_BACKFILL_LOG)) return {};
  try {
    return JSON.parse(fs.readFileSync(APIFY_BACKFILL_LOG, "utf-8"));
  } catch {
    return {};
  }
}

function recordBackfillAttempt(itemId: string, url: string): void {
  const log = readBackfillLog();
  const key = todayKey();
  log[key] = log[key] || [];
  log[key].push({ itemId, url, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(APIFY_BACKFILL_LOG), { recursive: true });
  fs.writeFileSync(APIFY_BACKFILL_LOG, JSON.stringify(log, null, 2));
}

function canUseApifyBackfill(): boolean {
  const attemptsToday = readBackfillLog()[todayKey()] || [];
  return attemptsToday.length < MAX_APIFY_BACKFILLS_PER_DAY;
}

function buildTopic(item: any): string {
  // Compile a source-adaptation brief for the dialogue generator. The original
  // monitored content is the source of truth; summary/insights are only a map.
  const title = safe(item.title);
  const summary = safe(item.summary);
  const insights = safe(item.key_insights);
  const tools = safe(item.tools_mentioned);
  const topics = safe(item.topics);
  const originalContent = safe(item.raw_text).slice(0, 50000);

  const parts: string[] = [];
  parts.push("SOURCE ADAPTATION MODE: Turn the original content below into a dialogue reel. Preserve the original meaning, claims, examples, and order. Lightly rewrite for spoken flow only.");
  if (item.source) parts.push(`SOURCE TYPE: ${safe(item.source)}`);
  if (title) parts.push(`TITLE: ${title}`);
  if (originalContent) parts.push(`ORIGINAL CONTENT:\n${originalContent}`);
  if (summary) parts.push(`SUMMARY:\n${summary}`);
  if (insights) parts.push(`KEY INSIGHTS:\n- ${insights}`);
  if (tools) parts.push(`TOOLS/FRAMEWORKS: ${tools}`);
  if (topics) parts.push(`TOPICS: ${topics}`);

  return parts.join("\n\n");
}

async function maybeBackfillInstagramTranscript(item: any): Promise<any> {
  if (item.source !== "instagram") return item;
  if (safe(item.raw_text).includes("SPOKEN TRANSCRIPT:")) return item;

  const settings = await getActiveSettings();
  if (!settings.openai_api_key || !settings.apify_api_key || !item.url) {
    return item;
  }
  if (!canUseApifyBackfill()) {
    console.warn(
      `[monitor-dialogue] Apify backfill daily guard reached (${MAX_APIFY_BACKFILLS_PER_DAY})`
    );
    return item;
  }

  recordBackfillAttempt(item.id, item.url);
  console.log(`[monitor-dialogue] Apify backfill attempt for ${item.id}`);
  const post = await fetchInstagramPostByUrl(item.url, settings.apify_api_key);
  if (!post?.mediaUrl) {
    console.warn(`[monitor-dialogue] no Instagram video URL found for ${item.id}`);
    return item;
  }

  const spokenTranscript = await transcribeInstagramMedia(
    post.mediaUrl,
    settings.openai_api_key
  );
  if (!spokenTranscript.trim()) return item;

  const caption = post.caption || safe(item.raw_text);
  const rawText = buildInstagramRawText(caption, spokenTranscript);
  const analysis = await analyzeInstagramContent(
    rawText,
    post.ownerUsername || item.source_channel_name || "instagram",
    settings.openai_api_key
  );

  const updates = {
    raw_text: rawText,
    summary: analysis.summary,
    topics: analysis.topics,
    tools_mentioned: analysis.tools_mentioned,
    content_ideas: analysis.content_ideas,
    key_insights: analysis.key_insights,
    content_type: analysis.content_type,
  };
  await updateMonitoredContent(item.id, updates);
  console.log(
    `[monitor-dialogue] backfilled Instagram transcript for ${item.id} (${spokenTranscript.length} chars)`
  );

  return { ...item, ...updates };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      characterSetId,
      targetDuration = 60,
      backgroundVideoPath = "backgrounds/bg-short.mp4",
    } = body;

    if (!characterSetId) {
      return NextResponse.json(
        { error: "characterSetId is required (e.g. 'got', 'tech-bros', 'family-guy')" },
        { status: 400 }
      );
    }

    const item: any = await getMonitoredContentById(params.id);
    if (!item) {
      return NextResponse.json({ error: "Monitored item not found" }, { status: 404 });
    }

    const enrichedItem = await maybeBackfillInstagramTranscript(item);
    const topic = buildTopic(enrichedItem);
    if (!topic.trim()) {
      return NextResponse.json(
        { error: "This item has no usable content to build a dialogue from." },
        { status: 400 }
      );
    }

    // Forward to the existing /api/video/generate pipeline internally. We use
    // an absolute URL built from the incoming request so this works in any
    // deployment (localhost, Vercel preview, prod).
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/video/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        characterSetId,
        targetDuration,
        backgroundVideoPath,
        generationMode: "source_adaptation",
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Video pipeline failed to start" },
        { status: res.status }
      );
    }

    // Persist the job ref on the monitored_content row so the UI can poll.
    await updateMonitoredContent(params.id, {
      dialogue_video_job_id: data.jobId,
      dialogue_video_status: data.status || "generating_script",
      dialogue_video_url: null, // reset any prior download URL
      dialogue_video_character_set: characterSetId,
      dialogue_video_started_at: new Date().toISOString(),
      // Mark the item as reviewed so the monitor list reflects activity.
      status: item.status === "new" ? "reviewed" : item.status,
    });

    // Best-effort: generate viral hooks + an AI cold-open clip from the same
    // source so the dialogue card shows them alongside the video. This is
    // non-critical — never let it fail the dialogue job. Skip if already present
    // (e.g. produced earlier by the reel-script flow) to avoid duplicate cost.
    let hooksResult: Awaited<ReturnType<typeof generateHooksAndOpener>> | null = null;
    if (!enrichedItem.generated_hooks) {
      try {
        const settings = await getActiveSettings();
        hooksResult = await generateHooksAndOpener(enrichedItem, settings.openai_api_key);
        await updateMonitoredContent(params.id, {
          generated_hooks: hooksResult.hooks,
          opener_clip_concept: hooksResult.openerConcept,
          opener_clip_veo_prompt: hooksResult.veoPrompt,
          opener_clip_higgsfield_prompt: hooksResult.higgsfieldPrompt,
        });
      } catch (e: any) {
        console.warn("[monitor-dialogue] hooks/opener generation skipped:", e?.message || e);
      }
    }

    return NextResponse.json({
      success: true,
      jobId: data.jobId,
      status: data.status,
      hooks: hooksResult?.hooks ?? enrichedItem.generated_hooks ?? "",
      openerConcept: hooksResult?.openerConcept ?? enrichedItem.opener_clip_concept ?? "",
      veoPrompt: hooksResult?.veoPrompt ?? enrichedItem.opener_clip_veo_prompt ?? "",
      higgsfieldPrompt:
        hooksResult?.higgsfieldPrompt ?? enrichedItem.opener_clip_higgsfield_prompt ?? "",
    });
  } catch (err: any) {
    console.error("[monitor-dialogue] failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start dialogue video generation" },
      { status: 500 }
    );
  }
}
