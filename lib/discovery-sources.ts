/**
 * Multi-source startup discovery.
 *
 * Runs in parallel, each source independent, any one failing does NOT block
 * the others. Results are merged + deduped by name in `runDiscovery`.
 *
 * Sources:
 *   1. TechCrunch RSS — AI category, filtered for funding stories
 *   2. yc-oss/yc-companies JSON mirror — recent YC batches tagged AI
 *   3. Multi-angle Perplexity — 5 narrow queries fired in parallel
 */

import { Startup } from "@/types";

// Common shape all 3 sources produce.
export type Candidate = Partial<Startup> & {
  name: string;
  _source: "techcrunch" | "yc" | "perplexity";
  _sourceUrl?: string;
};

// ───────────────────────────────────────────── TechCrunch RSS

const TC_FUNDING_FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://techcrunch.com/category/venture/feed/",
];

const BIG_NAMES_TO_SKIP = [
  "openai",
  "anthropic",
  "google",
  "meta",
  "microsoft",
  "apple",
  "amazon",
  "nvidia",
  "tesla",
  "x.ai",
  "xai",
  "mistral",
  "deepmind",
  "palantir",
  "cohere",
  "perplexity",
  "databricks",
  "cerebras",
  "snowflake",
  "hugging face",
  "stability",
];

function stripHtml(s: string): string {
  return (s || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Quick regex-based RSS parser — avoids pulling in xml2js/fast-xml-parser.
function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
}> {
  const items: Array<any> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const mm = block.match(r);
      return mm ? stripHtml(mm[1]) : "";
    };
    items.push({
      title: pick("title"),
      link: pick("link"),
      description: pick("description"),
      pubDate: pick("pubDate"),
    });
  }
  return items;
}

// Heuristic extraction of the startup's name from a TechCrunch headline.
// Handles common patterns: "X, a new Y...", "AI startup X files...",
// "Sources: X in talks to raise...", "X raised $5M..."
function guessStartupNameFromTitle(title: string): string | null {
  const t = title.trim();

  // "Sources: NAME in talks..." / "Exclusive: NAME raises..."
  let m = t.match(/^(?:Sources?|Exclusive|Scoop|Report):\s+([A-Z][A-Za-z0-9.\- ]{1,30}?)\s+(?:in talks|raises|raised|lands|secures|closes|is raising)/);
  if (m) return m[1].trim();

  // "NAME, a new ..." (Bond, a new social media platform)
  m = t.match(/^([A-Z][A-Za-z0-9.\-]{1,25}),\s+(?:a|an|the)\s+/);
  if (m) return m[1].trim();

  // "AI ... startup NAME ..."
  m = t.match(/\bstartup\s+([A-Z][A-Za-z0-9.\-]{1,25})\b/);
  if (m) return m[1].trim();

  // "NAME raised/raises $X..." / "NAME lands/secures/closes..."
  m = t.match(/^([A-Z][A-Za-z0-9.\- ]{1,30}?)\s+(?:raises|raised|lands|secures|closes|is raising|files for)\b/);
  if (m) return m[1].trim();

  // "NAME believes/wants/launches..."
  m = t.match(/^([A-Z][A-Za-z0-9.\-]{1,25})\s+(?:believes|launches|unveils|debuts|announces|emerges)\b/);
  if (m) return m[1].trim();

  return null;
}

function isBigNameOrBoring(name: string): boolean {
  const lower = name.toLowerCase();
  return BIG_NAMES_TO_SKIP.some((big) => lower === big || lower.includes(big));
}

function extractFundingFromText(text: string): { amount: string; round: string } {
  const amt = text.match(/\$(\d+(?:\.\d+)?)\s*(?:M|B|K|million|billion|thousand)/i);
  const round = text.match(/\b(Seed|Pre-seed|Series [A-F])\b/i);
  return {
    amount: amt ? amt[0].replace(/\s+/g, "") : "Unknown",
    round: round ? round[0] : "Unknown",
  };
}

export async function fetchTechCrunchStartups(
  excludeNames: Set<string>
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  for (const feedUrl of TC_FUNDING_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (content-engine)" },
      });
      if (!res.ok) {
        console.warn(`[discovery/tc] ${feedUrl} → ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRssItems(xml);

      for (const item of items) {
        const title = item.title;
        const desc = item.description;
        const combined = `${title}. ${desc}`;

        // Must look like a funding/startup story — skip pure analysis pieces
        const isFundingStory =
          /(raised|raising|raises|funding|seed round|series [a-f]|\$\d+\s*[MB])/i.test(combined);
        const isStartupStory =
          /\b(startup|founded|company)\b/i.test(combined) || isFundingStory;
        if (!isStartupStory) continue;

        // Skip items that are clearly about a big tech co
        const isAboutBigCo = BIG_NAMES_TO_SKIP.some((b) =>
          combined.toLowerCase().includes(b)
        );

        const name = guessStartupNameFromTitle(title);
        if (!name) continue;
        if (isBigNameOrBoring(name)) continue;
        if (isAboutBigCo && !isFundingStory) continue; // TC article about Anthropic etc — skip
        if (excludeNames.has(name.toLowerCase())) continue;

        const funding = extractFundingFromText(combined);

        candidates.push({
          name,
          funding_amount: funding.amount,
          funding_round: funding.round,
          description: desc.slice(0, 240) || title.slice(0, 240),
          investor: "Unknown",
          tech: "Unknown",
          scale: funding.amount.includes("B") ? "medium" : "small",
          builder_value: "medium",
          _source: "techcrunch",
          _sourceUrl: item.link,
        });
      }
    } catch (err: any) {
      console.warn(`[discovery/tc] ${feedUrl} failed:`, err?.message);
    }
  }

  console.log(`[discovery/tc] extracted ${candidates.length} candidates`);
  return candidates;
}

// ───────────────────────────────────────────── YC companies (yc-oss mirror)

const YC_AI_TAG_URL =
  "https://raw.githubusercontent.com/yc-oss/api/main/tags/artificial-intelligence.json";

// Only surface companies from "recent" batches (last ~18 months).
// yc-oss uses the full-word format ("Winter 2025"), not short codes.
const RECENT_BATCHES = new Set([
  "Winter 2024",
  "Summer 2024",
  "Winter 2025",
  "Summer 2025",
  "Winter 2026",
  "Summer 2026",
]);

export async function fetchYCCompanies(
  excludeNames: Set<string>
): Promise<Candidate[]> {
  try {
    const res = await fetch(YC_AI_TAG_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (content-engine)" },
      // This is a big JSON file — give it room.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[discovery/yc] ${YC_AI_TAG_URL} → ${res.status}`);
      return [];
    }
    const data = await res.json();
    const companies: any[] = Array.isArray(data) ? data : data.companies || [];

    // Batch ordering so newest-first (Summer 2026 > Winter 2026 > Summer 2025...)
    const batchRank = (b: string): number => {
      const m = b.match(/(Winter|Summer)\s+(\d{4})/);
      if (!m) return 0;
      return parseInt(m[2]) * 10 + (m[1] === "Summer" ? 5 : 0);
    };
    const sorted = [...companies].sort((a, b) => batchRank(b.batch || "") - batchRank(a.batch || ""));

    const YC_CANDIDATES_CAP = 20; // cap per run so we don't dump 200+ at once
    const candidates: Candidate[] = [];
    for (const c of sorted) {
      if (candidates.length >= YC_CANDIDATES_CAP) break;
      if (!c?.name) continue;
      if (excludeNames.has(c.name.toLowerCase())) continue;
      if (isBigNameOrBoring(c.name)) continue;

      const batch = c.batch || "";
      if (!RECENT_BATCHES.has(batch)) continue;

      // Skip acquired/dead companies — we want active startups
      const status = (c.status || "").toLowerCase();
      if (status === "acquired" || status === "dead" || status === "inactive") continue;

      // yc-oss batch looks like "Winter 2025"; shorten to "YC W25" for storage.
      const shortBatch = batch
        .replace(/^Winter\s+/, "W")
        .replace(/^Summer\s+/, "S")
        .replace(/(\d{2})(\d{2})$/, "$2");

      const desc =
        (c.one_liner && String(c.one_liner).slice(0, 240)) ||
        (c.long_description && String(c.long_description).replace(/\s+/g, " ").slice(0, 240)) ||
        "YC-backed AI startup";

      candidates.push({
        name: c.name,
        funding_amount: "YC-backed", // yc-oss doesn't expose $ amounts
        funding_round: `YC ${shortBatch}`,
        description: desc,
        investor: "Y Combinator",
        tech: Array.isArray(c.tags)
          ? c.tags.filter((t: string) => t.toLowerCase() !== "artificial intelligence").slice(0, 3).join(", ") || "AI"
          : "AI",
        scale: "small",
        builder_value: "high",
        _source: "yc",
        _sourceUrl: c.website || (c.slug ? `https://www.ycombinator.com/companies/${c.slug}` : undefined),
      });
    }

    console.log(`[discovery/yc] extracted ${candidates.length} candidates (from ${companies.length} AI-tagged companies)`);
    return candidates;
  } catch (err: any) {
    console.warn(`[discovery/yc] failed:`, err?.message);
    return [];
  }
}

// ───────────────────────────────────────────── Multi-angle Perplexity

// Each angle targets a distinct slice of the AI-startup universe. Because
// Perplexity ranks by how often a company is linked in its index, running
// narrower queries forces it past the "top 5 most-linked" ceiling.
const PERPLEXITY_ANGLES = [
  `Find 5 AI startups from RECENT Y Combinator batches (W25, S25, W26 — NOT older) that raised a post-YC Seed or Series A in 2025-2026. Include the YC batch in the round field.`,
  `Find 5 AI voice/video/creative-tool startups that raised Seed or Series A in the last 60 days (2025-2026). Focus on generative media, voice synthesis, video editing, image generation.`,
  `Find 5 AI developer-tool / AI-infrastructure startups that raised Seed or Series A in the last 60 days. Focus on agent frameworks, RAG infra, eval platforms, LLM ops, vector DBs.`,
  `Find 5 AI startups in vertical SaaS (healthcare, legal, finance, biotech, robotics, climate) that raised Seed or Series A in the last 60 days. Exclude big co's.`,
  `Find 5 AI agent / automation startups that announced funding in the last 60 days. Focus on workflow automation, autonomous agents, browser automation, coding agents, research agents.`,
];

const PIPE_FORMAT_INSTRUCTIONS = `
For each startup provide this EXACT format (one startup per line, pipe-separated, plain text, no markdown):

NAME | FUNDING_AMOUNT | ROUND_TYPE | ONE_LINE_DESCRIPTION | LEAD_INVESTOR | KEY_TECH_USED | SCALE | BUILDER_VALUE

- SCALE is exactly: small (under $10M) or medium ($10M-$50M)
- BUILDER_VALUE is exactly: high or medium
- Do NOT include companies over $50M or big names (OpenAI, Anthropic, Google, etc.)
- Do NOT include simple ChatGPT/API wrappers
- Do NOT add prose around the list. Just the pipe-separated lines.`;

async function queryPerplexityRaw(
  prompt: string,
  apiKey: string,
  model: string = "sonar"
): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity ${res.status}`);
  }
  const data = await res.json();
  let content: string = data.choices?.[0]?.message?.content || "";
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
  return content;
}

function parsePipeStartups(content: string, source: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of content.split("\n")) {
    const t = line.trim().replace(/^[\d\-\*\.\)\]]+\s*/, "");
    if (!t.includes("|") || (t.match(/\|/g) || []).length < 6) continue;
    const parts = t.split("|").map((p) =>
      p
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/\[\d+\]/g, "")
        .trim()
    );
    const name = parts[0];
    if (!name || name.length < 2 || name.length > 50) continue;
    if (/^(NAME|COMPANY|STARTUP)$/i.test(name)) continue; // header row
    if (isBigNameOrBoring(name)) continue;

    candidates.push({
      name,
      funding_amount: parts[1] || "Unknown",
      funding_round: parts[2] || "Unknown",
      description: parts[3] || "AI startup",
      investor: parts[4] || "Unknown",
      tech: parts[5] || "Unknown",
      scale: (parts[6] || "small").toLowerCase().includes("medium") ? "medium" : "small",
      builder_value: parts[7] || "medium",
      _source: "perplexity",
    });
  }
  return candidates;
}

export async function fetchMultiAnglePerplexity(
  perplexityKey: string,
  excludeNames: Set<string>
): Promise<Candidate[]> {
  const exclusionBlurb =
    excludeNames.size > 0
      ? `\n\nCRITICAL — DO NOT include any of the following startups (already covered):\n${Array.from(
          excludeNames
        )
          .slice(0, 80)
          .map((n) => `- ${n}`)
          .join("\n")}`
      : "";

  const queries = PERPLEXITY_ANGLES.map(
    (angle) => `${angle}\n${PIPE_FORMAT_INSTRUCTIONS}${exclusionBlurb}`
  );

  const results = await Promise.allSettled(
    queries.map((q) => queryPerplexityRaw(q, perplexityKey, "sonar-pro"))
  );

  const allCandidates: Candidate[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const parsed = parsePipeStartups(r.value, `perplexity#${i}`);
      const filtered = parsed.filter((c) => !excludeNames.has(c.name.toLowerCase()));
      console.log(`[discovery/perplexity#${i + 1}] parsed ${parsed.length}, kept ${filtered.length}`);
      allCandidates.push(...filtered);
    } else {
      console.warn(`[discovery/perplexity#${i + 1}] failed:`, r.reason?.message || r.reason);
    }
  });

  return allCandidates;
}

// ───────────────────────────────────────────── Orchestrator + dedupe

export async function fetchAllSources(
  perplexityKey: string,
  existingNames: string[]
): Promise<{
  candidates: Candidate[];
  stats: { techcrunch: number; yc: number; perplexity: number; afterDedupe: number };
}> {
  const excludeNames = new Set(existingNames.map((n) => n.toLowerCase()));

  const [tcResult, ycResult, ppResult] = await Promise.allSettled([
    fetchTechCrunchStartups(excludeNames),
    fetchYCCompanies(excludeNames),
    fetchMultiAnglePerplexity(perplexityKey, excludeNames),
  ]);

  const tc = tcResult.status === "fulfilled" ? tcResult.value : [];
  const yc = ycResult.status === "fulfilled" ? ycResult.value : [];
  const pp = ppResult.status === "fulfilled" ? ppResult.value : [];

  if (tcResult.status === "rejected") console.warn("[discovery/tc] rejected:", tcResult.reason);
  if (ycResult.status === "rejected") console.warn("[discovery/yc] rejected:", ycResult.reason);
  if (ppResult.status === "rejected") console.warn("[discovery/perplexity] rejected:", ppResult.reason);

  // Dedupe by lowercased name. Priority: Perplexity > YC > TechCrunch
  // (Perplexity has the richest metadata; YC has reliable names; TC has URLs).
  // Actually — prefer whichever source has the most metadata for a given name.
  const seen = new Map<string, Candidate>();
  for (const c of [...pp, ...yc, ...tc]) {
    const key = c.name.toLowerCase().trim();
    if (!key) continue;
    if (excludeNames.has(key)) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, c);
    } else {
      // Merge — prefer non-"Unknown" fields from the new one
      seen.set(key, {
        ...existing,
        funding_amount:
          existing.funding_amount && existing.funding_amount !== "Unknown"
            ? existing.funding_amount
            : c.funding_amount,
        funding_round:
          existing.funding_round && existing.funding_round !== "Unknown"
            ? existing.funding_round
            : c.funding_round,
        investor:
          existing.investor && existing.investor !== "Unknown"
            ? existing.investor
            : c.investor,
        description:
          (existing.description?.length || 0) > (c.description?.length || 0)
            ? existing.description
            : c.description,
        tech:
          existing.tech && existing.tech !== "Unknown" ? existing.tech : c.tech,
      });
    }
  }

  const candidates = Array.from(seen.values());
  const stats = {
    techcrunch: tc.length,
    yc: yc.length,
    perplexity: pp.length,
    afterDedupe: candidates.length,
  };
  console.log(
    `[discovery] sources: tc=${stats.techcrunch}, yc=${stats.yc}, pp=${stats.perplexity} → ${stats.afterDedupe} unique after dedupe`
  );
  return { candidates, stats };
}
