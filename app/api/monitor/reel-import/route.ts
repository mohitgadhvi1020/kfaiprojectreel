/**
 * POST /api/monitor/reel-import
 *
 * Import a single Instagram reel/post by URL.
 *
 * Primary method: yt-dlp (free, no API key, fetches exact post).
 * Fallback: Apify (if yt-dlp is not installed).
 *
 * After fetching metadata, transcribes the video audio with Whisper,
 * analyzes the content, and inserts it into monitored_content — ready
 * for dialogue generation.
 *
 * Body: { url: string }
 * Returns: the created monitored_content item
 */

import { NextRequest, NextResponse } from "next/server";
import { insertMonitoredContent, getMonitoredContentUrls } from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";
import { fetchInstagramReelViaYtdlp } from "@/lib/instagram-ytdlp";
import { fetchInstagramPostByUrl } from "@/lib/instagram-monitor";
import {
  buildInstagramRawText,
  transcribeInstagramMedia,
} from "@/lib/instagram-transcriber";
import { analyzeInstagramContent } from "@/lib/content-analyzer";

/**
 * Extract the Instagram shortcode from any post URL form.
 * /reel/<code>/, /reels/<code>/, /p/<code>/ and /tv/<code>/ all point at the
 * same post and share the same shortcode — so it's the reliable dedup key.
 */
function extractIgShortcode(u: string): string | null {
  if (!u) return null;
  const m = u.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Instagram reel/post URL is required" },
        { status: 400 }
      );
    }

    // Basic URL validation
    const isInstagramUrl =
      url.includes("instagram.com/") || url.includes("instagr.am/");
    if (!isInstagramUrl) {
      return NextResponse.json(
        { error: "Please provide a valid Instagram URL (instagram.com/reel/... or instagram.com/p/...)" },
        { status: 400 }
      );
    }

    // Check for duplicates before doing any expensive work
    let cleanCheckUrl = url.trim();
    try {
      const parsed = new URL(cleanCheckUrl);
      if (parsed.hostname.includes("instagram.com")) {
        cleanCheckUrl = `https://www.instagram.com${parsed.pathname}`;
      }
    } catch {}
    const existingUrls = await getMonitoredContentUrls();
    // Instagram serves the SAME post under multiple path forms (/reel/<code>/,
    // /p/<code>/, /tv/<code>/). A plain URL compare misses these, so we dedup on
    // the shortcode, which is identical across all forms. This must catch it
    // here — otherwise the duplicate only surfaces as a raw DB unique-constraint
    // (23505) error after ~20s of fetching + transcription.
    const pastedCode = extractIgShortcode(url);
    const existingCodes = new Set(
      Array.from(existingUrls)
        .map(extractIgShortcode)
        .filter((c): c is string => !!c)
    );
    if (
      existingUrls.has(cleanCheckUrl) ||
      existingUrls.has(url.trim()) ||
      (pastedCode && existingCodes.has(pastedCode))
    ) {
      return NextResponse.json(
        { error: "This reel has already been imported. Check your monitored items below." },
        { status: 409 }
      );
    }

    const settings = await getActiveSettings();

    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key is required for transcription & analysis. Set it in Settings." },
        { status: 400 }
      );
    }

    // ── 1. Fetch post metadata ──
    // Primary: yt-dlp (free, no API key, fetches exact post)
    // Fallback: Apify (if yt-dlp fails or isn't installed)
    console.log(`[reel-import] Fetching Instagram post: ${url}`);

    let caption = "";
    let videoUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let username = "unknown";
    let postUrl = url;
    let publishedAt = new Date().toISOString();

    const ytdlpResult = await fetchInstagramReelViaYtdlp(url);

    if (ytdlpResult) {
      console.log(`[reel-import] yt-dlp succeeded for @${ytdlpResult.username}`);
      caption = ytdlpResult.caption;
      videoUrl = ytdlpResult.videoUrl;
      thumbnailUrl = ytdlpResult.thumbnailUrl;
      username = ytdlpResult.username;
      postUrl = ytdlpResult.url;
      publishedAt = ytdlpResult.published;
    } else if (settings.apify_api_key) {
      // Fallback to Apify
      console.log(`[reel-import] yt-dlp failed, falling back to Apify...`);
      const apifyResult = await fetchInstagramPostByUrl(url, settings.apify_api_key);

      if (apifyResult) {
        caption = apifyResult.caption;
        videoUrl = apifyResult.mediaUrl;
        thumbnailUrl = apifyResult.thumbnailUrl;
        username = apifyResult.ownerUsername || "unknown";
        postUrl = apifyResult.url;
        publishedAt = apifyResult.published;
      }
    }

    if (!caption && !videoUrl) {
      return NextResponse.json(
        {
          error:
            "Could not fetch this Instagram post. Make sure yt-dlp is installed (`brew install yt-dlp`) or set an Apify API key in Settings.",
        },
        { status: 404 }
      );
    }

    // ── 2. Transcribe video audio (if video exists) ──
    // Pass the original Instagram URL so yt-dlp can download audio properly
    // (Instagram serves split audio/video streams — direct URLs are video-only).
    let spokenTranscript = "";
    if (videoUrl || postUrl.includes("instagram.com/")) {
      console.log(`[reel-import] Transcribing video audio...`);
      try {
        spokenTranscript = await transcribeInstagramMedia(
          videoUrl,
          settings.openai_api_key,
          postUrl
        );
        console.log(
          `[reel-import] Transcription complete: ${spokenTranscript.length} chars`
        );
      } catch (err: any) {
        console.warn(
          `[reel-import] Transcription failed (continuing with caption only): ${err.message}`
        );
      }
    }

    // ── 3. Build combined raw text ──
    const rawText = buildInstagramRawText(caption, spokenTranscript);

    // ── 4. Analyze the content ──
    let analysis = {
      summary: `Reel by @${username}`,
      topics: [] as string[],
      tools_mentioned: [] as string[],
      content_ideas: [] as string[],
      key_insights: [] as string[],
      content_type: "reel" as string,
    };

    if (rawText.length > 10) {
      console.log(`[reel-import] Analyzing content...`);
      analysis = await analyzeInstagramContent(
        rawText,
        username,
        settings.openai_api_key
      );
    }

    // ── 5. Insert into monitored_content ──
    // Safety net: the fetcher may return a canonical postUrl in a different form
    // (/p/ vs /reel/) than what the user pasted, so a duplicate can still slip
    // past the early check. Catch the unique-constraint violation and return a
    // clean 409 instead of leaking a raw Postgres 23505 error to the UI.
    let item: any;
    try {
      item = await insertMonitoredContent({
        source: "instagram",
        source_channel_id: username,
        source_channel_name: `@${username}`,
        title: caption.substring(0, 120) || `Reel by @${username}`,
        url: postUrl,
        thumbnail: thumbnailUrl,
        published_at: publishedAt,
        raw_text: rawText,
        summary: analysis.summary,
        topics: analysis.topics,
        tools_mentioned: analysis.tools_mentioned,
        content_ideas: analysis.content_ideas,
        key_insights: analysis.key_insights,
        content_type: analysis.content_type || "reel",
        status: "new",
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      const isDuplicate =
        err?.code === "23505" ||
        /duplicate key|unique constraint/i.test(String(err?.message || err));
      if (isDuplicate) {
        return NextResponse.json(
          { error: "This reel has already been imported. Check your monitored items below." },
          { status: 409 }
        );
      }
      throw err;
    }

    console.log(
      `[reel-import] Successfully imported reel from @${username} (id: ${item?.id})`
    );

    return NextResponse.json({
      success: true,
      item,
      hasTranscript: !!spokenTranscript,
      method: ytdlpResult ? "yt-dlp" : "apify",
    });
  } catch (err: any) {
    console.error("[reel-import] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to import Instagram reel" },
      { status: 500 }
    );
  }
}
