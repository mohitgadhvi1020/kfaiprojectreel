import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * The Minecraft gameplay loop the user provides at this path. Whatever they
 * drop here is what plays behind every script. We don't bundle it — they're
 * expected to put a long enough clip there themselves.
 */
const MINECRAFT_BG_PATH = path.join(
  process.cwd(),
  "public",
  "backgrounds",
  "minecraft.mp4"
);

const OUTPUT_DIR = path.join(process.cwd(), ".data", "video-output");

export interface FinalizeInput {
  jobId: string;
  audioPath: string; // absolute path to the user-uploaded audio file
  /**
   * Visual polish layered on top of the raw background loop. "subtle" is the
   * default — barely-perceptible drift + saturation/contrast bump + soft
   * vignette. Set to "none" to disable (raw loop, no post-processing).
   */
  bgEffect?: "none" | "subtle";
}

/**
 * Build the ffmpeg filter graph for the chosen background effect. Kept as a
 * pure function so it's easy to A/B effects without touching the ffmpeg
 * spawn logic. All effects target a vertical 1080×1920 output.
 */
function buildVideoFilter(effect: "none" | "subtle"): string {
  if (effect === "none") {
    // Plain center-crop fill. No post-processing.
    return "[0:v]scale=-2:1920,crop=1080:1920:(in_w-1080)/2:0,setsar=1[v]";
  }

  // "subtle":
  //   1. scale taller than 1920 so we have headroom for drift cropping
  //      (2112 = 1920 × 1.1 → ±~96px slack vertically, plenty)
  //   2. crop a 1080×1920 window whose x/y wander on slow sin curves
  //      (drift = ±25px horizontal over 8s, ±20px vertical over 10s)
  //      → looks like a gentle camera breathe, never jarring
  //   3. eq: saturation +18%, contrast +6% → colors pop for mobile feed
  //   4. vignette PI/5 → mild edge darkening, focuses on center (where
  //      caption text typically lives in CapCut)
  return [
    "[0:v]scale=-2:2112",
    "crop=1080:1920:x='(in_w-1080)/2 + 25*sin(2*PI*t/8)':y='(in_h-1920)/2 + 20*sin(2*PI*t/10)'",
    "eq=saturation=1.18:contrast=1.06",
    "vignette=PI/5",
    "setsar=1[v]",
  ].join(",");
}

export interface FinalizeResult {
  outputPath: string;
  durationSeconds: number;
}

/**
 * Probe the audio's duration (seconds) using ffprobe. We need it so we can
 * trim the looping background to match — otherwise ffmpeg will keep looping
 * forever, or stop too early.
 */
async function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    let err = "";
    ff.stdout.on("data", (d) => (out += d.toString()));
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.trim()}`));
      const seconds = parseFloat(out.trim());
      if (!isFinite(seconds) || seconds <= 0) {
        return reject(new Error(`ffprobe returned invalid duration: ${out}`));
      }
      resolve(seconds);
    });
    ff.on("error", reject);
  });
}

/**
 * Mux a Minecraft gameplay loop + uploaded audio into a vertical 1080x1920
 * MP4. The video is looped to match audio length, cropped/scaled to fill
 * vertical, and the audio track is replaced with the upload.
 *
 * No captions, no avatars — pure background + voiceover. Captioning is
 * trivially done in CapCut after download.
 */
export async function finalizeWithAudio(
  input: FinalizeInput
): Promise<FinalizeResult> {
  const { jobId, audioPath, bgEffect = "subtle" } = input;

  if (!fs.existsSync(MINECRAFT_BG_PATH)) {
    throw new Error(
      `Minecraft background not found at public/backgrounds/minecraft.mp4. ` +
        `Drop a gameplay clip there (any length — it'll loop) and try again.`
    );
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Uploaded audio not found at ${audioPath}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  const audioSeconds = await probeDurationSeconds(audioPath);

  // ffmpeg pipeline:
  //  -stream_loop -1 + -t <duration>  → loop the bg to match audio length
  //  -i <audio>                       → user audio
  //  filter_complex                   → vertical 1080×1920 + subtle motion/grade
  //  -map [v]:v -map 1:a              → bg video + uploaded audio (drop bg's audio)
  //  -shortest                        → safety net so we stop at the audio end
  //
  // "subtle" preset: slow drift crop + sat/contrast bump + soft vignette.
  // See buildVideoFilter() for the per-effect breakdown.
  const filter = buildVideoFilter(bgEffect);

  const args = [
    "-y",
    "-stream_loop",
    "-1",
    "-t",
    String(audioSeconds),
    "-i",
    MINECRAFT_BG_PATH,
    "-i",
    audioPath,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    // Drift crop with eval=frame is a touch heavier than a static crop,
    // so we use medium preset + slightly higher CRF tolerance to keep
    // encode time under ~1.5× realtime on most laptops. veryfast is fine
    // when the effect is "none".
    "-preset",
    bgEffect === "subtle" ? "medium" : "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `ffmpeg exited with code ${code}. Last stderr lines:\n${stderr
              .split("\n")
              .slice(-20)
              .join("\n")}`
          )
        );
      }
      resolve();
    });
    ff.on("error", reject);
  });

  return {
    outputPath,
    durationSeconds: audioSeconds,
  };
}
