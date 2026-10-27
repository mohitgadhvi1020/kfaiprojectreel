/**
 * POST /api/monitor/reel-download
 *
 * Download a high-quality Instagram reel video using yt-dlp.
 * Returns the video file as a binary response for direct browser download.
 *
 * Body: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ig-dl-"));

  try {
    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Instagram reel/post URL is required" },
        { status: 400 }
      );
    }

    const isInstagramUrl =
      url.includes("instagram.com/") || url.includes("instagr.am/");
    if (!isInstagramUrl) {
      return NextResponse.json(
        { error: "Please provide a valid Instagram URL" },
        { status: 400 }
      );
    }

    // Clean URL — strip tracking params
    let cleanUrl = url.trim();
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.hostname.includes("instagram.com")) {
        cleanUrl = `https://www.instagram.com${parsed.pathname}`;
      }
    } catch {}

    // Extract shortcode for filename
    const shortcode =
      cleanUrl.match(/\/(reel|p|tv)\/([^/?]+)/)?.[2] || "reel";

    const outputTemplate = path.join(workDir, `${shortcode}.%(ext)s`);

    console.log(`[reel-download] Downloading: ${cleanUrl}`);

    // Download best quality video+audio merged
    await execFileAsync(
      "yt-dlp",
      [
        "-f", "bestvideo+bestaudio/best",
        "--merge-output-format", "mp4",
        "--no-warnings",
        "-o", outputTemplate,
        cleanUrl,
      ],
      { timeout: 120_000 }
    );

    // Find the downloaded file
    const files = fs.readdirSync(workDir).filter((f) => f.startsWith(shortcode));
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Download completed but no file was produced" },
        { status: 500 }
      );
    }

    const filePath = path.join(workDir, files[0]);
    const stat = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(files[0]) || ".mp4";

    console.log(
      `[reel-download] Success: ${shortcode}${ext} (${Math.round(stat.size / 1024)}KB)`
    );

    // Clean up
    fs.rmSync(workDir, { recursive: true, force: true });

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="instagram-${shortcode}${ext}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (err: any) {
    fs.rmSync(workDir, { recursive: true, force: true });

    if (err.code === "ENOENT") {
      return NextResponse.json(
        { error: "yt-dlp not found. Install it: brew install yt-dlp" },
        { status: 500 }
      );
    }

    console.error("[reel-download] Error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to download reel" },
      { status: 500 }
    );
  }
}
