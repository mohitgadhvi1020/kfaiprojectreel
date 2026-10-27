import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getActiveSettings } from "@/lib/settings";
import { scrapeOgBatch, OgResult } from "@/lib/visuals/og-scrape";
import { searchYouTubeBatch, YouTubeVideo } from "@/lib/visuals/youtube-search";
import { extractEntities } from "@/lib/visuals/extract-entities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-request cache. Same input → same output for 24h. Saves the YouTube
// quota and keeps OG fetches off launch-page CDNs.
const CACHE_DIR = path.join(process.cwd(), ".data", "visuals-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface FindRequest {
  /** Identifier we'll use as the cache key. Caller passes the topic idx,
   *  job id, or any stable string. If omitted we hash the inputs. */
  cacheKey?: string;
  /** Source URLs to OG-scrape (the explainer's `topic.sources` array, or a
   *  monitored item's url). Up to 5; extras are ignored. */
  sources?: string[];
  /** Free-text content we extract entities from for YouTube search.
   *  Typically the script (`scriptPreview`) or topic title + summary. */
  text?: string;
  /** Override the entity list — if the caller already has them. */
  entities?: string[];
}

interface VisualsBundle {
  generatedAt: string;
  cached: boolean;
  entities: string[];
  hero: OgResult[]; // OG-scraped hero shots, in source order
  videos: YouTubeVideo[]; // YouTube demo/tutorial candidates
  warnings: string[]; // human-readable notes about what was skipped + why
}

function hashKey(...parts: string[]): string {
  // Tiny djb2 hash — we just need a stable filesystem-safe key, not crypto.
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h).toString(36);
}

function readCache(key: string): VisualsBundle | null {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as VisualsBundle;
    const age = Date.now() - new Date(parsed.generatedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
}

function writeCache(key: string, bundle: VisualsBundle) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(bundle, null, 2)
    );
  } catch (err) {
    console.error("[visuals] cache write failed:", err);
  }
}

// POST /api/visuals/find
// Body: { cacheKey?, sources?: string[], text?: string, entities?: string[] }
// Returns: VisualsBundle
export async function POST(request: NextRequest) {
  let body: FindRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sources = (body.sources || [])
    .filter((s) => typeof s === "string" && s.startsWith("http"))
    .slice(0, 5);
  const text = (body.text || "").trim();

  if (sources.length === 0 && !text && !body.entities?.length) {
    return NextResponse.json(
      { error: "Provide at least one of: sources, text, entities" },
      { status: 400 }
    );
  }

  const key =
    body.cacheKey ||
    hashKey(...sources, text.slice(0, 200), (body.entities || []).join(","));

  const cached = readCache(key);
  const force = request.nextUrl.searchParams.get("refresh") === "1";
  if (cached && !force) {
    return NextResponse.json(cached);
  }

  const settings = await getActiveSettings();
  const warnings: string[] = [];

  // --- Tier 1: OG scrape. Always runs. No keys needed. ---
  const ogPromise = sources.length > 0 ? scrapeOgBatch(sources) : Promise.resolve([]);

  // --- Entity resolution for YouTube search. Caller-provided entities win;
  //     otherwise we derive from `text` via gpt-4o-mini.
  let entities: string[] = body.entities || [];
  if (entities.length === 0 && text) {
    entities = await extractEntities(text, settings.openai_api_key || "", 4);
  }

  // --- Tier 2: YouTube. Only runs if a YT key is configured.
  let videosPromise: Promise<YouTubeVideo[]>;
  if (!settings.youtube_api_key) {
    warnings.push(
      "YouTube videos skipped — set YOUTUBE_API_KEY in your env to enable Tier 2."
    );
    videosPromise = Promise.resolve([]);
  } else if (entities.length === 0) {
    warnings.push(
      "No entities extracted from input — YouTube search skipped (nothing to query)."
    );
    videosPromise = Promise.resolve([]);
  } else {
    // Build queries: "<entity> demo" generally surfaces the strongest B-roll.
    // If "demo" returns nothing for niche tools we'll still see results
    // because YouTube's relevance ranking is forgiving.
    const queries = entities.slice(0, 3).map((e) => `${e} demo`);
    videosPromise = searchYouTubeBatch(
      queries,
      settings.youtube_api_key,
      4
    );
  }

  const [hero, videos] = await Promise.all([ogPromise, videosPromise]);

  if (sources.length > 0 && hero.length === 0) {
    warnings.push(
      `OG scrape returned no hero images for ${sources.length} URL(s) — pages may block bots or lack OG tags.`
    );
  }

  const bundle: VisualsBundle = {
    generatedAt: new Date().toISOString(),
    cached: false,
    entities,
    hero,
    videos,
    warnings,
  };

  writeCache(key, bundle);
  return NextResponse.json(bundle);
}
