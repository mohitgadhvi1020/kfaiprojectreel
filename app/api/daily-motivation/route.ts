/**
 * GET /api/daily-motivation
 *
 * One Gemini-generated motivational nudge per day for the dashboard banner.
 * Cached on disk keyed by YYYY-MM-DD, so the first hit each day makes the
 * call and every subsequent page load that day reads the cached line.
 *
 * Pass `?force=1` to bypass the cache (used by the refresh button).
 */

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { callVertex } from "@/lib/vertex-client";

const CACHE_DIR = path.join(process.cwd(), ".daily-motivation-cache");

function todayKey(): string {
  // YYYY-MM-DD in the server's local timezone — good enough for a daily message.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readCache(key: string): Promise<{ message: string; subtext: string } | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: { message: string; subtext: string }) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn("[daily-motivation] cache write failed:", err);
  }
}

const SYSTEM_PROMPT = `You are writing ONE daily ambition hit for a solo AI builder who ships short-form content (Reels / YT Shorts) about AI startups and engineering.

GOAL: make them feel the SIZE of the upside. Paint the outcome. Dangle the money, the audience, the status, the optionality. Make them want to ship TODAY because of where it can lead.

TONE:
- Outcome-focused. Concrete dollar amounts, follower counts, inbound opportunities — not vague "you got this".
- Slightly audacious. Ambitious-builder energy. Think "here's what 100k followers actually unlock" rather than "keep going".
- Rotate angles daily: some days paint the money (sponsorships, consulting rates, acqui-hire, paid newsletters), some days the audience (DMs from YC, recruiter pings, founder friends), some days the leverage (course, SaaS, angel checks), some days the identity ("the AI-reels guy everyone DMs").
- Use specific numbers. "$8k/mo sponsor deals at 50k followers" hits harder than "monetize your audience".
- Never preachy, never motivational-poster. Like a rich friend texting you what's possible if you stop underselling yourself.

AVOID:
- "Ship it", "momentum beats mood", "progress over perfection" — banned clichés.
- Hustle-bro energy ("grind", "rise and grind", "no days off").
- Generic advice with no outcome attached.

OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no prose around it, no trailing commentary:
{
  "message": "<headline — max 110 chars, one punchy sentence that names the outcome>",
  "subtext": "<one supporting line — max 140 chars, the concrete math or receipt behind the outcome>"
}

Examples of tone (do NOT copy, calibrate):
- {"message":"50k followers on AI Reels = $5-10k/mo inbound sponsor deals from dev-tool companies.","subtext":"One reel/day. 9-12 months. Cursor, Windsurf, ElevenLabs all pay creators in this niche right now."}
- {"message":"The 'AI-reels guy' becomes the guy YC scouts DM when they need a technical founder.","subtext":"Distribution is the new pedigree. You don't need Stanford — you need 30 reels that got saved."}
- {"message":"A 90-second breakdown of a $20M Series A = one DM away from a $500/hr consulting call.","subtext":"Founders reading TechCrunch want someone to translate. That translator charges what they want."}
- {"message":"Every reel is a free ticket lottery entry for angel checks, job offers, and podcast invites.","subtext":"The ones who post weekly for a year get to pick their next chapter. The ones who don't, don't."}`;

async function generateFresh(): Promise<{ message: string; subtext: string }> {
  const userPrompt = `Today's date: ${new Date().toDateString()}. Give me today's nudge. Output JSON only.`;
  const raw = await callVertex(SYSTEM_PROMPT, userPrompt, {
    maxTokens: 400,
    temperature: 0.9,
  });

  // Strip accidental ```json fences if Gemini wraps them
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Try parsing the whole cleaned string first, then fall back to extracting
  // the first {...} block anywhere in the text (handles stray text, multi-line
  // JSON, trailing commentary, etc.).
  const tryParse = (s: string): { message: string; subtext: string } | null => {
    try {
      const p = JSON.parse(s);
      if (p && typeof p.message === "string" && p.message.trim().length > 0) {
        return {
          message: String(p.message).trim().slice(0, 200),
          subtext: String(p.subtext || "").trim().slice(0, 240),
        };
      }
    } catch {}
    return null;
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Extract first balanced-ish JSON object via regex (greedy match between
  // the first `{` and the last `}` — simple but works for our 2-field schema).
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    const extracted = tryParse(match[0]);
    if (extracted) return extracted;
  }

  // If we got here, the model returned something we couldn't JSON-parse.
  // Log the raw output so we can see what it actually sent.
  console.warn(
    "[daily-motivation] model returned non-JSON, falling back to regex extract:",
    cleaned.slice(0, 400)
  );

  // Regex-extract the two fields directly — robust against broken JSON,
  // unescaped quotes, truncation, or Gemini dropping the outer braces.
  // Matches `"message"` followed by any string up to the next unescaped ".
  const fieldRegex = (key: string) =>
    new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const msgMatch = cleaned.match(fieldRegex("message"));
  const subMatch = cleaned.match(fieldRegex("subtext"));
  if (msgMatch) {
    // Unescape \" and \\ if present
    const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return {
      message: unescape(msgMatch[1]).trim().slice(0, 200),
      subtext: subMatch
        ? unescape(subMatch[1]).trim().slice(0, 240)
        : "50k AI-niche followers = $5-10k/mo in inbound sponsor deals. One reel closer today.",
    };
  }

  // Last-resort: pull the first non-empty, non-brace line as the headline,
  // but strip any `"key":` prefix so we don't show raw JSON fragments.
  const firstRealLine = cleaned
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^[{}\[\],]+$/.test(l));
  const stripped = (firstRealLine || "")
    .replace(/^"[^"]+"\s*:\s*/, "") // drop `"message":`
    .replace(/^["']|["',]+$/g, "")   // drop surrounding quotes/commas
    .trim();

  return {
    message: (stripped || "Every reel is a free lottery ticket for angel checks, job offers, and inbound DMs.").slice(0, 200),
    subtext: "50k AI-niche followers = $5-10k/mo in inbound sponsor deals. One reel closer today.",
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const key = todayKey();

    if (!force) {
      const cached = await readCache(key);
      if (cached) {
        return NextResponse.json({ ...cached, date: key, cached: true });
      }
    }

    const fresh = await generateFresh();
    await writeCache(key, fresh);
    return NextResponse.json({ ...fresh, date: key, cached: false });
  } catch (err: any) {
    console.error("[daily-motivation] failed:", err);
    // Fallback so the banner never blocks the page
    return NextResponse.json({
      message: "Every reel is a free lottery ticket for angel checks, job offers, and inbound DMs.",
      subtext: "50k AI-niche followers = $5-10k/mo in sponsor deals. Today's post gets you closer.",
      date: todayKey(),
      cached: false,
      fallback: true,
    });
  }
}
