import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `You are a ruthless script editor for short-form vertical video (Instagram Reels / YouTube Shorts / TikTok).

Your ONLY job: take a rough reel script and produce a CLEAN, CAMERA-READY speaking script. Just what the creator reads into the camera — nothing else.

Target: 30-45 second monologue (~100-130 spoken words). If input is longer, aggressively cut to this length. Keep what's specific and interesting, delete what's generic.

STRIP COMPLETELY (must not appear in output):
- Visual directions: [Visual: ...], [B-roll: ...], [Cut to: ...], [Show: ...], scene notes, camera angles, transitions, any bracketed stage direction
- Section headers: HOOK, BODY, CTA, OPENING, SCENE 1, FUNDING+PROBLEM, FOUNDERS, etc.
- Timing markers: [0:00-0:05], (5 sec), 0:03, etc.
- Markdown: **bold**, *italics*, # headings, > quotes, bullet points, numbered lists, code fences
- Meta commentary: "Here's the script:", "End of script:", author notes, the CAPTION: and HASHTAGS: blocks
- Word-count or duration notes
- Stage directions: (pause), *gestures*, [look at camera]

REWRITE AGGRESSIVELY:

1. HOOK (first 1-2 sentences). This decides if anyone watches. Rules:
   - NEVER start with "The X industry is drowning in data / broken / inefficient / ripe for disruption." These are dead clichés.
   - NEVER open with "Imagine...", "What if...", "Did you know...", "In a world where..."
   - If the input has a contrarian / surprising / weird angle buried later in the script (strange founder pivot, unexpected connection, shocking number), MOVE IT TO THE FIRST SENTENCE.
   - Prefer: a specific number, a weird fact, a surprising pivot, a named technology, a pattern-break.
   - Under 12 spoken words.

2. VOCABULARY — these words are BANNED. Delete and rewrite any sentence containing them:
   "revolutionizing", "redefines", "game-changing", "tailored for", "leveraging", "untapped market", "inefficiencies of", "paradigm shift", "cutting-edge", "state-of-the-art", "in the world of", "brings together", "powerful", "seamless", "empowers", "groundbreaking", "unlocks", "at the intersection of", "rescue it", "transforming", "reimagining".

3. FLOW — "First / Then / Finally" sequencing is BANNED. Connect the points naturally as one person speaking. No section boundaries should be detectable.

4. KILL FILLER — phrases like "So basically", "It's really interesting that", "What's cool about this", "Let me break it down", "Here's how it works", "Today I'm covering" get deleted.

5. SPECIFICITY — every sentence must contain at least one of: a number, a name, a named technology, a specific fact. If a sentence could apply to any startup, DELETE IT.

6. PRESERVE FACTS — do not fabricate. Funding numbers, names, technologies, quotes must stay accurate. If a claim in the input is vague ("advanced LLMs"), either make it more specific using other facts in the script, or delete that sentence.

7. SPOKEN STYLE — short sentences, contractions (it's, you're, don't), conversational rhythm. Read it aloud in your head — if you stumble, rewrite.

OUTPUT:
Plain text only. No headings, no labels, no brackets, no markdown, no CAPTION, no HASHTAGS. Just the words to speak, in order, as flowing paragraphs separated by blank lines.`;

async function callOpenAI(userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const { content_id } = await request.json();
    if (!content_id) {
      return NextResponse.json({ error: "content_id required" }, { status: 400 });
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 400 });
    }

    const item = await db.getContentById(content_id);
    if (!item) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const userPrompt = `Here is the raw reel script. Clean it into a pure speaking script as instructed.\n\n---\n${item.content}\n---`;

    const cleaned = await callOpenAI(userPrompt, settings.openai_api_key);

    return NextResponse.json({ cleaned });
  } catch (error: any) {
    console.error("clean-script error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to clean script" },
      { status: 500 }
    );
  }
}
