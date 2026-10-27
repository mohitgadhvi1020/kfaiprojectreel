import { CharacterSet } from "./character-sets";

export interface DialogueLine {
  character: "A" | "B";
  text: string;
  emotion: "neutral" | "excited" | "angry" | "laughing" | "thinking";
  estimatedDuration: number;
}

export interface DialogueScript {
  title: string;
  characterA: string;
  characterB: string;
  lines: DialogueLine[];
  totalEstimatedDuration: number;
}

export type DialogueGenerationMode = "topic_debate" | "source_adaptation";

interface DialogueGenerationOptions {
  mode?: DialogueGenerationMode;
}

// Lightweight quality check on raw generated text. We fail the script if it
// contains banned buzzwords OR shows zero signs of pushback/disagreement.
// This is intentionally simple — string matching, no LLM call. The single
// retry above gives us one chance to fix it before accepting.
const BANNED_SUBSTRINGS = [
  "game-changer",
  "game changer",
  "democratize",
  "the future of",
  "revolutionize",
  "next-level",
  "scratching the surface",
  "unlock potential",
  "unlock the potential",
  "fortune favors the bold",
  "let me tell you",
  "tell me more",
  "great question",
  "convince me",
  "real-world use",
  "without hiccups",
  "boost productivity",
  "step forward",
  "real test will be",
  "only time will tell",
  "exciting times",
];

const PUSHBACK_MARKERS = [
  "push back",
  "disagree",
  "but actually",
  "i'd argue",
  "i would argue",
  "not so sure",
  "not really",
  "that's where i",
  "that breaks down",
  "the catch is",
  "the problem is",
  "but here's the thing",
  "i'm not convinced",
  "actually, no",
  "hmm, no",
  "i don't buy",
  "the flip side",
  "counterpoint",
];

// Generic, content-free affirmation phrases that signal padding rather than a
// real source point. Two or more is a strong filler signal.
const FILLER_MARKERS = [
  "where the value really is",
  "your edge in the field",
  "make a real difference",
  "makes a real difference",
  "drive real improvement",
  "drives real improvement",
  "get serious about",
  "time to dig in",
  "could be your edge",
  "really sets people apart",
  "that's the key part",
  "real game",
];

function scoreScriptText(
  raw: string,
  opts: { requirePushback?: boolean } = {}
): { failed: boolean; reasons: string[] } {
  const lc = raw.toLowerCase();
  const reasons: string[] = [];

  const hits = BANNED_SUBSTRINGS.filter((p) => lc.includes(p));
  if (hits.length) reasons.push(`banned phrases used: ${hits.join(", ")}`);

  if (opts.requirePushback) {
    const hasPushback = PUSHBACK_MARKERS.some((m) => lc.includes(m));
    if (!hasPushback) reasons.push("no pushback markers detected — speakers may agree throughout");
  }

  // ── Flow / engagement checks (the #1 reason scripts feel choppy) ──
  // Interview cadence: too many question lines reads as Q&A ping-pong, not a
  // real conversation. "?" only appears inside the text fields of the JSON.
  const questionCount = (raw.match(/\?/g) || []).length;
  if (questionCount > 3) {
    reasons.push(
      `too many questions (${questionCount}) — reads like an interview. Most lines must be statements/reactions; max 2-3 questions total`
    );
  }

  // Formulaic skeptic openers: "Okay, but…", "Fine, but…", "Alright, but…",
  // "Sure, but…", "Right, but…" repeated across lines makes every exchange feel
  // identical. One is fine; two or more is a robotic pattern.
  const formulaic =
    raw.match(/"\s*(okay|fine|alright|sure|right|well|hmm|so)\b[^"]{0,12}\b(but|so)\b/gi) || [];
  if (formulaic.length >= 2) {
    reasons.push(
      `repetitive skeptic openers (${formulaic.length}× like "Okay, but…"/"Fine, but…") — vary how each line starts`
    );
  }

  // Generic filler: empty affirmation lines that carry no new source fact. These
  // cluster right before the CTA and trade source density for padding.
  const fillerHits = FILLER_MARKERS.filter((m) => lc.includes(m));
  if (fillerHits.length >= 2) {
    reasons.push(
      `generic filler lines (${fillerHits.join(", ")}) — every line must carry a NEW source fact; delete restatements`
    );
  }

  return { failed: reasons.length > 0, reasons };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxTokens: number = 4096
): Promise<string> {
  // Retry transient network failures with exponential backoff. "fetch failed"
  // / 5xx / 429 are the typical flakes — retrying after a short wait usually
  // works. We do at most 3 attempts (≤ ~6s extra wait worst case).
  const MAX_ATTEMPTS = 3;
  let lastErr: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000); // 90s ceiling

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: maxTokens,
          temperature: 0.9,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const err = await response.text();
        // 4xx (other than 429) are not retriable — fail fast.
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`OpenAI API error (${response.status}): ${err}`);
        }
        lastErr = new Error(`OpenAI API error (${response.status}): ${err}`);
      } else {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
      }
    } catch (err: any) {
      lastErr = err;
      // Bail immediately on non-retriable client errors.
      if (err?.message?.includes("OpenAI API error (4")) throw err;
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = 800 * 2 ** (attempt - 1); // 800ms, 1600ms
      console.warn(
        `[dialogue] callOpenAI attempt ${attempt}/${MAX_ATTEMPTS} failed (${lastErr?.message}); retrying in ${backoffMs}ms`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastErr || new Error("OpenAI call failed after retries");
}

export async function generateDialogueScript(
  topic: string,
  characterSet: CharacterSet,
  openaiKey: string,
  targetDuration: number = 60,
  options: DialogueGenerationOptions = {}
): Promise<DialogueScript> {
  const mode = options.mode || "topic_debate";
  const isSourceAdaptation = mode === "source_adaptation";
  const sourceAdaptationRules = isSourceAdaptation
    ? `
SOURCE ADAPTATION MODE:
- The user prompt contains original monitored content. Treat ORIGINAL CONTENT as the source of truth.
- Before writing, mentally extract the 5-7 most concrete source moments: numbers, named people, named tools, examples, offers, surprising claims, or objections.
- Preserve the original meaning, claims, examples, named entities, and rough order, but prioritize those concrete source moments over generic summary.
- Lightly rewrite for spoken dialogue only: tighten phrasing, split long ideas, and add natural reactions.
- Do NOT invent a new angle, new product comparison, fake details, or claims that are not supported by the original content.
- Summary, key insights, topics, and tools are only helper notes. If they conflict with ORIGINAL CONTENT, follow ORIGINAL CONTENT.
- For Instagram, use SPOKEN TRANSCRIPT when present. If only CAPTION is present, adapt the caption exactly and do not pretend you heard reel audio.
- Speaker B can ask a skeptical clarification or add nuance, but the pushback must not change the original point.

DENSITY & FIDELITY (this is failing most often — fix it):
- EVERY line must carry a NEW concrete source fact, detail, name, or number. If a line only restates a previous idea or says something generic ("that's where the value is", "this could be your edge", "mastering it makes a real difference", "time to get serious"), DELETE it. Fewer dense lines beat more padded lines.
- Keep the source's MOST SPECIFIC hook detail — a named audience ("vibe coders"), a churn signal ("what they do before canceling"), an exact number, a named person/tool. Do NOT generalize a sharp specific into a bland phrase (e.g. don't turn "vibe coders forget analytics" into "everyone launching products misses analytics").
- Before the CTA, do NOT add 2-3 vague wrap-up lines. Go from the last concrete source point straight to the CTA.
- If you have spare lines, spend them on concrete source details you'd otherwise skip — not on generic affirmations.
- Preserve the source's CTA verbs exactly: if the source says "Follow and comment X", keep both "follow" and "comment".
`
    : "";
  const structureRules = isSourceAdaptation
    ? `STRUCTURE (in order):
1. HOOK: First line must be scroll-stopping and easy to understand. Use the strongest source moment, number, named person/tool, or surprising claim. No setup line.
2. CONTEXT: In the next 1-2 lines, explain the topic in plain English for a smart beginner.
3. PROOF: Include 3-5 concrete source details across the dialogue. Prefer exact details over broad claims.
4. TENSION: Include one real objection or skeptical question, then answer it with source-based reasoning.
5. TAKEAWAY: Make the viewer understand why this matters in their work, money, career, or startup life.
6. COMMENT CTA: The final line MUST ask viewers to comment a short keyword related to the reel to get more info, a breakdown, a prompt, a checklist, or the source. Example: "Comment AGENTS and I'll share the simple breakdown."`
    : `STRUCTURE (in order):
1. Strong, specific, DECLARATIVE opinion in line 1 — names a product/tool/practice. NOT a question. NOT "Sounds risky, right?". YES "Cursor's tab autocomplete made Copilot feel old in three weeks."
2. Compare TWO NAMED things — products, frameworks, philosophies, or workflows. THIS IS NON-NEGOTIABLE. If the topic names only one thing, you MUST pick the most relevant alternative yourself and put it in the script (e.g. topic = "Gemma in browser" → compare against "cloud LLM via API" or "ChatGPT browser plugin"). Single-product analysis = script fails.
3. Explain why the difference matters in a real day-to-day workflow. Name a concrete use case (debugging React, writing emails, summarizing PDFs, etc.) — not generic "real-time assistance" or "boost productivity."
4. ONE light joke or subtle reference. Just one. Not in every line.
5. End on a SHARP closer — either a sticky one-liner that reframes the debate, or a pointed question that forces the viewer to pick a side. NOT "the real test will be how it performs." NOT "what do you think?". NOT "fortune favors the bold."`;

  const debateRules = isSourceAdaptation
    ? `REAL CONVERSATION (FLOW IS THE #1 PRIORITY):
- Two friends unpacking one idea together — NOT a host interviewing a guest, NOT a Q&A.
- HARD LIMIT: at most 2-3 question lines in the ENTIRE script. Everything else is a statement, a reaction, or a build. If you're about to write a question, first try rewriting it as a curious statement ("I keep wondering if…", "The part that gets me is…").
- BANNED robotic skeptic openers: do NOT start lines with "Okay, but…", "Fine, but…", "Alright, but…", "Sure, but…", "Right, but…", "Okay, that sounds…". One acknowledgment like that across the whole script is the max. Vary every line's opening.
- Speaker B does NOT just probe. B reacts, agrees-and-extends, adds a concrete detail, or lands a small grounded challenge — B carries half the insight, not just the doubts.
- Each line must grab the BATON from the line before it: react to the exact words just said, then push the idea one step further. Use varied natural bridges: "That's the part that…", "Which is wild because…", "And the sneaky bit is…", "Exactly — and then…", "The catch nobody mentions…", "Honestly that's why…". Never reuse the same bridge twice.
- ESCALATE: every exchange should reveal something new or raise the stakes — surprise → why it matters → the catch → the payoff. Never circle back or restate.
- Momentum: end most lines on a small forward lean (an implication, a stakes-raise, a "but here's the thing") so the next line has something to grab. Avoid dead-end lines that just close a thought.
- Add light human texture — a dry aside, a quick "I didn't expect that", real reactions — so it sounds spoken, not recited. Personality lives in the reactions, not in jokes.
- The first line is a declarative, scroll-stopping statement, never a question.
- One narrative spine from hook to payoff. Do not jump topics unless the previous line bridges it.

BEFORE → AFTER (study this — same facts, fixed flow):
BAD (interview ping-pong, every line a skeptical question):
A: People keep skipping product analytics like it doesn't matter.
B: Sure, but what exactly are we tracking here?
A: Stuff like button clicks, page visits, where they drop out of onboarding.
B: Okay, that sounds useful. But isn't it tough to set up?
A: These days tools like Amplitude make it really easy.
B: Fine, you collect data. But how do you use it to actually improve?
GOOD (statements that build, questions rare, varied openers, momentum):
A: Everyone obsesses over getting users — then ignores what those users actually do.
B: Which is the expensive mistake, because the behavior is the whole story.
A: Button clicks, page visits, the exact step where onboarding loses people — that's the goldmine.
B: And the part people dread, the setup, is basically solved now. Amplitude drops it into one dashboard.
A: So collecting it is easy. The leverage is reading it right.
B: That's where growth actually hides — and why Amplitude put a product lead on it to walk you through.
Notice: the GOOD version keeps every source fact (clicks, onboarding drop-off, Amplitude, the dashboard, the expert) but turns interrogation into two friends building one thread.`
    : `REAL DEBATE (HARD REQUIREMENT) — Speaker B must disagree with Speaker A on AT LEAST ONE specific point with concrete reasoning. Polite "yes but" agreement does not count. Pattern: A claims X → B says "I'd actually push back on that — [specific counter]." If both speakers agree on every line, the script fails. Emotionally: at least one line should land like a mild challenge.`;

  const planningRules = isSourceAdaptation
    ? `Before writing, decide:
1. What are the 5-7 concrete source moments that must survive in the dialogue?
2. What is the simplest possible hook a normal Instagram viewer will understand in 2 seconds?
3. Which line should Speaker B clarify, question, or add nuance to without changing the source meaning?
4. What keyword should viewers comment to get more value? Pick one short uppercase keyword tied to the reel, like AGENTS, REPLIT, PROMPT, SLIDES, or CHECKLIST.

Then adapt the original content into a dialogue reel. Keep it faithful and viral: source first, simplicity second, character flavor last.`
    : `Before writing, decide:
1. What two NAMED products/frameworks/philosophies are being compared? (If the topic names only one, pick its most natural rival.)
2. What's the one specific point Speaker B will push back on?
3. What's the closing line — a sharp reframe or a pointed question?

Then write the dialogue. Two smart friends debating on a podcast clip — not a play, not an ad. Speaker B pushes back at least once with concrete reasoning.`;

  const systemPrompt = `You write short-form reel scripts: two people having a real, natural conversation about a tech or product topic. Think smart-creator / internet-founder vibe — intelligent, slightly funny, internet-aware. NOT theatrical. NOT cringe. NOT a marketing ad.

${sourceAdaptationRules}

STYLE:
- Sound like two people actually talking, not actors performing.
- Modern, conversational, crisp. Minimal fluff. High retention per line.
- Use simple words. Assume the viewer is smart but busy and scrolling. Explain complex ideas like a sharp creator, not a professor.
- Slightly witty — dry humor over goofy humor. No forced jokes.
- If the character set has a pop-culture theme (e.g. Game of Thrones), keep theme references EXTREMELY subtle: 2-5% of the script max, usually one tiny phrase or analogy. The product/topic insight is the star, not the costume. Do NOT use catchphrases, fictional place names, or roleplay flourishes.
- Use hedging language for opinions: "feels like," "seems," "people are saying," "trying to," "sort of." Don't state opinions as facts.
- Keep technical claims accurate and grounded. No exaggerated marketing claims. No invented stats.
- Clean obvious transcript glitches when the intended name/tool is clear, but do not invent new facts.

LOGICAL FLOW (this matters most):
- Each line must build on the previous one. Real debate / real discussion, not parallel monologues.
- One person makes a point → the other reacts to that exact point, pushes back, refines, or adds a new angle.
- No restating the topic. No "tell me more" filler. No "great question" energy.
- No host/interview pattern where A only asks and B only explains.
- Do not list source facts randomly. Pick one narrative spine and connect each fact to it.
- Bad flow: "AI agents are big. Hyperagent exists. $1,000 credits. Costs are high. Comment AGENTS."
- Good flow: "Agents are becoming digital employees → Hyperagent lets builders try that → the $1,000 credit removes the excuse → the real question is whether you'll test a serious task this weekend → Comment AGENTS for the breakdown."

${structureRules}

${debateRules}

BANNED PHRASES (will be rejected): "game-changer," "democratize," "the future of," "revolutionize," "next-level," "scratching the surface," "unlock potential," "fortune favors the bold," "let me tell you," "tell me more," "great question," "convince me," "real-world use," "without hiccups," "boost productivity," "step forward," "real test will be," "only time will tell," "exciting times."

GOOD vs BAD example lines:
- BAD: "AI's predictive analytics are turning out to be game-changers."
- GOOD: "The thing people miss is Claude with skills feels closer to a junior engineer you can delegate to — Copilot still feels like fancy autocomplete."

- BAD: "Platforms democratize AI tools for small startups now."
- GOOD: "Vercel's AI SDK is what made small teams actually ship LLM features without hiring an ML person."

- BAD: "But AI's still underused in big industries. Could it really take over?"
- GOOD: "That's the weird part — if agents already work in coding, why are sales and ops still barely touching them?"

- BAD: "So it's just automation? Why should startups care?"
- GOOD: "So this is not normal automation — it's closer to giving a startup a tiny AI team."

- BAD: "Alright, what's everyone's take? Comment AGENTS if you want more."
- GOOD: "So the move isn't to watch another AI demo — it's to give one agent a real weekend task. Comment AGENTS and I'll send the breakdown."

OUTPUT FORMAT:
Output ONLY a valid JSON object — no markdown fences, no commentary.

Schema:
{
  "title": "short catchy title (under 60 chars)",
  "characterA": "name of character A",
  "characterB": "name of character B",
  "lines": [
    {
      "character": "A" or "B",
      "text": "the dialogue line — DO NOT prefix with the character name",
      "emotion": "neutral" | "excited" | "angry" | "laughing" | "thinking",
      "estimatedDuration": seconds to speak (number)
    }
  ],
  "totalEstimatedDuration": total seconds (number)
}

RULES:
- Alternate naturally. Two consecutive lines from the same character only if the second is a real continuation, not a stall.
- Aim for ${targetDuration} seconds total (~${Math.round(targetDuration / 5)} lines).
- Each line: 1–2 sentences, 3–7 seconds. Tight.
- Final line must be a comment CTA with a short keyword when adapting monitored source content.
- Never write "CharacterName:" inside the text field. Just the spoken words.
- estimatedDuration ≈ word count ÷ 2.5 (≈150 wpm).
- PG-13. Witty, not edgy.`;

  const userPrompt = `Topic for the reel:
"${topic}"

Speaker A: ${characterSet.characterA.name}
Voice/style notes: ${characterSet.characterA.speakingStyle}

Speaker B: ${characterSet.characterB.name}
Voice/style notes: ${characterSet.characterB.speakingStyle}

Theme (use only as light flavor — keep references to 1–2 max across whole script): ${characterSet.theme}
Target duration: ${targetDuration} seconds

${planningRules}

Output ONLY the JSON object.`;

  // Cheap one-shot retry: if the first generation trips a banned phrase or
  // shows no pushback, try once more with a stricter nudge before giving up.
  // Two API calls max — keeps cost predictable.
  // Quality gate runs for BOTH modes now. In source-adaptation we don't force a
  // debate (pushback optional), but we still reject banned phrases, interview
  // cadence, and repetitive openers — the things that make a script feel choppy.
  // We retry up to twice (3 calls max) and keep the BEST draft seen, since a
  // single retry often still trips the same cadence issue.
  const requirePushback = !isSourceAdaptation;
  const MAX_FLOW_RETRIES = 2;

  let raw = await callOpenAI(systemPrompt, userPrompt, openaiKey, 4096);
  let score = scoreScriptText(raw, { requirePushback });
  let best = { raw, count: score.reasons.length };

  for (let attempt = 1; attempt <= MAX_FLOW_RETRIES && score.failed; attempt++) {
    console.warn(
      `[dialogue] draft ${attempt} failed quality check: ${score.reasons.join("; ")} — retrying`
    );
    const retryNudge = `\n\nYour previous attempt FAILED because: ${score.reasons.join(
      "; "
    )}.\nRewrite it. Hard requirements: strip banned phrases; at most 2-3 question lines in the WHOLE script (convert the rest into curious statements); never start two lines with the same word; every line must grab the exact point before it and push it one step further with a varied bridge. Keep it 100% faithful to the source content.`;
    try {
      raw = await callOpenAI(systemPrompt, userPrompt + retryNudge, openaiKey, 4096);
    } catch (retryErr: any) {
      console.warn(`[dialogue] quality-retry failed (${retryErr?.message}); keeping best draft`);
      break;
    }
    score = scoreScriptText(raw, { requirePushback });
    if (score.reasons.length < best.count) best = { raw, count: score.reasons.length };
  }

  // Keep whichever draft scored best (fewest issues) across all attempts.
  if (best.count < score.reasons.length) raw = best.raw;

  try {
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as DialogueScript;

    if (!parsed.lines || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
      throw new Error("No dialogue lines in response");
    }

    // Strip leading "Name:" or "A:" / "B:" prefixes the model sometimes adds
    // despite instructions. Anything before the first colon in the first ~30
    // chars that looks like a speaker tag gets removed.
    const stripSpeakerPrefix = (text: string): string => {
      const t = text.trim();
      const m = t.match(/^([A-Za-z][A-Za-z .'-]{0,28}):\s*([\s\S]+)$/);
      return m ? m[2].trim() : t;
    };

    parsed.lines = parsed.lines.map((line) => ({
      character: line.character === "B" ? "B" : "A",
      text: stripSpeakerPrefix(String(line.text || "")),
      emotion: (["neutral", "excited", "angry", "laughing", "thinking"].includes(line.emotion)
        ? line.emotion
        : "neutral") as DialogueLine["emotion"],
      estimatedDuration: Number(line.estimatedDuration) || 4,
    }));

    parsed.totalEstimatedDuration = parsed.lines.reduce(
      (sum, l) => sum + l.estimatedDuration,
      0
    );
    parsed.characterA = characterSet.characterA.name;
    parsed.characterB = characterSet.characterB.name;

    return parsed;
  } catch (parseError) {
    console.error("Failed to parse dialogue script:", raw.substring(0, 500));
    return buildFallbackScript(topic, characterSet, targetDuration);
  }
}

function buildFallbackScript(
  topic: string,
  characterSet: CharacterSet,
  targetDuration: number
): DialogueScript {
  const a = characterSet.characterA.name;
  const b = characterSet.characterB.name;
  return {
    title: `${a} and ${b} discuss: ${topic.substring(0, 50)}`,
    characterA: a,
    characterB: b,
    lines: [
      { character: "A", text: `Hot take — most people are looking at ${topic} completely wrong.`, emotion: "excited", estimatedDuration: 4 },
      { character: "B", text: `Okay, that's a strong opener. What's the angle people are missing?`, emotion: "thinking", estimatedDuration: 4 },
      { character: "A", text: `Feels like there are two camps here, and they're solving very different problems.`, emotion: "neutral", estimatedDuration: 5 },
      { character: "B", text: `Right, and in practice that shows up the second you actually try to ship something with it.`, emotion: "thinking", estimatedDuration: 5 },
      { character: "A", text: `Exactly. One side optimizes for speed, the other for control — you can't really have both.`, emotion: "neutral", estimatedDuration: 5 },
      { character: "B", text: `Which is funny because every landing page swears you can.`, emotion: "laughing", estimatedDuration: 4 },
      { character: "A", text: `The workflow tax is the real story. People are saying setup is fine, it's day-30 that breaks them.`, emotion: "thinking", estimatedDuration: 6 },
      { character: "B", text: `So the question isn't which one's better — it's which trade-off you can live with for a year.`, emotion: "neutral", estimatedDuration: 6 },
      { character: "A", text: `Okay, last thought — would you actually bet your next project on it?`, emotion: "excited", estimatedDuration: 4 },
    ],
    totalEstimatedDuration: targetDuration,
  };
}
