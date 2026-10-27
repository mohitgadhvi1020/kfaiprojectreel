import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getActiveSettings } from "@/lib/settings";
import { getCharacterSetById } from "@/lib/video/character-sets";
import { generateDialogueScript } from "@/lib/video/dialogue-generator";
import {
  generateVoicesForScript,
  cleanupTempFiles,
} from "@/lib/video/voice-generator";

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
  // Structured script lines (kept alongside scriptPreview) so the finalize
  // endpoint can run Whisper alignment after the user uploads audio.
  scriptLines?: Array<{
    character: "A" | "B";
    text: string;
    estimatedDuration: number;
  }>;
  // Filled in after audio upload + Whisper alignment.
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

function saveJob(job: VideoJob): void {
  fs.mkdirSync(VIDEO_JOBS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(VIDEO_JOBS_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2)
  );
}

function loadJob(id: string): VideoJob | null {
  const filePath = path.join(VIDEO_JOBS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      topic,
      characterSetId,
      targetDuration = 60,
      backgroundVideoPath = "backgrounds/bg-short.mp4",
      generationMode = "topic_debate",
    } = body;

    if (!topic || !characterSetId) {
      return NextResponse.json(
        { error: "topic and characterSetId are required" },
        { status: 400 }
      );
    }

    const characterSet = getCharacterSetById(characterSetId);
    if (!characterSet) {
      return NextResponse.json(
        { error: `Character set '${characterSetId}' not found` },
        { status: 404 }
      );
    }

    const settings = await getActiveSettings();

    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key required. Go to Settings." },
        { status: 400 }
      );
    }

    // ElevenLabs key is OPTIONAL. When missing, the pipeline still runs
    // step 1 (generate the dialogue script) and stops there — the user can
    // read/copy the script from job.scriptPreview. Voice synth + video
    // rendering are skipped with status="script_only".
    const elevenLabsKey = settings.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY || "";
    const scriptOnly = !elevenLabsKey;

    const jobId = `vid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const job: VideoJob = {
      id: jobId,
      status: "generating_script",
      topic,
      characterSetId,
      createdAt: new Date().toISOString(),
    };
    saveJob(job);

    // Run pipeline asynchronously — return jobId immediately
    runPipeline(
      jobId,
      topic,
      characterSet,
      settings.openai_api_key,
      elevenLabsKey,
      targetDuration,
      backgroundVideoPath,
      scriptOnly,
      generationMode
    ).catch((err) => {
      console.error(`Video pipeline failed for ${jobId}:`, err);
      const failedJob = loadJob(jobId);
      if (failedJob) {
        failedJob.status = "failed";
        failedJob.error = err.message || "Unknown error";
        saveJob(failedJob);
      }
    });

    return NextResponse.json({ jobId, status: "generating_script" });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to start video generation" },
      { status: 500 }
    );
  }
}

async function runPipeline(
  jobId: string,
  topic: string,
  characterSet: ReturnType<typeof getCharacterSetById> & {},
  openaiKey: string,
  elevenLabsKey: string,
  targetDuration: number,
  backgroundVideoPath: string,
  scriptOnly: boolean,
  generationMode: string = "topic_debate"
) {
  // Step 1: Generate dialogue script
  const script = await generateDialogueScript(
    topic,
    characterSet,
    openaiKey,
    targetDuration,
    { mode: generationMode === "source_adaptation" ? "source_adaptation" : "topic_debate" }
  );

  const job = loadJob(jobId)!;
  job.scriptPreview = script.lines
    .map((l) => l.text)
    .join("\n\n");
  // Persist the structured lines so /api/video/finalize can run Whisper
  // alignment when the user later uploads their voiceover.
  job.scriptLines = script.lines.map((l) => ({
    character: l.character,
    text: l.text,
    estimatedDuration: l.estimatedDuration,
  }));

  // No ElevenLabs key → stop after script generation. The caller gets the
  // dialogue in `scriptPreview` via GET /api/video/generate/[jobId].
  if (scriptOnly) {
    job.status = "script_only";
    job.completedAt = new Date().toISOString();
    saveJob(job);
    return;
  }

  job.status = "generating_voices";
  saveJob(job);

  // Step 2: Generate voice audio
  const audioFiles = await generateVoicesForScript(
    script.lines,
    characterSet,
    elevenLabsKey,
    jobId
  );

  job.status = "rendering";
  saveJob(job);

  // Step 3: Render video (dynamic import to avoid blocking Next.js compilation)
  const { renderDialogueVideo } = await import("@/lib/video/render-video");
  const result = await renderDialogueVideo({
    script,
    audioFiles,
    characterSet,
    backgroundVideoPath,
    jobId,
  });

  job.status = "completed";
  job.outputPath = result.outputPath;
  job.completedAt = new Date().toISOString();
  saveJob(job);

  // Cleanup temp audio files
  cleanupTempFiles(jobId);
}
