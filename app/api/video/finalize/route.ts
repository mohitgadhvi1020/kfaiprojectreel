import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { finalizeWithAudio } from "@/lib/video/finalize-with-audio";
import { alignScriptToAudio } from "@/lib/video/align-script-to-audio";
import { getActiveSettings } from "@/lib/settings";

const VIDEO_JOBS_DIR = path.join(process.cwd(), ".data", "video-jobs");
const UPLOAD_DIR = path.join(process.cwd(), ".data", "video-audio-uploads");

interface VideoJob {
  id: string;
  status:
    | "generating_script"
    | "generating_voices"
    | "rendering"
    | "completed"
    | "script_only"
    | "failed";
  topic: string;
  characterSetId: string;
  error?: string;
  outputPath?: string;
  scriptPreview?: string;
  scriptLines?: Array<{
    character: "A" | "B";
    text: string;
    estimatedDuration: number;
  }>;
  timedLines?: Array<{
    index: number;
    character: "A" | "B";
    text: string;
    start: number;
    end: number;
    matchedWords: number;
    totalWords: number;
  }>;
  alignmentMatchQuality?: number;
  audioDurationSeconds?: number;
  createdAt: string;
  completedAt?: string;
}

function loadJob(id: string): VideoJob | null {
  const filePath = path.join(VIDEO_JOBS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJob(job: VideoJob): void {
  fs.mkdirSync(VIDEO_JOBS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(VIDEO_JOBS_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2)
  );
}

// POST /api/video/finalize
// Body: multipart/form-data — fields: jobId (string), audio (File)
//
// Flow: user generated a script-only job (no ElevenLabs key), recorded their
// own voiceover externally, and uploads it here. We mux it onto the Minecraft
// background loop and mark the job completed so the existing download UI
// just works.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const jobId = String(form.get("jobId") || "");
    const audio = form.get("audio");
    // Optional bg effect override. "subtle" is the default — slow drift +
    // sat/contrast bump + soft vignette. "none" disables post-processing.
    const bgEffectRaw = String(form.get("bgEffect") || "subtle").toLowerCase();
    const bgEffect: "subtle" | "none" =
      bgEffectRaw === "none" ? "none" : "subtle";

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }
    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "audio file is required (multipart field 'audio')" },
        { status: 400 }
      );
    }

    const job = loadJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Save the upload to disk so ffmpeg can read it. Keep the original
    // extension if we can detect one — ffmpeg sniffs the container anyway.
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const ext = (() => {
      const fromName = path.extname(audio.name || "").toLowerCase();
      if (fromName) return fromName;
      // Fall back to a guess from MIME type — minor convenience.
      const t = (audio.type || "").toLowerCase();
      if (t.includes("mpeg") || t.includes("mp3")) return ".mp3";
      if (t.includes("wav")) return ".wav";
      if (t.includes("m4a") || t.includes("aac")) return ".m4a";
      if (t.includes("ogg")) return ".ogg";
      if (t.includes("webm")) return ".webm";
      return ".audio";
    })();
    const audioPath = path.join(UPLOAD_DIR, `${jobId}${ext}`);
    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    fs.writeFileSync(audioPath, audioBuffer);

    // Mark rendering, then run ffmpeg synchronously — encoding a 60-90s clip
    // is fast enough that we don't need the async-job polling pattern.
    job.status = "rendering";
    saveJob(job);

    try {
      // Run ffmpeg mux + Whisper alignment in parallel — they're both bounded
      // network/CPU work and don't depend on each other. Saves ~5-15s wall
      // time on a typical 60s clip.
      const settings = await getActiveSettings().catch(() => null);
      const openaiKey =
        settings?.openai_api_key || process.env.OPENAI_API_KEY || "";

      const [muxResult, alignment] = await Promise.all([
        finalizeWithAudio({ jobId, audioPath, bgEffect }),
        // Alignment is best-effort. We don't fail the whole render if Whisper
        // hiccups — the alignScriptToAudio helper already falls back to
        // proportional timing internally.
        job.scriptLines && job.scriptLines.length
          ? alignScriptToAudio(audioPath, job.scriptLines, openaiKey, 0).catch(
              (e) => {
                console.warn(`[finalize] alignment failed: ${e?.message}`);
                return null;
              }
            )
          : Promise.resolve(null),
      ]);

      job.status = "completed";
      job.outputPath = muxResult.outputPath;
      job.completedAt = new Date().toISOString();
      if (alignment) {
        job.timedLines = alignment.timedLines;
        job.alignmentMatchQuality = alignment.matchQuality;
        job.audioDurationSeconds =
          alignment.audioDurationSeconds || muxResult.durationSeconds;
      } else {
        job.audioDurationSeconds = muxResult.durationSeconds;
      }
      saveJob(job);

      console.log(
        `[finalize] ${jobId} done — duration=${muxResult.durationSeconds.toFixed(
          1
        )}s alignment=${
          alignment
            ? `${(alignment.matchQuality * 100).toFixed(0)}% match (${
                alignment.usedWhisper ? "whisper" : "fallback"
              })`
            : "skipped"
        }`
      );

      return NextResponse.json({
        jobId,
        status: "completed",
        durationSeconds: muxResult.durationSeconds,
        downloadUrl: `/api/video/${jobId}?download=true`,
        timedLines: job.timedLines || null,
        alignmentMatchQuality: job.alignmentMatchQuality ?? null,
      });
    } catch (renderErr: any) {
      job.status = "failed";
      job.error = renderErr.message || "ffmpeg render failed";
      saveJob(job);
      console.error(`[finalize] ${jobId} failed:`, renderErr);
      return NextResponse.json(
        { error: job.error, jobId, status: "failed" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[finalize] request handling failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to finalize video" },
      { status: 500 }
    );
  }
}
