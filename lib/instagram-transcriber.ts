import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Download Instagram reel video+audio using yt-dlp.
 * yt-dlp merges the separate audio and video streams that Instagram serves,
 * giving us a proper mp4 with audio for Whisper transcription.
 */
async function downloadViaYtdlp(instagramUrl: string, outputPath: string): Promise<void> {
  await execFileAsync("yt-dlp", [
    "-f", "bestaudio[ext=m4a]/bestaudio/best",
    "--no-warnings",
    "-o", outputPath,
    instagramUrl,
  ], { timeout: 60_000 });
}

/** Fallback: download a direct media URL (may be video-only, no audio). */
async function downloadMedia(url: string, filePath: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Media download failed (${res.status})`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, bytes);
}

async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "48k",
    outputPath,
  ]);
}

async function transcribeAudio(audioPath: string, openaiKey: string): Promise<string> {
  const fileBuffer = fs.readFileSync(audioPath);
  const fd = new FormData();
  fd.append("file", new Blob([fileBuffer]), path.basename(audioPath));
  fd.append("model", "whisper-1");
  fd.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: fd,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err.slice(0, 300)}`);
  }

  return (await res.text()).trim();
}

/**
 * Transcribe an Instagram reel's audio.
 *
 * @param mediaUrlOrInstagramUrl - either a direct media URL or an Instagram page URL
 * @param openaiKey - OpenAI API key for Whisper
 * @param instagramPageUrl - optional Instagram page URL for yt-dlp download
 */
export async function transcribeInstagramMedia(
  mediaUrlOrInstagramUrl: string | null | undefined,
  openaiKey: string,
  instagramPageUrl?: string
): Promise<string> {
  if (!openaiKey) return "";
  if (!mediaUrlOrInstagramUrl && !instagramPageUrl) return "";

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ig-reel-"));
  const audioPath = path.join(workDir, "audio.m4a");

  try {
    // Strategy 1: Use yt-dlp to download audio directly from Instagram URL.
    // This properly handles Instagram's split audio/video streams.
    const igUrl = instagramPageUrl || mediaUrlOrInstagramUrl || "";
    if (igUrl.includes("instagram.com/")) {
      console.log(`[ig-transcriber] Downloading audio via yt-dlp...`);
      try {
        await downloadViaYtdlp(igUrl, audioPath);
        if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0) {
          console.log(`[ig-transcriber] yt-dlp audio downloaded (${Math.round(fs.statSync(audioPath).size / 1024)}KB)`);
          return await transcribeAudio(audioPath, openaiKey);
        }
      } catch (ytErr: any) {
        console.warn(`[ig-transcriber] yt-dlp audio download failed: ${ytErr.message?.slice(0, 150)}`);
      }
    }

    // Strategy 2: Download the direct media URL + extract audio via ffmpeg.
    // This works when Apify provides the media URL (has audio embedded).
    if (mediaUrlOrInstagramUrl && !mediaUrlOrInstagramUrl.includes("instagram.com/reel/")) {
      console.log(`[ig-transcriber] Falling back to direct download + ffmpeg...`);
      const mediaPath = path.join(workDir, "media.mp4");
      const mp3Path = path.join(workDir, "audio.mp3");
      await downloadMedia(mediaUrlOrInstagramUrl, mediaPath);
      await extractAudio(mediaPath, mp3Path);
      return await transcribeAudio(mp3Path, openaiKey);
    }

    console.warn(`[ig-transcriber] No audio could be extracted`);
    return "";
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function buildInstagramRawText(caption: string, transcript: string): string {
  const parts: string[] = [];
  if (caption.trim()) parts.push(`CAPTION:\n${caption.trim()}`);
  if (transcript.trim()) parts.push(`SPOKEN TRANSCRIPT:\n${transcript.trim()}`);
  return parts.join("\n\n").slice(0, 50000);
}
