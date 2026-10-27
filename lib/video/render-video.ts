import * as path from "path";
import * as fs from "fs";
import { DialogueLine as ScriptLine } from "./dialogue-generator";
import { GeneratedAudio } from "./voice-generator";
import { CharacterSet } from "./character-sets";

const FPS = 30;

export interface RenderInput {
  script: { lines: ScriptLine[] };
  audioFiles: GeneratedAudio[];
  characterSet: CharacterSet;
  backgroundVideoPath: string;
  jobId: string;
}

export interface RenderResult {
  outputPath: string;
  durationSeconds: number;
}

function msToFrames(ms: number): number {
  return Math.ceil((ms / 1000) * FPS);
}

export async function renderDialogueVideo(
  input: RenderInput
): Promise<RenderResult> {
  const { script, audioFiles, characterSet, backgroundVideoPath, jobId } = input;

  const outputDir = path.join(process.cwd(), ".data", "video-output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${jobId}.mp4`);

  const compositionLines = script.lines.map((line, i) => {
    const audio = audioFiles.find((a) => a.lineIndex === i);
    const durationMs = audio?.durationMs || line.estimatedDuration * 1000;
    const paddingMs = 300;

    return {
      character: line.character,
      text: line.text,
      emotion: line.emotion,
      audioSrc: audio ? `file://${audio.audioPath.replace(/\\/g, "/")}` : "",
      durationInFrames: msToFrames(durationMs + paddingMs),
    };
  });

  const totalFrames = compositionLines.reduce(
    (sum, l) => sum + l.durationInFrames,
    0
  );

  const bgVideoAbsolute = path.isAbsolute(backgroundVideoPath)
    ? backgroundVideoPath
    : path.join(process.cwd(), "public", backgroundVideoPath);

  const bgVideoSrc = fs.existsSync(bgVideoAbsolute)
    ? `file://${bgVideoAbsolute.replace(/\\/g, "/")}`
    : "";

  const inputProps = {
    lines: compositionLines,
    characterA: {
      name: characterSet.characterA.name,
      avatarSrc: characterSet.characterA.avatarPath,
    },
    characterB: {
      name: characterSet.characterB.name,
      avatarSrc: characterSet.characterB.avatarPath,
    },
    backgroundVideoSrc: bgVideoSrc,
  };

  const remotionEntry = path.join(process.cwd(), "remotion", "index.ts");

  // Dynamic imports to avoid blocking Next.js startup compilation
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  const bundled = await bundle({
    entryPoint: remotionEntry,
    webpackOverride: (config: any) => config,
  });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: "DialogueVideo",
    inputProps,
  });

  composition.durationInFrames = totalFrames;
  composition.fps = FPS;
  composition.width = 1080;
  composition.height = 1920;

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
  });

  return {
    outputPath,
    durationSeconds: totalFrames / FPS,
  };
}
