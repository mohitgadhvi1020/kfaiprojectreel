import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const VIDEO_JOBS_DIR = path.join(process.cwd(), ".data", "video-jobs");

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id;

  // If requesting the video file download
  if (request.nextUrl.searchParams.get("download") === "true") {
    return handleDownload(jobId);
  }

  const job = loadJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    topic: job.topic,
    characterSetId: job.characterSetId,
    scriptPreview: job.scriptPreview || null,
    error: job.error || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
    downloadUrl: job.status === "completed" ? `/api/video/${job.id}?download=true` : null,
    timedLines: job.timedLines || null,
    alignmentMatchQuality: job.alignmentMatchQuality ?? null,
    audioDurationSeconds: job.audioDurationSeconds ?? null,
  });
}

function handleDownload(jobId: string) {
  const job = loadJob(jobId);
  if (!job || job.status !== "completed" || !job.outputPath) {
    return NextResponse.json(
      { error: "Video not ready or not found" },
      { status: 404 }
    );
  }

  if (!fs.existsSync(job.outputPath)) {
    return NextResponse.json(
      { error: "Video file missing from disk" },
      { status: 404 }
    );
  }

  const fileBuffer = fs.readFileSync(job.outputPath);
  const fileName = `dialogue-video-${jobId}.mp4`;

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
