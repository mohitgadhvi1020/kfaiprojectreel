/**
 * POST /api/startups/:id/explain
 *
 * "Learn mode" — after the reel + carousel + caption are generated, this
 * takes the full content package + research and produces a plain-English
 * walkthrough + glossary of every technical term, so the user can actually
 * understand what they're about to post. Uses Vertex Gemini 2.5 Pro.
 *
 * Output gets persisted on the startup row (layman_explanation) so a
 * reload doesn't re-run the call.
 */

import { NextResponse } from "next/server";
import {
  getStartupById,
  getContentByStartupId,
  getResearchByStartupId,
  updateStartup,
} from "@/lib/db";
import { callVertex } from "@/lib/vertex-client";

const SYSTEM_PROMPT = `You are a patient, nerdy-but-friendly teacher who translates dense technical AI-startup content into plain English for a smart-but-non-specialist reader (think: a product manager who has heard of "RAG" and "embeddings" but has never built with them).

Your job: given a startup's generated reel/carousel/caption + its research dossier, produce a LEARN-MODE explainer that lets the reader understand EVERY idea and term before they post it.

HARD RULES:
- Use simple, conversational English. Short sentences. No jargon without explanation.
- Define EVERY technical term the first time it appears (models, frameworks, techniques, funding terms).
- Use real-world analogies for abstract ideas (e.g., "think of embeddings as a way to turn words into coordinates on a map").
- NEVER invent facts. If something is unclear from the source, say "the research doesn't spell this out" — don't guess.
- Stay tight — quality over word count.

OUTPUT FORMAT (Markdown, exactly these 4 sections):

## 🎯 The 30-Second Pitch
2-3 plain sentences explaining what the startup does and why anyone should care. No acronyms.

## 🧩 How It Actually Works (Plain English)
A numbered 4-6 step walkthrough of the product's pipeline, as if explaining to a curious friend. Each step: one line of what happens, one line of why it matters. Use analogies for anything technical.

## 📖 Glossary — Every Term Decoded
A bulleted list. For each technical term, acronym, framework, model name, or funding term that appears in the reel/carousel/caption:
- **Term** — 1-2 sentence plain-English definition. If helpful, add "Think of it like…" with an analogy.
Cover ALL of them, including ones a beginner might miss (e.g., "Series A", "fine-tuning", "inference", "RAG", "token", "ICP").

## 💡 Why This Matters to a Builder
2-3 sentences explaining the one transferable pattern or insight a viewer could apply to their own work. Concrete, not hand-wavy.`;

function safe(s: any): string {
  if (s == null) return "";
  if (Array.isArray(s)) return s.filter(Boolean).join("\n- ");
  if (typeof s === "object") return JSON.stringify(s, null, 2);
  return String(s);
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const startup: any = await getStartupById(params.id);
    if (!startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const [contentRows, researchRow] = await Promise.all([
      getContentByStartupId(params.id),
      getResearchByStartupId(params.id),
    ]);

    const contentArr = Array.isArray(contentRows) ? contentRows : [];
    const pickContent = (type: string) =>
      contentArr.find((c: any) => c.content_type === type)?.content || "";
    const reel = pickContent("reel_script");
    const carousel = pickContent("carousel_text");
    const caption = pickContent("caption_hashtags");

    if (!reel && !carousel && !caption) {
      return NextResponse.json(
        { error: "No generated content yet. Generate the reel first." },
        { status: 400 }
      );
    }

    // research_data is stored as ONE row per startup with a column per stream.
    // Some rows also carry a JSON blob in `technical_research` when the full
    // insert failed and the minimal-payload fallback kicked in. Handle both.
    const r: any = researchRow || {};
    const sectionColumns: Array<[string, string]> = [
      ["TECHNICAL", safe(r.technical_research)],
      ["PRODUCT", safe(r.product_research)],
      ["MARKET", safe(r.market_research)],
      ["FOUNDERS", safe(r.founders_research)],
      ["BUSINESS", safe(r.business_research)],
      ["CONTRARIAN", safe(r.contrarian_research)],
      ["VIRAL", safe(r.viral_research)],
    ];
    let researchDigest = sectionColumns
      .filter(([, content]) => content && content.trim().length > 0)
      .map(([label, content]) => `### ${label}\n${content.slice(0, 4000)}`)
      .join("\n\n");

    // Fallback: if only `technical_research` is populated and it looks like a
    // JSON blob (minimal-payload path), unpack it into sections.
    if (!researchDigest && typeof r.technical_research === "string") {
      try {
        const blob = JSON.parse(r.technical_research);
        researchDigest = Object.entries(blob)
          .filter(([, v]) => typeof v === "string" && (v as string).trim().length > 0)
          .map(([k, v]) => `### ${k.toUpperCase()}\n${(v as string).slice(0, 4000)}`)
          .join("\n\n");
      } catch {}
    }

    const userPrompt = `Translate this startup's content package into Learn Mode.

=== STARTUP ===
Name: ${safe(startup.name)}
Funding: ${safe(startup.funding_amount)} (${safe(startup.funding_round)})
Lead investor: ${safe(startup.investor)}
Description: ${safe(startup.description)}
Tech: ${safe(startup.tech)}

=== THE REEL SCRIPT ===
${reel || "(no reel yet)"}

=== CAROUSEL ===
${carousel || "(no carousel yet)"}

=== CAPTION + HASHTAGS ===
${caption || "(no caption yet)"}

=== RESEARCH DOSSIER (for context — ground the glossary in these facts, don't invent) ===
${researchDigest || "(no research rows found)"}

Now produce the 4-section Markdown Learn-Mode explainer. Make sure the Glossary covers EVERY technical term that appears anywhere above.`;

    const explanation = await callVertex(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 6000,
      temperature: 0.4,
    });

    const now = new Date().toISOString();
    await updateStartup(params.id, {
      layman_explanation: explanation,
      layman_generated_at: now,
    });

    return NextResponse.json({
      success: true,
      explanation,
      generatedAt: now,
    });
  } catch (err: any) {
    console.error("[startup-explain] failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate plain-English explainer" },
      { status: 500 }
    );
  }
}
