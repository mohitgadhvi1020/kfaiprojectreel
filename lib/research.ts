import { Startup, XTip, TrendingTopic } from "@/types";
import { DISCOVERY_PROMPTS, RESEARCH_PROMPTS, MASTER_RESEARCH_PROMPT } from "@/config/api-keys";
import { fetchAllSources } from "@/lib/discovery-sources";

// sonar-deep-research can take several minutes to return headers. Node's global
// fetch defaults to a 300s headers timeout, which kills those calls mid-flight
// (HeadersTimeoutError). We use undici's OWN fetch + an Agent with generous
// timeouts — they must come from the SAME undici instance (passing a standalone
// undici Agent to Node's *global* fetch throws "fetch failed" immediately).
let _ppxClient: { fetch: any; dispatcher: any } | null = null;
async function getPerplexityClient(): Promise<{ fetch: any; dispatcher: any }> {
  if (_ppxClient) return _ppxClient;
  try {
    const u: any = await import("undici");
    _ppxClient = {
      fetch: u.fetch,
      dispatcher: new u.Agent({
        headersTimeout: 600_000, // 10 min — deep-research is slow
        bodyTimeout: 600_000,
        connectTimeout: 30_000,
      }),
    };
  } catch {
    // undici not importable; fall back to global fetch (300s default timeout).
    _ppxClient = { fetch: (globalThis as any).fetch, dispatcher: undefined };
  }
  return _ppxClient;
}

async function queryPerplexity(
  prompt: string,
  apiKey: string,
  model: string = "sonar-pro"
): Promise<{ content: string; citations: string[] }> {
  const { fetch: doFetch, dispatcher } = await getPerplexityClient();
  const MAX_ATTEMPTS = 2;
  let response: any = null;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await doFetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
        }),
        ...(dispatcher ? { dispatcher } : {}),
      });
      break; // got a response (ok or not) — handle below
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      const timeoutish = /timeout|UND_ERR|aborted|fetch failed/i.test(msg);
      if (!timeoutish || attempt === MAX_ATTEMPTS) {
        throw new Error(`Perplexity request failed (${model}) after ${attempt} attempt(s): ${msg}`);
      }
      console.warn(`[perplexity] ${model} attempt ${attempt} failed (${msg.slice(0, 80)}); retrying...`);
    }
  }

  if (!response) {
    throw new Error(`Perplexity request failed (${model}): ${String(lastErr?.message || lastErr)}`);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";

  // Reasoning models (sonar-reasoning, sonar-reasoning-pro, sonar-deep-research)
  // wrap their chain-of-thought in <think>...</think> at the start of the response.
  // Strip it — we only want the final answer.
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();

  return {
    content,
    citations: data.citations || [],
  };
}

function clean(s: string): string {
  return (s || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\[|\]/g, "")
    .replace(/^#+\s*/g, "")
    .trim();
}

function parsePipeLines(text: string, minPipes: number): string[][] {
  const results: string[][] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.includes("|") && (t.match(/\|/g) || []).length >= minPipes) {
      const parts = t
        .replace(/^[\d\-\*\.\)\]]+\s*/, "")
        .split("|")
        .map((p) => clean(p));
      if (parts[0] && parts[0].length > 1) results.push(parts);
    }
  }
  return results;
}

const SKIP_WORDS = [
  "NAME", "FUNDING", "ROUND", "DESCRIPTION", "HEADLINE", "COMPANY",
  "CATEGORY", "TOPIC", "BIG", "SMALL", "EXAMPLE", "AUTHOR", "POST_SUMMARY",
];

function parseStartups(content: string): Partial<Startup>[] {
  // If Perplexity refused to answer (model says it can't find data), return empty immediately
  const refusalPhrases = [
    "cannot provide the requested list",
    "search results do not contain",
    "do not have access to",
    "unable to provide",
    "i cannot fulfill",
    "i'm unable to",
  ];
  const lowerContent = content.toLowerCase();
  if (refusalPhrases.some((p) => lowerContent.includes(p))) {
    return [];
  }

  const startups: Partial<Startup>[] = [];
  const pipeStartups = parsePipeLines(content, 2);

  for (const parts of pipeStartups) {
    if (SKIP_WORDS.some((w) => parts[0].toUpperCase().includes(w))) continue;
    // BUILDER_VALUE is parts[7]; parts[6] is SCALE — skip if builder_value is "low"
    const builderVal = (parts[7] || parts[6] || "").toLowerCase();
    if (builderVal && builderVal.includes("low") && !builderVal.includes("flow")) continue;
    // Skip header rows or obvious non-data lines
    if (!parts[1] || parts[1].length === 0) continue;

    const scaleTag = (parts[6] || "").toLowerCase().trim();
    let parsedScale: "small" | "medium" = "small";
    if (scaleTag === "medium" || scaleTag === "med") {
      parsedScale = "medium";
    } else if (parts[1]?.match(/\d+/)) {
      const amount = parseInt(parts[1].replace(/[^0-9]/g, ""));
      parsedScale = amount >= 10 ? "medium" : "small";
    }

    startups.push({
      name: parts[0],
      funding_amount: parts[1] || "Unknown",
      funding_round: parts[2] || "Unknown",
      description: parts[3] || "AI startup",
      investor: parts[4] || "Unknown",
      tech: parts[5] || "Unknown",
      builder_value: parts[7] || parts[6] || "",
      scale: parsedScale,
    });
  }

  if (startups.length === 0) {
    const dollarPattern = /\$(\d+[\d.]*\s*[MBK](?:illion)?)/gi;
    // Phrases that signal Perplexity meta-commentary, not a real startup name.
    // When sonar-pro can't find good matches it often narrates: "The search
    // results primarily feature mega-funded companies ($200M+) like xAI..."
    // — the dollar amount gets matched and the prose fragment before the
    // first "(" becomes the fake name. Reject those.
    const metaPrefixes = [
      "the search results",
      "based on",
      "here are",
      "here is",
      "according to",
      "i found",
      "i was unable",
      "unfortunately",
      "note:",
      "disclaimer",
      "as of",
      "in summary",
      "overall",
      "however,",
      "additionally",
    ];
    const looksLikeProse = (name: string): boolean => {
      const lower = name.toLowerCase().trim();
      if (metaPrefixes.some((p) => lower.startsWith(p))) return true;
      // Real startup names are almost always 1-4 words. Anything longer is a sentence.
      const wordCount = lower.split(/\s+/).filter(Boolean).length;
      if (wordCount > 5) return true;
      // Contains a comma = very likely prose ("xAI, Anysphere, Safe Superintelligence")
      if (/,/.test(name)) return true;
      // Common prose nouns that never appear in startup names
      if (/\b(results?|companies|data|information|available|granular)\b/i.test(name)) return true;
      return false;
    };

    for (const line of content.split("\n")) {
      const t = clean(line);
      const dollarMatch = t.match(dollarPattern);
      if (dollarMatch && t.length > 10) {
        const name = t.replace(/^\d+[.\):\]]+\s*/, "").split(/[:\-\(\|]/)[0].trim();
        if (name.length > 1 && name.length < 80 && !looksLikeProse(name)) {
          const roundMatch = t.match(/\b(Seed|Pre-seed|Series [A-Z]|Series A|Series B|Series C)\b/i);
          const amt = parseInt(dollarMatch[0].replace(/[^0-9]/g, ""));
          startups.push({
            name: clean(name), funding_amount: dollarMatch[0],
            funding_round: roundMatch ? roundMatch[0] : "Unknown",
            description: t.substring(0, 120), investor: "Unknown", tech: "Unknown",
            builder_value: "", scale: amt >= 10 ? "medium" : "small",
          });
        }
      }
    }
  }

  return startups.slice(0, 6);
}

function parseXTips(content: string): Partial<XTip>[] {
  const tips: Partial<XTip>[] = [];
  const pipeTips = parsePipeLines(content, 3);

  for (const parts of pipeTips) {
    if (SKIP_WORDS.some((w) => parts[0].toUpperCase().includes(w))) continue;
    const rp = (parts[3] || "").toLowerCase();
    if (rp.includes("low") && !rp.includes("flow") && !rp.includes("below")) continue;
    if (!rp.includes("high") && !rp.includes("medium") && !rp.includes("med")) continue;

    const maybeUrl = (parts[4] || "").trim();
    tips.push({
      author: parts[0].replace(/^@+/, ""), post_summary: parts[1] || "",
      practical_takeaway: parts[2] || "", reel_potential: parts[3] || "medium",
      post_url: maybeUrl.startsWith("http") ? maybeUrl : "", post_snippet: "",
    });
  }

  if (tips.length === 0) {
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (t.length < 20) continue;
      if (t.includes("|") && (t.match(/\|/g) || []).length >= 2) {
        const p = t.replace(/^[\d\-\*\.\)\]]+\s*/, "").split("|").map((x) => clean(x));
        if (p[0] && p[0].length > 1 && !SKIP_WORDS.some((w) => p[0].toUpperCase().includes(w))) {
          const mu = (p[4] || "").trim();
          tips.push({
            author: p[0].replace(/^@+/, ""), post_summary: p[1] || t.substring(0, 200),
            practical_takeaway: p[2] || "", reel_potential: "medium",
            post_snippet: "", post_url: mu.startsWith("http") ? mu : "",
          });
        }
      }
      if (tips.length >= 8) break;
    }
  }

  return tips.slice(0, 8);
}

function parseTrending(content: string): Partial<TrendingTopic>[] {
  const trending: Partial<TrendingTopic>[] = [];
  const pipeTrending = parsePipeLines(content, 1);

  for (const parts of pipeTrending) {
    if (SKIP_WORDS.some((w) => parts[0].toUpperCase().includes(w))) continue;
    trending.push({ topic: parts[0], platform: parts[1] || "Instagram", angle: parts[2] || "" });
  }

  if (trending.length === 0) {
    for (const line of content.split("\n")) {
      const m = line.trim().match(/^\d+[.\):\]]\s*(.+)/);
      if (m) {
        const item = clean(m[1]);
        if (item.length > 3 && item.length < 200) {
          const topic = item.split(/[:\|]/)[0].trim().substring(0, 80);
          if (topic.length > 3) trending.push({ topic, platform: "Instagram", angle: item.substring(0, 150) });
        }
      }
    }
  }

  return trending.slice(0, 5);
}

export async function runDiscovery(
  perplexityKey: string,
  excludeStartupNames: string[] = []
): Promise<{
  startups: Partial<Startup>[]; xTips: Partial<XTip>[]; trending: Partial<TrendingTopic>[];
  rawStartups: string; rawXBuilders: string; rawTrending: string;
}> {
  // Fire all 3 discovery sources in parallel (TechCrunch RSS + yc-oss JSON +
  // 5 narrow Perplexity queries), plus the existing X-tips and trending calls.
  // Everything is parallelized so the user only waits the length of the
  // slowest single call.
  const [sourceResults, xBuilderRes, trendingRes] = await Promise.all([
    fetchAllSources(perplexityKey, excludeStartupNames),
    queryPerplexity(DISCOVERY_PROMPTS.x_builder_insights, perplexityKey),
    queryPerplexity(DISCOVERY_PROMPTS.trending_content, perplexityKey, "sonar"),
  ]);

  const { candidates, stats } = sourceResults;

  // Map Candidate[] back to Partial<Startup>[] — strip the internal _source
  // / _sourceUrl fields before handing off to the insert pipeline.
  const startups: Partial<Startup>[] = candidates.map((c) => {
    const { _source, _sourceUrl, ...rest } = c;
    return rest;
  });

  // Compose a human-readable raw_startups string for the run record so the
  // user can still debug what each source returned.
  const rawStartups =
    `[discovery summary] techcrunch=${stats.techcrunch}, yc=${stats.yc}, perplexity=${stats.perplexity}, after_dedupe=${stats.afterDedupe}\n\n` +
    candidates
      .map(
        (c) =>
          `${c.name} | ${c.funding_amount} | ${c.funding_round} | ${c.description} | ${c.investor} | ${c.tech} | ${c.scale} | ${c.builder_value} | [source: ${c._source}${c._sourceUrl ? ` ${c._sourceUrl}` : ""}]`
      )
      .join("\n");

  return {
    startups,
    xTips: parseXTips(xBuilderRes.content),
    trending: parseTrending(trendingRes.content),
    rawStartups,
    rawXBuilders: xBuilderRes.content,
    rawTrending: trendingRes.content,
  };
}

function parseMasterResponse(raw: string): {
  founders: string;
  technical: string;
  product: string;
  market: string;
  business: string;
  contrarian: string;
} {
  const sections: Record<string, string> = {
    FOUNDERS: "",
    TECHNICAL: "",
    PRODUCT: "",
    MARKET: "",
    BUSINESS: "",
    CONTRARIAN: "",
  };

  // Accept both === SECTION === and ## SECTION heading formats.
  // Deep-research model tends to write markdown H2 headers instead of === ===.
  const names = "FOUNDERS|TECHNICAL|PRODUCT|MARKET|BUSINESS|CONTRARIAN";
  const regex = new RegExp(
    `(?:^|\\n)(?:===\\s*(${names})\\s*===|##+\\s+(${names})\\b)`,
    "gi"
  );

  type Part = { name: string; headerStart: number; bodyStart: number };
  const parts: Part[] = [];
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const name = (match[1] || match[2] || "").toUpperCase();
    if (!name) continue;
    parts.push({
      name,
      headerStart: match.index,
      bodyStart: match.index + match[0].length,
    });
  }

  for (let i = 0; i < parts.length; i++) {
    const end = i + 1 < parts.length ? parts[i + 1].headerStart : raw.length;
    const body = raw.slice(parts[i].bodyStart, end).trim();
    // Keep the longest occurrence if a section name appears twice
    if (body.length > sections[parts[i].name].length) {
      sections[parts[i].name] = body;
    }
  }

  return {
    founders: sections.FOUNDERS,
    technical: sections.TECHNICAL,
    product: sections.PRODUCT,
    market: sections.MARKET,
    business: sections.BUSINESS,
    contrarian: sections.CONTRARIAN,
  };
}

export async function runDeepResearch(
  startup: { name: string; funding_amount: string; funding_round: string; description: string },
  perplexityKey: string
): Promise<{
  technical: { content: string; citations: string[] };
  product: { content: string; citations: string[] };
  market: { content: string; citations: string[] };
  founders: { content: string; citations: string[] };
  business: { content: string; citations: string[] };
  contrarian: { content: string; citations: string[] };
  viral: { content: string; citations: string[] };
  qualityScore: number;
  passed: boolean;
  warning: string;
}> {
  // ONE consolidated sonar-deep-research call covering all 6 research streams.
  // This takes 2-5 minutes but hits no rate limits and gets maximum accuracy.
  // Viral is a separate lightweight sonar call (different kind of info).
  // Detect when a model refused the task (knowledge-cutoff disclaimers etc.)
  // instead of actually researching. These responses are useless and should
  // trigger a fallback to `sonar-pro`, which just searches the web and doesn't
  // moralize about dates.
  const looksLikeRefusal = (text: string): boolean => {
    if (!text) return true;
    const lower = text.toLowerCase();
    const markers = [
      "i cannot complete this research",
      "i must be direct",
      "my knowledge cutoff",
      "knowledge cutoff is",
      "i have no real-time access",
      "i cannot search the web",
      "i cannot reliably provide",
      "i cannot substitute for real-time",
      "would that approach work",
      "beyond my training data",
    ];
    // Refusal responses typically hit multiple of these markers AND have almost
    // no section markers from the master prompt.
    const hits = markers.filter((m) => lower.includes(m)).length;
    const hasSectionMarkers = /===\s*(technical|product|market|founders|business|contrarian)/i.test(text);
    return hits >= 2 && !hasSectionMarkers;
  };

  const MASTER = MASTER_RESEARCH_PROMPT(
    startup.name,
    startup.funding_amount,
    startup.funding_round,
    startup.description
  );

  let masterResult: { content: string; citations: string[] };
  let masterModel = "sonar-deep-research";

  const [firstMaster, viral] = await Promise.all([
    queryPerplexity(MASTER, perplexityKey, "sonar-deep-research"),
    queryPerplexity(RESEARCH_PROMPTS.viral(), perplexityKey, "sonar"),
  ]);

  if (looksLikeRefusal(firstMaster.content)) {
    console.warn(
      `[research] sonar-deep-research refused on "${startup.name}" — retrying with sonar-pro`
    );
    try {
      masterResult = await queryPerplexity(MASTER, perplexityKey, "sonar-pro");
      masterModel = "sonar-pro";
      if (looksLikeRefusal(masterResult.content)) {
        console.warn(`[research] sonar-pro also refused — retrying with sonar`);
        masterResult = await queryPerplexity(MASTER, perplexityKey, "sonar");
        masterModel = "sonar";
      }
    } catch (err: any) {
      console.warn(`[research] fallback query failed, using original refusal:`, err?.message);
      masterResult = firstMaster;
    }
  } else {
    masterResult = firstMaster;
  }

  console.log(`[research] master research model used: ${masterModel}`);

  const parsed = parseMasterResponse(masterResult.content);
  const citations = masterResult.citations;

  // If parsing failed (section markers missing), fall back to putting the whole
  // response in technical — still captures everything.
  const hasAnySection = Object.values(parsed).some((v) => v && v.length > 50);
  const fallback = hasAnySection ? "" : masterResult.content;

  const technical = { content: parsed.technical || fallback, citations };
  const product = { content: parsed.product, citations };
  const market = { content: parsed.market, citations };
  const founders = { content: parsed.founders, citations };
  const business = { content: parsed.business, citations };
  const contrarian = { content: parsed.contrarian, citations };

  const rawName = startup.name.trim();
  const nameLower = rawName.toLowerCase();
  const variants = new Set<string>();
  variants.add(nameLower);
  variants.add(nameLower.replace(/\s/g, ""));
  variants.add(nameLower.replace(/[^a-z0-9]/g, ""));
  // Split on whitespace/punctuation AND on CamelCase boundaries so names like
  // "PlayerZero" also match "Player Zero" / "Player" / "Zero" in prose.
  const camelSplit = rawName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  for (const p of camelSplit.split(/[\s.\-_]+/)) {
    if (p.length >= 4) variants.add(p);
  }
  for (const p of nameLower.split(/[\s.\-_]+/)) {
    if (p.length >= 3) variants.add(p);
  }

  const checkName = (text: string) =>
    Array.from(variants).some((v) => v.length >= 3 && text.toLowerCase().includes(v));

  const techHas = checkName(technical.content);
  const prodHas = checkName(product.content);
  const mktHas = checkName(market.content);
  const fdrHas = checkName(founders.content);
  const bizHas = checkName(business.content);
  const score = (techHas ? 1 : 0) + (prodHas ? 1 : 0) + (mktHas ? 1 : 0) + (fdrHas ? 1 : 0) + (bizHas ? 1 : 0);
  const passed = score >= 3;
  const warning = passed
    ? ""
    : `WARNING: Research may not be about the correct startup. Only ${score} of 5 research streams mention ${startup.name}. Write ONLY about confirmed facts. Keep content shorter. Do NOT fill gaps with information about other companies.`;

  return { technical, product, market, founders, business, contrarian, viral, qualityScore: score, passed, warning };
}

export async function runXTipResearch(
  tip: { author: string; post_summary: string; practical_takeaway: string; post_snippet?: string },
  perplexityKey: string
): Promise<{
  deepResearch: { content: string; citations: string[] };
  passed: boolean;
  warning: string;
}> {
  const deepResearch = await queryPerplexity(
    RESEARCH_PROMPTS.x_tip_deep(
      tip.post_snippet || tip.post_summary, tip.post_summary,
      tip.practical_takeaway, tip.author
    ),
    perplexityKey
  );

  const passed = deepResearch.content.length > 80;
  const warning = passed ? "" : "WARNING: Thin research. Keep the reel short and avoid strong factual claims.";

  return { deepResearch, passed, warning };
}
