import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

/**
 * GET /api/video/backgrounds
 * Lists .mp4 / .mov files in public/backgrounds so the /video UI can offer a
 * dropdown. Drop any new video into that folder — or use yt-dlp to pull one
 * from a URL — and it shows up here automatically.
 */
export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "backgrounds");
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ backgrounds: [] });
    }
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
      .map((f) => ({
        path: `backgrounds/${f}`,
        name: f.replace(/\.(mp4|mov|webm)$/i, ""),
        sizeBytes: fs.statSync(path.join(dir, f)).size,
      }));
    return NextResponse.json({ backgrounds: files });
  } catch (err: any) {
    return NextResponse.json({ backgrounds: [], error: err.message }, { status: 500 });
  }
}
