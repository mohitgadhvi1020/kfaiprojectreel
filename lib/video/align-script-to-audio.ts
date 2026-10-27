import * as fs from "fs";
import * as path from "path";

/**
 * Align a generated dialogue script to a real audio recording so we know
 * exactly when each character speaks. The flow:
 *
 *   1. Send the audio to OpenAI Whisper with word-level timestamps.
 *   2. Whisper returns every word with `start` / `end` seconds.
 *   3. Greedy-match transcript words against script-line words to figure
 *      out where each line begins and ends.
 *
 * Whisper word timestamps are typically accurate to ~100ms, which is more
 * than enough for putting a Jon Snow / Daenerys cutout on screen at the
 * right moment.
 *
 * If the alignment fails (mismatched audio, very low transcript overlap),
 * we fall back to proportional splits based on the script's
 * `estimatedDuration` field — coarser, but never throws.
 */

export interface ScriptLineForAlignment {
  character: "A" | "B";
  text: string;
  estimatedDuration: number;
}

export interface TimedLine {
  index: number;
  character: "A" | "B";
  text: string;
  start: number; // seconds
  end: number; // seconds
  matchedWords: number; // how many script words we found in the transcript
  totalWords: number; // total words in this script line
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperVerboseResponse {
  text: string;
  duration?: number;
  words?: WhisperWord[];
}

/** Strip punctuation, lowercase, collapse whitespace. Keeps apostrophes for
 * contractions like "don't" — Whisper sometimes emits them, sometimes not, so
 * we'll strip them again at compare time. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove apostrophes too, for the strict equality check during alignment. */
function strictNormalize(word: string): string {
  return normalize(word).replace(/'/g, "");
}

/** Cheap fuzzy match: equal after stripping, OR sharing first 3 chars + close
 * length. This catches Whisper substitutions like "claude" ↔ "clawed". */
function wordsClose(a: string, b: string): boolean {
  const x = strictNormalize(a);
  const y = strictNormalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 3 && y.length >= 3 && x.slice(0, 3) === y.slice(0, 3)) {
    return Math.abs(x.length - y.length) <= 2;
  }
  // One-char-off Levenshtein-ish for short words
  if (Math.abs(x.length - y.length) <= 1 && x.length >= 4) {
    let diffs = 0;
    const len = Math.min(x.length, y.length);
    for (let i = 0; i < len && diffs < 2; i++) if (x[i] !== y[i]) diffs++;
    if (diffs <= 1) return true;
  }
  return false;
}

async function transcribeWithWhisper(
  audioPath: string,
  openaiKey: string
): Promise<WhisperVerboseResponse> {
  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);

  // We need to send a multipart/form-data body. Web `FormData` + `Blob`
  // works in Node 18+ which Next.js targets.
  const fd = new FormData();
  const blob = new Blob([fileBuffer]);
  fd.append("file", blob, fileName);
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  // `timestamp_granularities` is an array — we want word-level timing.
  fd.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: fd,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err.slice(0, 500)}`);
  }

  return (await res.json()) as WhisperVerboseResponse;
}

/**
 * Greedy alignment: walks through transcript words in order. For each
 * script line, we look at the next ~120% of its expected word count in the
 * transcript and try to find the line's first and last words inside that
 * window. If we can't find a confident anchor, we estimate from the
 * pointer + estimatedDuration ratios.
 */
function alignWordsToLines(
  transcriptWords: WhisperWord[],
  scriptLines: ScriptLineForAlignment[],
  totalAudioDuration: number
): TimedLine[] {
  const result: TimedLine[] = [];
  let pointer = 0; // index into transcriptWords

  // Total of estimatedDurations used to spread fallback timing if alignment fails.
  const totalEst = scriptLines.reduce((s, l) => s + (l.estimatedDuration || 0), 0) || 1;

  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i];
    const lineWords = normalize(line.text).split(" ").filter(Boolean);
    const lineLen = lineWords.length;

    let matchedFirstIdx = -1;
    let matchedLastIdx = -1;
    let matchedCount = 0;

    if (lineLen > 0 && pointer < transcriptWords.length) {
      // Search window: from current pointer, look ahead enough words to
      // cover this line plus 50% slack for skipped fillers / mishears.
      const windowEnd = Math.min(
        transcriptWords.length,
        pointer + Math.max(8, Math.ceil(lineLen * 1.5)) + 4
      );

      // Find the first transcript word that matches the first script word
      // anywhere in the window (skipping junk like "uh", "you know").
      let firstWordIdx = -1;
      for (let j = pointer; j < windowEnd; j++) {
        if (wordsClose(transcriptWords[j].word, lineWords[0])) {
          firstWordIdx = j;
          break;
        }
      }
      // Fallback: if we can't anchor on word 0, try word 1 or 2 as anchor.
      if (firstWordIdx === -1 && lineWords.length > 1) {
        for (let k = 1; k < Math.min(3, lineWords.length); k++) {
          for (let j = pointer; j < windowEnd; j++) {
            if (wordsClose(transcriptWords[j].word, lineWords[k])) {
              firstWordIdx = Math.max(pointer, j - k);
              break;
            }
          }
          if (firstWordIdx !== -1) break;
        }
      }

      if (firstWordIdx !== -1) {
        matchedFirstIdx = firstWordIdx;
        // Now walk transcript and script in parallel-ish — for each script
        // word, advance transcript looking for it within a small slack.
        let tIdx = firstWordIdx;
        for (let s = 0; s < lineLen; s++) {
          let found = -1;
          const slackEnd = Math.min(transcriptWords.length, tIdx + 4);
          for (let j = tIdx; j < slackEnd; j++) {
            if (wordsClose(transcriptWords[j].word, lineWords[s])) {
              found = j;
              break;
            }
          }
          if (found !== -1) {
            matchedLastIdx = found;
            tIdx = found + 1;
            matchedCount++;
          } else {
            // Skip this script word — Whisper may have dropped it.
            // Don't advance the transcript pointer.
          }
        }
      }
    }

    let start: number;
    let end: number;

    if (matchedFirstIdx !== -1 && matchedLastIdx !== -1 && matchedCount >= Math.max(2, Math.floor(lineLen * 0.4))) {
      // Confident alignment.
      start = transcriptWords[matchedFirstIdx].start;
      end = transcriptWords[matchedLastIdx].end;
      pointer = matchedLastIdx + 1;
    } else {
      // Fallback: proportional carve-up by estimatedDuration. Use the
      // previous line's end (or 0) as the start, then add this line's
      // proportional share of the remaining audio.
      const prevEnd = result.length ? result[result.length - 1].end : 0;
      const remaining = Math.max(0, totalAudioDuration - prevEnd);
      const remainingEstTotal = scriptLines
        .slice(i)
        .reduce((s, l) => s + (l.estimatedDuration || 0), 0) || 1;
      const share = ((line.estimatedDuration || totalEst / scriptLines.length) / remainingEstTotal) * remaining;
      start = prevEnd;
      end = Math.min(totalAudioDuration, prevEnd + share);
      // Don't advance the transcript pointer — we didn't consume it
      // confidently. Next line gets another shot.
    }

    // Guarantee monotonic, non-zero duration so consumers never see
    // overlapping or backwards spans.
    if (result.length && start < result[result.length - 1].end) {
      start = result[result.length - 1].end;
    }
    if (end <= start) end = Math.min(totalAudioDuration, start + 0.5);

    result.push({
      index: i,
      character: line.character,
      text: line.text,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      matchedWords: matchedCount,
      totalWords: lineLen,
    });
  }

  // Stretch the last line's end to the full audio duration so we don't
  // leave a silent tail with no character on screen.
  if (result.length) {
    const last = result[result.length - 1];
    if (totalAudioDuration - last.end > 0.2) {
      last.end = Number(totalAudioDuration.toFixed(3));
    }
  }

  return result;
}

export interface AlignmentResult {
  timedLines: TimedLine[];
  audioDurationSeconds: number;
  /** 0–1 — fraction of total script words confidently matched to transcript. */
  matchQuality: number;
  /** True if we transcribed via Whisper; false if we fell back entirely. */
  usedWhisper: boolean;
}

export async function alignScriptToAudio(
  audioPath: string,
  scriptLines: ScriptLineForAlignment[],
  openaiKey: string,
  fallbackAudioDuration: number
): Promise<AlignmentResult> {
  if (!openaiKey) {
    return {
      timedLines: alignWordsToLines([], scriptLines, fallbackAudioDuration),
      audioDurationSeconds: fallbackAudioDuration,
      matchQuality: 0,
      usedWhisper: false,
    };
  }

  let whisper: WhisperVerboseResponse;
  try {
    whisper = await transcribeWithWhisper(audioPath, openaiKey);
  } catch (err: any) {
    console.warn(`[align] Whisper failed, falling back to estimates: ${err.message}`);
    return {
      timedLines: alignWordsToLines([], scriptLines, fallbackAudioDuration),
      audioDurationSeconds: fallbackAudioDuration,
      matchQuality: 0,
      usedWhisper: false,
    };
  }

  const audioDur = whisper.duration ?? fallbackAudioDuration;
  const words = whisper.words || [];
  const timed = alignWordsToLines(words, scriptLines, audioDur);

  const totalScriptWords = timed.reduce((s, l) => s + l.totalWords, 0) || 1;
  const totalMatched = timed.reduce((s, l) => s + l.matchedWords, 0);
  const matchQuality = Math.min(1, totalMatched / totalScriptWords);

  return {
    timedLines: timed,
    audioDurationSeconds: audioDur,
    matchQuality: Number(matchQuality.toFixed(3)),
    usedWhisper: true,
  };
}
