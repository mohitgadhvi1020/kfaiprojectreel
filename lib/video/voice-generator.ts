import * as fs from "fs";
import * as path from "path";
import { DialogueLine } from "./dialogue-generator";
import { CharacterSet } from "./character-sets";

export interface GeneratedAudio {
  lineIndex: number;
  audioPath: string;
  durationMs: number;
}

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

async function getAudioDurationMs(filePath: string): Promise<number> {
  // Dynamic import for music-metadata (ESM module)
  const mm = await import("music-metadata");
  const metadata = await mm.parseFile(filePath);
  return Math.round((metadata.format.duration || 3) * 1000);
}

async function synthesizeSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
  outputPath: string
): Promise<void> {
  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);
}

export async function generateVoicesForScript(
  lines: DialogueLine[],
  characterSet: CharacterSet,
  elevenLabsKey: string,
  jobId: string
): Promise<GeneratedAudio[]> {
  const tempDir = path.join(process.cwd(), ".data", "video-temp", jobId);
  fs.mkdirSync(tempDir, { recursive: true });

  const results: GeneratedAudio[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const voiceId =
      line.character === "A"
        ? characterSet.characterA.voiceId
        : characterSet.characterB.voiceId;

    const audioFileName = `line-${String(i).padStart(3, "0")}.mp3`;
    const audioPath = path.join(tempDir, audioFileName);

    await synthesizeSpeech(line.text, voiceId, elevenLabsKey, audioPath);

    const durationMs = await getAudioDurationMs(audioPath);

    results.push({
      lineIndex: i,
      audioPath,
      durationMs,
    });
  }

  return results;
}

export function cleanupTempFiles(jobId: string): void {
  const tempDir = path.join(process.cwd(), ".data", "video-temp", jobId);
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}
