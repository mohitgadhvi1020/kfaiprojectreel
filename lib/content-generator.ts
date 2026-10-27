import { Hook } from "@/types";
import { GENERATION_PROMPTS } from "@/config/api-keys";
import { callVertex } from "./vertex-client";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Provider dispatcher: routes LLM calls to Vertex (default) or OpenAI (fallback).
 * Controlled by GENERATION_PROVIDER env: "vertex" (default) or "openai".
 * If Vertex fails with a non-retryable auth/config error, we automatically fall
 * back to OpenAI so a misconfigured GCP project doesn't brick the whole pipeline.
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  openaiKey: string,
  maxTokens: number = 8192
): Promise<string> {
  const provider = (process.env.GENERATION_PROVIDER || "vertex").toLowerCase();

  if (provider === "openai") {
    return callOpenAIImpl(systemPrompt, userPrompt, openaiKey, maxTokens);
  }

  try {
    return await callVertex(systemPrompt, userPrompt, { maxTokens });
  } catch (err: any) {
    const msg = String(err?.message || err);
    // On config/auth errors or empty responses, fall back to OpenAI if a key exists.
    const shouldFallback =
      openaiKey &&
      (/401|403|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|permission_denied|unauthenticated|empty text|ENOENT|no such file|does not exist|credentials/i.test(
        msg
      ));
    if (shouldFallback) {
      console.warn(`[llm] vertex failed (${msg.slice(0, 100)}); falling back to OpenAI gpt-4o`);
      return callOpenAIImpl(systemPrompt, userPrompt, openaiKey, maxTokens);
    }
    throw err;
  }
}

// Parse "Please try again in 6.596s" from OpenAI 429 messages
function parseRetryDelayMs(errText: string): number | null {
  const m = errText.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  const ms = errText.match(/try again in (\d+)ms/i);
  if (ms) return parseInt(ms[1], 10);
  return null;
}

export async function callOpenAIImpl(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxTokens: number = 8192
): Promise<string> {
  const MAX_ATTEMPTS = 4;
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    }

    const err = await response.text();
    lastErr = err;

    // Retry on 429 (rate limit) and 5xx (transient server errors)
    const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    // Prefer server-provided delay; otherwise exponential backoff with jitter
    const retryAfterHeader = response.headers.get("retry-after");
    const hintedMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : parseRetryDelayMs(err);
    const backoffMs = hintedMs ?? Math.min(30000, 1000 * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * 500);
    const waitMs = backoffMs + jitter;

    console.warn(
      `[openai] ${response.status} on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${waitMs}ms`
    );
    await sleep(waitMs);
  }

  throw new Error(`OpenAI API error (exhausted retries): ${lastErr}`);
}

function safeStr(s: string): string {
  return String(s || "").substring(0, 12000);
}

export async function generateHooks(
  type: "startup" | "x_tip",
  context: {
    name: string;
    funding?: string;
    round?: string;
    technicalResearch?: string;
    productResearch?: string;
    marketResearch?: string;
    foundersResearch?: string;
    businessResearch?: string;
    contrarianResearch?: string;
    viralAngles?: string;
    warning?: string;
    author?: string;
    summary?: string;
    takeaway?: string;
    deepResearch?: string;
  },
  openaiKey: string,
  preferencesText: string = ""
): Promise<Hook[]> {
  const basePrompt =
    type === "startup"
      ? GENERATION_PROMPTS.hooks_startup
      : GENERATION_PROMPTS.hooks_x_tip;
  const systemPrompt = basePrompt + preferencesText;

  let userPrompt: string;

  if (type === "startup") {
    userPrompt = `Generate exactly 10 hooks for this startup, each with a DIFFERENT style tag. The BEST hook usually comes from the CONTRARIAN/SURPRISING research below — a weird founder pivot, an unexpected connection, a shocking stat. Prioritize pattern-breaks over feature lists.

Name: ${safeStr(context.name)}
Funding: ${safeStr(context.funding || "")} (${safeStr(context.round || "")})

=== CONTRARIAN / SURPRISING ANGLES (priority source for hooks) ===
${safeStr(context.contrarianResearch || "")}

=== TECHNICAL ===
${safeStr(context.technicalResearch || "")}

=== PRODUCT ===
${safeStr(context.productResearch || "")}

=== MARKET ===
${safeStr(context.marketResearch || "")}

=== FOUNDERS ===
${safeStr(context.foundersResearch || "")}

=== BUSINESS / TRACTION ===
${safeStr(context.businessResearch || "")}

=== VIRAL CONTENT TRENDS ===
${safeStr(context.viralAngles || "")}

${context.warning || ""}

Output ONLY a JSON array of exactly 10 hooks. No markdown, no prose, no code fences — just the raw JSON array.`;
  } else {
    userPrompt = `Generate 6 hooks about this SPECIFIC TOPIC (not about the author as a person):

Topic discussed by @${context.author || "unknown"}:
Summary: ${safeStr(context.summary || "")}
Takeaway: ${safeStr(context.takeaway || "")}

Deep research on the topic:
${safeStr(context.deepResearch || "")}

${context.warning || ""}

Hooks must be about the TOPIC/TECHNIQUE, not a bio of the author.`;
  }

  // 10 hooks × ~120 tokens each + Gemini 2.5 Pro thinking tokens ⇒ need a generous ceiling.
  const content = await callLLM(systemPrompt, userPrompt, openaiKey, 8192);

  // Tolerant parse: strip ```json fences, then also try to locate the outermost [...]
  // block in case the model added stray commentary despite the instruction.
  const tryParse = (raw: string): any[] | null => {
    try {
      return JSON.parse(raw);
    } catch {
      const first = raw.indexOf("[");
      const last = raw.lastIndexOf("]");
      if (first !== -1 && last > first) {
        try { return JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
      }
      return null;
    }
  };

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = tryParse(cleaned);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed;
  }

  console.warn(
    `[generateHooks] JSON parse failed — returning fallback stub hook. Raw output (first 500 chars): ${content.slice(0, 500)}`
  );
  return [
    {
      style: "BUILDER_PERSPECTIVE",
      hook: `I found a ${context.funding || ""} startup doing something nobody expected. Let me break it down.`,
      why_it_works: "Fallback hook (model output failed to parse — check server logs)",
    },
  ];
}

export async function generateStartupContent(
  context: {
    name: string;
    funding: string;
    round: string;
    selectedHook: Hook;
    technicalResearch: string;
    productResearch: string;
    marketResearch: string;
    foundersResearch: string;
    businessResearch?: string;
    contrarianResearch?: string;
    viralAngles: string;
    warning: string;
  },
  openaiKey: string,
  preferencesText: string = ""
): Promise<{ reelScript: string; carouselText: string; caption: string }> {
  const researchBlock = `STARTUP: ${safeStr(context.name)}
FUNDING: ${safeStr(context.funding)} (${safeStr(context.round)})

=== CONTRARIAN / NON-OBVIOUS ANGLES (prioritize this for the hook) ===
${safeStr(context.contrarianResearch || "")}

=== FOUNDERS & TEAM ===
${safeStr(context.foundersResearch)}

=== TECHNICAL ARCHITECTURE ===
${safeStr(context.technicalResearch)}

=== PRODUCT & USER EXPERIENCE ===
${safeStr(context.productResearch)}

=== MARKET, COMPETITORS & INVESTORS ===
${safeStr(context.marketResearch)}

=== BUSINESS MODEL & TRACTION ===
${safeStr(context.businessResearch || "")}

=== VIRAL CONTENT TRENDS ===
${safeStr(context.viralAngles)}

${context.warning}`;

  const [reelScript, carouselText, caption] = await Promise.all([
    callLLM(
      GENERATION_PROMPTS.reel_script + preferencesText,
      `Write the 55–65 second Instagram Reel script following the 7-section structure in your system prompt.

⚠️ NON-NEGOTIABLE: The very first spoken line MUST be this user-picked hook, WORD-FOR-WORD, no rewording, no "let me break it down" preamble:

HOOK (use verbatim as line 1): "${safeStr(context.selectedHook.hook)}"

The angle of the hook (${safeStr(context.selectedHook.style || "")}) determines the framing of the whole script — every section should reinforce why the hook is true. If the hook is about a technical decision, the TECHNICAL DEEP-DIVE section earns extra weight. If it's about business, weight the BUSINESS section. Etc.

${researchBlock}

REMINDERS (your system prompt has the full rubric — this is the short form):
- 7 sections in order: HOOK → INTRO → (optional FOUNDERS) → TECHNICAL DEEP-DIVE → HOW IT WORKS (4–5 numbered steps) → BUSINESS + MARKET → BUILDER TAKEAWAY → CTA.
- 200–230 words total. Count them.
- Every number must come verbatim from research above. Do NOT invent TAM or metrics.
- Every named technique must be followed by a ≤15-word "what it does differently" sentence.
- Banned phrases: groundbreaking, revolutionary, cutting-edge, game-changing, state-of-the-art, in the world of, reimagining.
- Founders section appears ONLY if background explains a specific product/tech decision. Otherwise skip.

Output the spoken script. Then on a new line:
CAPTION: (under 280 chars, sharp technical question + @mohit.builds.ai)
HASHTAGS: (8-10)`,
      openaiKey,
      4000
    ),
    callLLM(
      GENERATION_PROMPTS.carousel + preferencesText,
      `Create a detailed 8-slide carousel for this startup. USE ALL the research below.

${researchBlock}

CRITICAL REQUIREMENTS:
1. Slide 3 MUST have founder full names, previous companies, and education
2. Slides 4-6 MUST have specific technology names, frameworks, models
3. Slide 7 MUST have TAM with dollar figure and competitor names
4. Every slide must have at least one specific fact or number
5. Include investor names in Slide 2

Output SLIDE 1 through SLIDE 8, then CAROUSEL CAPTION (under 400 chars) and HASHTAGS (10-12).`,
      openaiKey,
      4000
    ),
    callLLM(
      GENERATION_PROMPTS.caption + preferencesText,
      `Write a caption for this startup. Include a specific technical detail and founder name.

Startup: ${safeStr(context.name)}
Funding: ${safeStr(context.funding)} (${safeStr(context.round)})
Founders: ${safeStr(context.foundersResearch).substring(0, 500)}
Tech: ${safeStr(context.technicalResearch).substring(0, 500)}

${context.warning}

Output CAPTION (under 300 chars) and HASHTAGS (8-10).`,
      openaiKey,
      1024
    ),
  ]);

  return { reelScript, carouselText, caption };
}

export type LinkedInContext = {
  name: string;
  funding: string;
  round: string;
  selectedHook?: Hook | null;
  technicalResearch: string;
  productResearch: string;
  marketResearch: string;
  foundersResearch: string;
  businessResearch?: string;
  contrarianResearch?: string;
  viralAngles?: string;
  warning?: string;
};

/** Shared research dossier block — used by both the LinkedIn writer and the fact-checker. */
function linkedinResearchBlock(context: LinkedInContext): string {
  return `STARTUP: ${safeStr(context.name)}
FUNDING: ${safeStr(context.funding)} (${safeStr(context.round)})

=== CONTRARIAN / NON-OBVIOUS ANGLES (prioritize for the hook) ===
${safeStr(context.contrarianResearch || "")}

=== FOUNDERS & TEAM ===
${safeStr(context.foundersResearch)}

=== TECHNICAL ARCHITECTURE ===
${safeStr(context.technicalResearch)}

=== PRODUCT & USER EXPERIENCE ===
${safeStr(context.productResearch)}

=== MARKET, COMPETITORS & INVESTORS ===
${safeStr(context.marketResearch)}

=== BUSINESS MODEL & TRACTION ===
${safeStr(context.businessResearch || "")}

${context.warning || ""}`;
}

/**
 * Generates a single ready-to-paste LinkedIn post — a warm, tech-first, step-by-step
 * breakdown of the startup (no company/brand self-reference, no "we"; positive and
 * connection-oriented) — from the SAME research dossier the Instagram flow uses.
 * One plain-text post: no carousel, no separate caption. If a hook is picked it
 * anchors the post; otherwise the model leads with the strongest technical angle.
 */
export async function generateLinkedInPost(
  context: LinkedInContext,
  openaiKey: string,
  preferencesText: string = ""
): Promise<string> {
  const researchBlock = linkedinResearchBlock(context);

  const hookLine = context.selectedHook?.hook
    ? `\n\nThe post MUST be built around this angle, used as the opening hook (first line), near-verbatim:\n"${safeStr(context.selectedHook.hook)}"\n`
    : "\n\nNo hook was pre-picked — WRITE A SHORT, PUNCHY, SCROLL-STOPPING FIRST LINE yourself (a surprising number, a bold-but-true statement, a curiosity gap, or a sharp question). Keep it under ~120 characters. Do NOT open with a long, dense technical/architecture sentence and do NOT open with the startup name. Then go deep on the tech in the step-by-step section.\n";

  return callLLM(
    GENERATION_PROMPTS.linkedin_post + preferencesText,
    `Write ONE deep-dive LinkedIn post breaking down this startup, following the structure in your system prompt.${hookLine}
${researchBlock}

REMINDERS (short form of your system rubric):
- Warm, respectful, genuinely impressed tone. NEVER criticize, doubt, or call out the startup — the goal is to make the founders feel seen so they want to connect.
- Do NOT speak as a company, never use "we"/"our"/"us", never name any brand or agency. Just an individual engineer who finds their work interesting.
- The core of the post is a "Here's how it works, step by step:" section — 4–6 numbered steps, each on its own line, each naming a SPECIFIC model/framework/architecture and what it does differently.
- First 1–2 lines are the only thing visible before "see more" — lead with the most admirable/interesting technical insight. Never open with the startup name.
- Plain text only: no markdown headers, no bold/asterisks. Separate paragraphs with a single blank line.
- Every number must come verbatim from the research above. Do NOT invent TAM, funding, or metrics.
- End with an appreciative line + a genuinely interesting question that invites the team to engage, then 3–5 hashtags on the last line. Do NOT name any company.
- Readable and a little fun, but insight-dense. Target 1400–2100 characters.

Output ONLY the finished post text, ready to paste.`,
    openaiKey,
    // gemini-2.5-pro is a thinking model: reasoning tokens are drawn from this
    // same budget BEFORE any visible text. 2048 left only ~125 tokens for the
    // post (truncated mid-sentence). 6000 matches the headroom IG calls rely on.
    6000
  );
}

export interface LinkedInVerification {
  verified: boolean;
  flagged: { claim: string; issue: string }[];
  correctedPost: string;
  /** Human-readable summary for reviewer_notes / toast. */
  notes: string;
}

/**
 * Agentic fact-check pass: takes a drafted LinkedIn post + the research dossier and
 * verifies every concrete claim. Unsupported / contradicted / impossible claims are
 * flagged and a corrected post (claims removed or softened, tone preserved) is
 * returned. Failure-safe: if the checker errors or returns unparseable output, the
 * original post is returned untouched with verified=false and a note.
 */
export async function verifyLinkedInPost(
  context: LinkedInContext & { post: string },
  openaiKey: string,
  preferencesText: string = ""
): Promise<LinkedInVerification> {
  const researchBlock = linkedinResearchBlock(context);

  const raw = await callLLM(
    GENERATION_PROMPTS.linkedin_verify + preferencesText,
    `Fact-check this drafted LinkedIn post against the research dossier. Return ONLY the JSON described in your system prompt.

=== DRAFTED POST ===
${safeStr(context.post)}

=== RESEARCH DOSSIER (the ONLY source of truth for specific facts) ===
${researchBlock}`,
    openaiKey,
    6000
  );

  // Be liberal in what we accept: strip code fences and pull the first {...} block.
  try {
    let txt = (raw || "").trim();
    txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start !== -1 && end !== -1) txt = txt.slice(start, end + 1);
    const parsed = JSON.parse(txt);

    const flagged = Array.isArray(parsed.flagged)
      ? parsed.flagged
          .filter((f: any) => f && (f.claim || f.issue))
          .map((f: any) => ({ claim: String(f.claim || ""), issue: String(f.issue || "") }))
      : [];
    const correctedPost =
      typeof parsed.corrected_post === "string" && parsed.corrected_post.trim().length > 50
        ? parsed.corrected_post.trim()
        : context.post;
    const verified = parsed.verified === true && flagged.length === 0;

    const notes = verified
      ? "Fact-check passed — all claims grounded in research."
      : flagged.length > 0
        ? `Fact-check adjusted ${flagged.length} claim(s):\n` +
          flagged.map((f: { claim: string; issue: string }) => `• ${f.claim || "(claim)"} — ${f.issue}`).join("\n")
        : "Fact-check ran; post returned with minor corrections.";

    return { verified, flagged, correctedPost, notes };
  } catch (err) {
    console.warn("[linkedin-verify] could not parse checker output; keeping original:", err);
    return {
      verified: false,
      flagged: [],
      correctedPost: context.post,
      notes: "Fact-check could not be parsed — review the post manually before posting.",
    };
  }
}

export interface TagTarget {
  name: string;
  title?: string;
  /** Real profile URL if the research explicitly contained one, else null. */
  linkedin_url: string | null;
  /** Always-present LinkedIn search URL fallback so the UI can link somewhere. */
  search_url: string;
}
export interface TagTargets {
  company: TagTarget;
  founders: TagTarget[];
}

function linkedinPeopleSearchUrl(name: string, company: string): string {
  const q = encodeURIComponent(`${name} ${company}`.trim());
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}
function linkedinCompanySearchUrl(company: string): string {
  return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;
}
/** Only trust a LinkedIn URL that was literally present in the research. */
function safeLinkedinUrl(u: any): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  return /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(s) ? s : null;
}

/**
 * Extracts the founders + company to @-tag when posting, from the research dossier.
 * LinkedIn mentions can't be pasted, so this powers a "tag helper" panel: real
 * profile URLs when the research had them, otherwise a LinkedIn search link so the
 * user can find and @-mention each person manually. Failure-safe — on any error it
 * still returns the company with a search link and an empty founders list.
 */
export async function extractTagTargets(
  context: {
    name: string;
    foundersResearch: string;
    businessResearch?: string;
    marketResearch?: string;
    technicalResearch?: string;
    productResearch?: string;
    contrarianResearch?: string;
    website?: string;
  },
  openaiKey: string,
  preferencesText: string = ""
): Promise<TagTargets> {
  const companyName = context.name;
  const fallback: TagTargets = {
    company: { name: companyName, linkedin_url: null, search_url: linkedinCompanySearchUrl(companyName) },
    founders: [],
  };

  try {
    const raw = await callLLM(
      GENERATION_PROMPTS.linkedin_tags + preferencesText,
      `Extract the company and founders to tag for this startup. Founder names may appear in ANY section below, not just the founders one. Return ONLY the JSON from your system prompt.

COMPANY: ${safeStr(companyName)}
WEBSITE: ${safeStr(context.website || "")}

=== FOUNDERS & TEAM RESEARCH ===
${safeStr(context.foundersResearch)}

=== CONTRARIAN / NON-OBVIOUS (often has founder backstory) ===
${safeStr(context.contrarianResearch || "")}

=== MARKET / INVESTOR RESEARCH ===
${safeStr(context.marketResearch || "")}

=== BUSINESS RESEARCH ===
${safeStr(context.businessResearch || "")}

=== TECHNICAL RESEARCH ===
${safeStr(context.technicalResearch || "")}

=== PRODUCT RESEARCH ===
${safeStr(context.productResearch || "")}`,
      openaiKey,
      1500
    );

    let txt = (raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start !== -1 && end !== -1) txt = txt.slice(start, end + 1);
    const parsed = JSON.parse(txt);

    const company: TagTarget = {
      name: parsed.company?.name || companyName,
      linkedin_url: safeLinkedinUrl(parsed.company?.linkedin_url),
      search_url: linkedinCompanySearchUrl(parsed.company?.name || companyName),
    };
    const founders: TagTarget[] = Array.isArray(parsed.founders)
      ? parsed.founders
          .filter((f: any) => f && typeof f.name === "string" && f.name.trim().length > 1)
          .map((f: any) => ({
            name: String(f.name).trim(),
            title: f.title ? String(f.title).trim() : undefined,
            linkedin_url: safeLinkedinUrl(f.linkedin_url),
            search_url: linkedinPeopleSearchUrl(String(f.name).trim(), companyName),
          }))
      : [];

    return { company, founders };
  } catch (err) {
    console.warn("[linkedin-tags] extraction failed; using fallback:", err);
    return fallback;
  }
}

/**
 * Convenience: generate a LinkedIn post, then run the agentic fact-check AND the
 * tag-target extraction in parallel. Returns the corrected post + verification +
 * tag targets. Used by both the on-demand route and the auto-draft on IG script-gen.
 */
export async function generateAndVerifyLinkedInPost(
  context: LinkedInContext & { website?: string },
  openaiKey: string,
  preferencesText: string = ""
): Promise<{ post: string; verification: LinkedInVerification; tagTargets: TagTargets }> {
  const draft = await generateLinkedInPost(context, openaiKey, preferencesText);
  const [verification, tagTargets] = await Promise.all([
    verifyLinkedInPost({ ...context, post: draft }, openaiKey, preferencesText),
    extractTagTargets(context, openaiKey, preferencesText),
  ]);
  return { post: verification.correctedPost, verification, tagTargets };
}

export async function generateXTipContent(
  context: {
    author: string;
    summary: string;
    takeaway: string;
    post: string;
    selectedHook: Hook;
    deepResearch: string;
    warning: string;
  },
  openaiKey: string,
  preferencesText: string = ""
): Promise<{ reelScript: string; carouselText: string; caption: string }> {
  const tipReelSystem = `You write 45-60 second Instagram Reels for @mohit.builds.ai — IIT Bombay engineer, 6 years in tech.

This reel explains a SPECIFIC TECHNICAL TOPIC from an X post. Credit the creator by @handle early but the reel is about the TOPIC, not the person.

PACE: Include [XX sec] markers. PACE CHECK: each section must be readable aloud in its time window.
Word budgets: HOOK ~20, CREDIT+TOPIC ~40, EXPLAIN ~80, ACTION ~40, CTA ~20. Total under 180 words.

Structure:
HOOK [0-3 sec]: use provided hook. [VISUAL CUE: Ink #1A1A2E]
CREDIT + TOPIC [3-8 sec]: name @handle, then immediately state the specific topic/technique they discussed. [VISUAL CUE: @handle + topic name]
WHY IT MATTERS [8-22 sec]: builder framing with specific numbers or benchmarks from research. [VISUAL CUE: Rust #E8553A key stat]
HOW IT WORKS [22-45 sec]: 3 numbered steps explaining the technique. Technically precise, name specific tools/models/frameworks. [VISUAL CUE: numbered steps]
TRY THIS [45-52 sec]: one concrete action (command, repo, or checklist) if research supports it. [VISUAL CUE: Sage #2D6A4F]
CTA [52-60 sec]: technical question + follow @mohit.builds.ai [VISUAL CUE]

ANTI-GENERIC: Every sentence must contain a specific fact, number, or technical term. BANNED: 'interesting', 'game-changing', 'incredible'. If a sentence could apply to any topic, delete it.
Rules: Pure English, no emojis. Never invent repos, versions, or benchmarks.

After script: CAPTION (under 300 chars, credit @creator, include specific detail) + HASHTAGS (8-10).`;

  const tipCarouselSystem = `You create a 5-slide Instagram carousel for @mohit.builds.ai about a SPECIFIC TECHNICAL TOPIC from an X post.

Brand colors: Ink #1A1A2E, Rust #E8553A, Cream #FFF8F0, Sage #2D6A4F, White #FFFFFF.

STANDALONE TEST: each slide useful if screenshotted alone.

SLIDE 1 COVER (Ink): provocative question about the TECHNIQUE/TOOL, not the creator name.
SLIDE 2 (Cream): credit @handle + state the specific topic. What did they demonstrate?
SLIDE 3 (White): the mechanism — how it works technically. Name specific tools, models, frameworks.
SLIDE 4 (Cream): practical steps / checklist a builder can try. Be specific: commands, repos, configs.
SLIDE 5 (Rust): your technical takeaway + Follow @mohit.builds.ai.

ANTI-GENERIC: Every slide must contain a specific technical detail. BANNED: generic filler, 'game-changing', 'incredible'. If a slide could apply to any topic, rewrite.

Max 40 words per slide. No emojis. No markdown.

Output: SLIDE 1..5, CAROUSEL CAPTION (under 400 chars), HASHTAGS (10-12).`;

  const tipCaptionSystem = `Instagram caption for @mohit.builds.ai. Credit the X creator with @handle. Pure English, no emojis. Under 300 chars + 8-10 hashtags. Must include a specific technical detail from the research. BANNED: generic filler, 'game-changing', 'incredible'.`;

  const [reelScript, carouselText, caption] = await Promise.all([
    callLLM(
      tipReelSystem + preferencesText,
      `Write a reel about this SPECIFIC TOPIC (NOT a bio of the author):

Topic posted by @${context.author}:
HOOK: ${safeStr(context.selectedHook.hook)}
What the post was about: ${safeStr(context.post)}
Summary: ${safeStr(context.summary)}
Key takeaway: ${safeStr(context.takeaway)}

Deep research on the TOPIC:
${safeStr(context.deepResearch)}

${context.warning}

The reel must explain the TECHNIQUE/CONCEPT, not the person. Credit @${context.author} early then focus entirely on the topic.
Output script with [VISUAL CUE] every ~8-10s, then CAPTION and HASHTAGS.`,
      openaiKey
    ),
    callLLM(
      tipCarouselSystem + preferencesText,
      `Carousel about this SPECIFIC TOPIC (not a bio of the author):

Topic from @${context.author}:
Summary: ${safeStr(context.summary)}
Takeaway: ${safeStr(context.takeaway)}
Original post: ${safeStr(context.post)}

Deep research on the topic:
${safeStr(context.deepResearch)}

${context.warning}

Focus on the TECHNIQUE, credit the creator but explain the topic.`,
      openaiKey
    ),
    callLLM(
      tipCaptionSystem + preferencesText,
      `Caption about this TOPIC (not about the author as a person):

Topic from @${context.author}:
Summary: ${safeStr(context.summary)}
Takeaway: ${safeStr(context.takeaway)}

Research: ${safeStr(context.deepResearch)}

${context.warning}

Credit @${context.author}, include a specific technical detail.`,
      openaiKey,
      1024
    ),
  ]);

  return { reelScript, carouselText, caption };
}

export async function reviseContent(
  context: {
    contentType: string;
    currentContent: string;
    userInstructions: string;
    startupName?: string;
    preferencesText?: string;
  },
  openaiKey: string
): Promise<string> {
  const systemPrompt = `You are a content revision assistant for @mohit.builds.ai, an IIT Bombay engineer who breaks down AI startups on Instagram.

You will receive existing generated content and the creator's revision request. Apply the requested changes precisely while maintaining the same overall format, structure, and quality.

Rules:
- Apply ONLY the changes the creator requests. Don't rewrite sections they didn't mention.
- Maintain all [VISUAL CUE] markers and [XX sec] timing markers if present.
- Keep the same voice: builder-to-builder, pure English, no emojis, no Hinglish.
- BANNED: 'game-changing', 'revolutionary', 'groundbreaking', 'in the world of AI'.
- Never invent facts. If the revision asks for info you don't have, note it.
- Output the COMPLETE revised content (not just the changed parts).
${context.preferencesText || ""}`;

  const userPrompt = `CONTENT TYPE: ${context.contentType}
${context.startupName ? `STARTUP: ${context.startupName}` : ""}

=== CURRENT CONTENT ===
${safeStr(context.currentContent)}

=== REVISION REQUEST ===
${context.userInstructions}

Apply the requested changes and output the complete revised content.`;

  return await callLLM(systemPrompt, userPrompt, openaiKey, 6000);
}

export async function refineContent(
  context: {
    name: string;
    funding?: string;
    round?: string;
    reelScript: string;
    carouselText: string;
    caption: string;
    warning: string;
    foundersResearch?: string;
    technicalResearch?: string;
    selectedHook?: Hook; // user-picked hook — must survive the refinement pass verbatim
  },
  openaiKey: string,
  preferencesText: string = ""
): Promise<{
  refinedReel: string;
  refinedCarousel: string;
  refinedCaption: string;
  qualityScore: string;
  reviewerNotes: string;
}> {
  const result = await callLLM(
    GENERATION_PROMPTS.refinement + preferencesText,
    `Review and refine this content about ${safeStr(context.name)} (raised ${safeStr(context.funding || "")} in ${safeStr(context.round || "")}):

=== ORIGINAL RESEARCH (for fact-checking) ===
Founders: ${safeStr((context.foundersResearch || "").substring(0, 3000))}
Technical: ${safeStr((context.technicalResearch || "").substring(0, 3000))}

${context.selectedHook ? `=== USER-PICKED HOOK (DO NOT REWRITE) ===
The user picked this exact hook — the first spoken line of the refined reel MUST be this sentence, verbatim, no paraphrasing, no preamble before it:

"${safeStr(context.selectedHook.hook)}"

Style intent: ${safeStr(context.selectedHook.style || "")}. The whole refined script must stay faithful to this angle.

` : ""}=== REEL SCRIPT ===
${safeStr(context.reelScript)}

=== CAROUSEL TEXT ===
${safeStr(context.carouselText)}

=== CAPTION ===
${safeStr(context.caption)}

${context.warning}

CRITICAL: This content is about '${safeStr(context.name)}' ONLY.
${context.selectedHook ? "0. THE FIRST LINE OF THE REFINED REEL MUST BE THE USER-PICKED HOOK VERBATIM. If the draft opens with a different sentence, REPLACE that opening with the hook.\n" : ""}1. Ensure founder names and backgrounds are present in both reel and carousel
2. Ensure technical architecture steps are specific with technology names
3. Ensure market/TAM data is included
4. Check flow: Hook -> Intro (funding+problem) -> (optional) Founders -> Technical deep-dive -> How it works (4–5 numbered steps) -> Business+Market -> Builder takeaway -> CTA
5. Remove any generic filler that could apply to any startup
6. Every sentence must earn its place with a specific fact
7. Ban phrases: groundbreaking, revolutionary, cutting-edge, game-changing, state-of-the-art, reimagining, in the world of

Output refined versions with all improvements.`,
    openaiKey
  );

  const sections: Record<string, string> = {};
  const markers = [
    "REFINED REEL SCRIPT", "REFINED CAROUSEL TEXT", "REFINED CAPTION",
    "QUALITY SCORE", "REVIEWER NOTES",
  ];

  for (let i = 0; i < markers.length; i++) {
    const startMarker = `---${markers[i]}---`;
    const startIdx = result.indexOf(startMarker);
    if (startIdx === -1) continue;
    const contentStart = startIdx + startMarker.length;
    let contentEnd = result.length;
    for (let j = i + 1; j < markers.length; j++) {
      const nextIdx = result.indexOf(`---${markers[j]}---`);
      if (nextIdx !== -1) { contentEnd = nextIdx; break; }
    }
    sections[markers[i]] = result.substring(contentStart, contentEnd).trim();
  }

  return {
    refinedReel: sections["REFINED REEL SCRIPT"] || context.reelScript,
    refinedCarousel: sections["REFINED CAROUSEL TEXT"] || context.carouselText,
    refinedCaption: sections["REFINED CAPTION"] || context.caption,
    qualityScore: sections["QUALITY SCORE"] || "N/A",
    reviewerNotes: sections["REVIEWER NOTES"] || "",
  };
}
