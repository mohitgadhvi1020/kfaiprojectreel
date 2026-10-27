/**
 * Instagram reel/post fetcher using yt-dlp.
 *
 * Zero API keys needed — yt-dlp scrapes public Instagram posts directly.
 * Returns caption, video URL (for Whisper transcription), thumbnail, username, etc.
 *
 * Requires `yt-dlp` to be installed on the system (`brew install yt-dlp` or `pip install yt-dlp`).
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface InstagramReelData {
  postId: string;
  url: string;
  caption: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  username: string;
  duration: number | null;
  likesCount: number;
  commentsCount: number;
  published: string;
  type: "Video" | "Image";
}

/**
 * Fetch Instagram reel/post metadata using yt-dlp.
 * No API keys needed — works for any public Instagram post.
 */
export async function fetchInstagramReelViaYtdlp(
  postUrl: string
): Promise<InstagramReelData | null> {
  if (!postUrl) return null;

  // Clean the URL — strip tracking params
  let cleanUrl = postUrl.trim();
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.hostname.includes("instagram.com")) {
      cleanUrl = `https://www.instagram.com${parsed.pathname}`;
    }
  } catch {
    // use as-is
  }

  try {
    console.log(`[ig-ytdlp] Fetching metadata for: ${cleanUrl}`);

    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-warnings",
      cleanUrl,
    ], { timeout: 60_000 });

    const data = JSON.parse(stdout.trim());

    // Extract the best video URL from formats
    let videoUrl: string | null = null;
    const formats = data.formats || [];
    // Prefer mp4 video formats, pick the best quality
    const videoFormats = formats.filter(
      (f: any) => f.ext === "mp4" && f.vcodec !== "none"
    );
    if (videoFormats.length > 0) {
      // Last format is usually highest quality
      videoUrl = videoFormats[videoFormats.length - 1]?.url || null;
    }
    // Fallback: try the direct url field
    if (!videoUrl && data.url) {
      videoUrl = data.url;
    }

    const username =
      data.channel || data.uploader || data.uploader_id || "unknown";
    const caption = data.description || data.title || "";
    const postId =
      data.id || cleanUrl.match(/\/(p|reel|tv)\/([^/?]+)/)?.[2] || "";

    // Parse timestamp
    let published = new Date().toISOString();
    if (data.timestamp) {
      published = new Date(data.timestamp * 1000).toISOString();
    } else if (data.upload_date) {
      // yt-dlp format: YYYYMMDD
      const d = data.upload_date;
      published = new Date(
        `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      ).toISOString();
    }

    const result: InstagramReelData = {
      postId,
      url: data.webpage_url || cleanUrl,
      caption,
      videoUrl,
      thumbnailUrl: data.thumbnail || null,
      username,
      duration: data.duration || null,
      likesCount: data.like_count || 0,
      commentsCount: data.comment_count || 0,
      published,
      type: videoUrl ? "Video" : "Image",
    };

    console.log(
      `[ig-ytdlp] Success: @${username} — "${caption.slice(0, 60)}..." ` +
        `(${result.type}, ${data.duration ? Math.round(data.duration) + "s" : "no duration"}, ` +
        `videoUrl=${!!videoUrl})`
    );

    return result;
  } catch (err: any) {
    // Check if yt-dlp is not installed
    if (err.code === "ENOENT") {
      console.error(
        `[ig-ytdlp] yt-dlp not found. Install it: brew install yt-dlp`
      );
      return null;
    }

    console.error(`[ig-ytdlp] Failed to fetch ${cleanUrl}:`, err.message || err);
    return null;
  }
}
