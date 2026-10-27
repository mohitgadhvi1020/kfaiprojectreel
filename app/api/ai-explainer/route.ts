import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getActiveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache lives on disk so the first user of the day pays for the LLM call and
// everyone else (and reloads) get an instant response. Six hours is a sensible
// ceiling — AI news cycles fast but not THAT fast, and this isn't a newsroom.
const CACHE_PATH = path.join(process.cwd(), ".data", "ai-explainer-cache.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface ExplainerTopic {
  title: string;
  category: string; // "model" | "tool" | "skill" | "workflow" | "research"
  summary: string; // 2-3 sentence plain-English explanation
  why: string; // 1 sentence — what creator can show on camera (the demo angle)
  // --- post-strategy fields. Filled by the same Perplexity call so research
  // and content angle live together. If the model can't fill one cleanly,
  // it returns an empty string and the UI hides that field.
  hook: string; // first 3 seconds of the video — scroll-stopper line
  bestFormat: string; // "tutorial" | "hot_take" | "faceoff" | "demo" | "list" | "reaction"
  engagementBait: string; // a question / poll / claim that drives comments
  growthScore: number; // 1-10 self-rated by model: how likely is this to drive follows for a small AI account
  underexposed: boolean; // true if creators haven't covered this yet (vs the 50th GPT-5 hot take)
  // --- end post-strategy fields
  sources: string[]; // URLs from the web search
}

interface ExplainerPayload {
  generatedAt: string;
  topics: ExplainerTopic[];
}

// Kept short on purpose — Perplexity's sonar models follow the user message
// closely and clam up if the system message is heavy with "don't" rules.
// Real instructions go in the user message below.
const SYSTEM_PROMPT = `You are a content strategist for a small AI Instagram/short-form creator (under 10k followers). You search the web for AI/tech developments AND filter every candidate through the lens "would this make a post that earns a follow, save, or comment?" You return strict JSON.`;

function buildUserPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Find 6 AI/tech developments from the last 14 days that would make great short-form Instagram Reels for a small AI creator (under 10k followers).

Look for things creators can DEMO on camera: new AI tools to install and try, new model capabilities with a clear before/after, specific features inside existing tools (ChatGPT modes, Cursor tricks, Midjourney params), multi-tool workflows (e.g. "Whisper → Claude → ElevenLabs"), or research with a working public demo.

Prefer underexposed niche tools and tricks over saturated headlines (yet another GPT-5 reaction). Mix the categories.

For each topic return JSON with these exact fields:
- title: 6-10 words, concrete, no hype words like "game-changing" or "revolutionary"
- category: "model" | "tool" | "skill" | "workflow" | "research"
- summary: 2-3 plain sentences naming the specific tool/model and what it does
- why: ONE sentence describing what to show on camera, e.g. "Demo: paste a YouTube URL, get a 30-second teaser cut with subtitles"
- hook: ONE punchy sentence (max 12 words) — the first 3 seconds of the video, e.g. "I generated a working iPhone app from one sketch"
- bestFormat: "tutorial" | "hot_take" | "faceoff" | "demo" | "list" | "reaction"
- engagementBait: ONE sentence question/poll/claim for the caption to drive comments, e.g. "Would you ship this to a paying client? Yes / Hell no below"
- growthScore: integer 1-10, your honest read of how well this performs for a small AI account (10 = viral, 5 = average, 3 = weak)
- underexposed: true if most AI creators haven't covered this yet, false if it's everywhere
- sources: array of 1-3 URLs you grounded against (official post, docs, repo, HuggingFace)

Return ONLY a JSON object, no prose, no markdown fences:
{"topics":[{"title":"...","category":"...","summary":"...","why":"...","hook":"...","bestFormat":"...","engagementBait":"...","growthScore":7,"underexposed":true,"sources":["https://..."]}]}

Aim for 6 items. If only 4 are genuinely strong, return 4. Don't repeat the same product (one ChatGPT max, one Claude max).`;
}

function readCache(): ExplainerPayload | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ExplainerPayload;
    const age = Date.now() - new Date(parsed.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: ExplainerPayload) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("[ai-explainer] cache write failed:", err);
  }
}

async function fetchExplainer(perplexityKey: string): Promise<ExplainerPayload> {
  // Perplexity sonar-pro is purpose-built for live web research and returns a
  // top-level `citations` array — we trust those URLs more than what the
  // model writes inline (models occasionally hallucinate URLs even when web-
  // grounded; the citations field reflects pages it actually loaded).
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perplexityKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt() },
      ],
      // Low temp: factual reporting, not creative riffs.
      temperature: 0.2,
      // Native recency filter — better than asking the model to filter dates
      // itself. "month" gives us ~30-day window, more forgiving than "week"
      // (sonar sometimes returns nothing on tight windows).
      search_recency_filter: "month",
      // Default max_tokens is small on Perplexity; bump it so 6 detailed
      // topics + sources fit comfortably.
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  let raw: string = data.choices?.[0]?.message?.content || "";

  // sonar-reasoning models leak <think>...</think> blocks; sonar-pro
  // shouldn't but strip defensively in case we change models later.
  raw = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();

  // Top-level citations from Perplexity — array of URLs the model actually
  // grounded against. We use these as a fallback / supplement to whatever
  // URLs the model put in the per-topic `sources` field.
  const allCitations: string[] = Array.isArray(data.citations) ? data.citations : [];

  // Perplexity often wraps JSON in markdown fences or includes prose. Be
  // lenient — strip fences and grab the first {...} block we can find.
  let jsonText = raw.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  let parsed: { topics?: ExplainerTopic[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      `Could not parse model output as JSON. First 200 chars: ${raw.slice(0, 200)}`
    );
  }

  // Strip Perplexity's [1] [2] inline citation markers — they're noise in
  // the rendered card.
  const cleanText = (s: string) => s.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();

  const allowedFormats = new Set([
    "tutorial",
    "hot_take",
    "faceoff",
    "demo",
    "list",
    "reaction",
  ]);

  const topics: ExplainerTopic[] = (parsed.topics || []).map((t: any, idx: number) => {
    const modelSources: string[] = Array.isArray(t.sources)
      ? t.sources.filter((s: any) => typeof s === "string" && s.startsWith("http"))
      : [];
    // If the model didn't attach URLs to a topic, fall back to a slice of
    // the global citations array — better than showing zero sources, since
    // Perplexity actually grounded against those pages.
    const sources =
      modelSources.length > 0
        ? modelSources
        : allCitations.slice(idx * 2, idx * 2 + 2);
    const fmtRaw = String(t.bestFormat || "demo").toLowerCase().replace(/\s+/g, "_");
    const bestFormat = allowedFormats.has(fmtRaw) ? fmtRaw : "demo";
    const growthScoreRaw = Number(t.growthScore);
    const growthScore =
      Number.isFinite(growthScoreRaw) && growthScoreRaw >= 1 && growthScoreRaw <= 10
        ? Math.round(growthScoreRaw)
        : 5;
    return {
      title: cleanText(String(t.title || "")),
      category: String(t.category || "tool").toLowerCase(),
      summary: cleanText(String(t.summary || "")),
      why: cleanText(String(t.why || "")),
      hook: cleanText(String(t.hook || "")),
      bestFormat,
      engagementBait: cleanText(String(t.engagementBait || "")),
      growthScore,
      underexposed: t.underexposed === true,
      sources,
    };
  });

  // Sort: highest growthScore first, ties broken by underexposed=true. The
  // creator scans top-down and the strongest posts should be at the top.
  topics.sort((a, b) => {
    if (b.growthScore !== a.growthScore) return b.growthScore - a.growthScore;
    if (a.underexposed !== b.underexposed) return a.underexposed ? -1 : 1;
    return 0;
  });

  if (topics.length === 0) {
    throw new Error("Model returned 0 topics");
  }

  return {
    generatedAt: new Date().toISOString(),
    topics,
  };
}

// GET /api/ai-explainer        → cached (or freshly fetched if cache stale)
// GET /api/ai-explainer?refresh=1 → force refresh, ignore cache
export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("refresh") === "1";

  if (!force) {
    const cached = readCache();
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  try {
    const settings = await getActiveSettings();
    if (!settings.perplexity_api_key) {
      return NextResponse.json(
        { error: "Perplexity API key not configured. Add it in Settings." },
        { status: 400 }
      );
    }
    const payload = await fetchExplainer(settings.perplexity_api_key);
    writeCache(payload);
    return NextResponse.json({ ...payload, cached: false });
  } catch (err: any) {
    console.error("[ai-explainer] fetch failed:", err);
    // If we have ANY cached payload (even stale), serve it as a degraded
    // fallback so the UI never goes empty.
    const stale = (() => {
      try {
        if (!fs.existsSync(CACHE_PATH)) return null;
        return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as ExplainerPayload;
      } catch {
        return null;
      }
    })();
    if (stale) {
      return NextResponse.json({
        ...stale,
        cached: true,
        stale: true,
        warning: err.message || "Live refresh failed; showing last cached topics.",
      });
    }
    return NextResponse.json(
      { error: err.message || "Failed to fetch AI explainer topics" },
      { status: 500 }
    );
  }
}
