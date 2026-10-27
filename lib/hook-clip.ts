/**
 * Extract a short "hook" clip from a source Instagram reel.
 *
 * Pipeline:
 *   1. Download the full reel video (video+audio) via yt-dlp, with an Apify
 *      media-URL fallback.
 *   2. Transcribe with Whisper verbose_json to get timestamped segments.
 *   3. Ask the LLM to pick the single most scroll-stopping ~2-4s moment.
 *   4. Cut that segment with ffmpeg into public/hooks/<id>.mp4.
 *
 * The resulting clip is meant to be used as the cold-open of the dialogue/reel
 * video — real footage from the source instead of an AI-generated b-roll.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { callVertex } from "@/lib/vertex-client";
import { callOpenAIImpl } from "@/lib/content-generator";
import { fetchInstagramPostByUrl } from "@/lib/instagram-monitor";
import { getActiveSettings } from "@/lib/settings";

const execFileAsync = promisify(execFile);

export interface HookClipResult {
  /** Web path under /public, e.g. "/hooks/<id>.mp4" */
  clipPath: string;
  start: number;
  end: number;
  quote: string;
  reason: string;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

/** Download the full reel (video+audio) as an mp4 via yt-dlp. */
async function downloadVideoViaYtdlp(instagramUrl: string, outputPath: string): Promise<boolean> {
  try {
    await execFileAsync(
      "yt-dlp",
      [
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "--no-warnings",
        "-o",
        outputPath,
        instagramUrl,
      ],
      { timeout: 90_000 }
    );
    return fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
  } catch (err: any) {
    console.warn(`[hook-clip] yt-dlp video download failed: ${String(err?.message).slice(0, 150)}`);
    return false;
  }
}

/** Fallback: download a direct media URL (Apify provides video+audio mp4). */
async function downloadDirect(url: string, filePath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return false;
    fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
    return fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

/** Whisper transcription with per-segment timestamps. */
async function transcribeWithTimestamps(
  videoPath: string,
  openaiKey: string
): Promise<{ duration: number; segments: Segment[] }> {
  // Extract a compact mono audio track for Whisper.
  const audioPath = videoPath.replace(/\.[^.]+$/, "") + ".m4a";
  await execFileAsync("ffmpeg", [
    "-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath,
  ]);

  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(audioPath)]), "audio.m4a");
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Whisper API error (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data: any = await res.json();
  const segments: Segment[] = Array.isArray(data.segments)
    ? data.segments.map((s: any) => ({ start: s.start, end: s.end, text: String(s.text || "").trim() }))
    : [];
  return { duration: Number(data.duration) || 0, segments };
}

async function pickHookMoment(
  segments: Segment[],
  duration: number,
  openaiKey?: string
): Promise<{ start: number; end: number; quote: string; reason: string }> {
  // Fallback if no segments / no LLM: use the opening of the reel.
  const fallback = {
    start: 0,
    end: Math.min(3.5, duration || 3.5),
    quote: segments[0]?.text || "",
    reason: "Opening of the reel (no timestamped transcript available).",
  };
  if (!segments.length) return fallback;

  const list = segments
    .map((s, i) => `${i}: [${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  const system =
    "You pick the single most scroll-stopping moment from a short video's transcript to use as a 2-4 second cold-open hook clip. Return ONLY JSON.";
  const user = `Transcript segments (index: [start-end] text):
${list}

Video duration: ${duration.toFixed(1)}s.

Pick the start and end time (in seconds) of the most attention-grabbing 2-4 second moment — a surprising claim, a bold statement, or a curiosity-gap line. Keep the window between 1.5 and 4.5 seconds and within the video duration.

Return ONLY this JSON, no prose:
{"start": <number>, "end": <number>, "quote": "<the spoken words in that window>", "reason": "<why this moment hooks the viewer>"}`;

  let text = "";
  try {
    const provider = (process.env.GENERATION_PROVIDER || "vertex").toLowerCase();
    if (provider === "openai" && openaiKey) {
      text = await callOpenAIImpl(system, user, openaiKey, 400);
    } else {
      try {
        text = await callVertex(system, user, { maxTokens: 400, temperature: 0.4 });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (
          openaiKey &&
          /401|403|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|permission_denied|unauthenticated|empty text|ENOENT|no such file|does not exist|credentials/i.test(
            msg
          )
        ) {
          text = await callOpenAIImpl(system, user, openaiKey, 400);
        } else {
          throw err;
        }
      }
    }
  } catch (e: any) {
    console.warn("[hook-clip] LLM pick failed, using fallback:", e?.message || e);
    return fallback;
  }

  try {
    const json = JSON.parse(text.replace(/```json|```/g, "").trim());
    let start = Math.max(0, Number(json.start));
    let end = Number(json.end);
    if (!isFinite(start) || !isFinite(end) || end <= start) return fallback;
    // Clamp duration to [1.5, 4.5]s and within the video.
    if (end - start > 4.5) end = start + 4.5;
    if (end - start < 1.5) end = start + 1.5;
    if (duration && end > duration) {
      end = duration;
      start = Math.max(0, end - 3.5);
    }
    return {
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      quote: String(json.quote || "").trim(),
      reason: String(json.reason || "").trim(),
    };
  } catch {
    return fallback;
  }
}

/** Cut [start,end] from input into a clean, re-encoded mp4 at outputPath. */
async function cutClip(inputPath: string, outputPath: string, start: number, end: number): Promise<void> {
  const dur = Math.max(0.5, end - start);
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(dur),
    "-c:v", "libx264",
    "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 90_000 });
}

/**
 * Extract a hook clip from a monitored item's source reel.
 * Throws on hard failure (no video could be downloaded).
 */
export async function extractHookClip(item: any, openaiKey: string): Promise<HookClipResult> {
  if (!item?.url || !String(item.url).includes("instagram.com")) {
    throw new Error("This item has no Instagram source URL to clip from.");
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-clip-"));
  const videoPath = path.join(workDir, "source.mp4");

  try {
    // 1. Download the source video (yt-dlp → Apify media URL fallback).
    let ok = await downloadVideoViaYtdlp(item.url, videoPath);
    if (!ok) {
      const settings = await getActiveSettings();
      if (settings.apify_api_key) {
        console.log("[hook-clip] yt-dlp failed; trying Apify media URL...");
        const post = await fetchInstagramPostByUrl(item.url, settings.apify_api_key);
        if (post?.mediaUrl) ok = await downloadDirect(post.mediaUrl, videoPath);
      }
    }
    if (!ok) {
      throw new Error(
        "Could not download the source reel video. yt-dlp may need cookies, or set an Apify API key in Settings."
      );
    }

    // 2. Timestamped transcription.
    let segments: Segment[] = [];
    let duration = 0;
    try {
      const t = await transcribeWithTimestamps(videoPath, openaiKey);
      segments = t.segments;
      duration = t.duration;
    } catch (e: any) {
      console.warn("[hook-clip] timestamped transcription failed:", e?.message || e);
    }

    // 3. Pick the best moment.
    const pick = await pickHookMoment(segments, duration, openaiKey);

    // 4. Cut the clip into /public/hooks/<id>.mp4.
    const outDir = path.join(process.cwd(), "public", "hooks");
    fs.mkdirSync(outDir, { recursive: true });
    const fileName = `${item.id}.mp4`;
    const outPath = path.join(outDir, fileName);
    await cutClip(videoPath, outPath, pick.start, pick.end);

    return {
      clipPath: `/hooks/${fileName}`,
      start: pick.start,
      end: pick.end,
      quote: pick.quote,
      reason: pick.reason,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
