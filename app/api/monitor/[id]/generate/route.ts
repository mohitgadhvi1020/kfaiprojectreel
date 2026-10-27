/**
 * POST /api/monitor/:id/generate
 *
 * Distills a monitored video/post into a 55-65 second Reel script using Vertex
 * Gemini (via the shared callLLM dispatcher, which falls back to OpenAI).
 *
 * Input: the monitored_content row (title, transcript, summary, topics,
 * tools_mentioned, key_insights). No extra user input required.
 *
 * Output: a script + caption + hashtags, persisted inline on the row.
 */

import { NextResponse } from "next/server";
import { getMonitoredContentById, updateMonitoredContent } from "@/lib/db";
import { MONITOR_PROMPTS } from "@/config/api-keys";
import { callVertex } from "@/lib/vertex-client";
import { callOpenAIImpl } from "@/lib/content-generator";
import { getActiveSettings } from "@/lib/settings";

function safe(s: any): string {
  if (s == null) return "";
  if (Array.isArray(s)) return s.filter(Boolean).join("\n- ");
  return String(s);
}

async function callLLM(system: string, user: string, openaiKey?: string): Promise<{ text: string; model: string }> {
  const provider = (process.env.GENERATION_PROVIDER || "vertex").toLowerCase();
  const model = process.env.VERTEX_MODEL || "gemini-2.5-pro";

  if (provider === "openai" && openaiKey) {
    const text = await callOpenAIImpl(system, user, openaiKey, 4000);
    return { text, model: "gpt-4o" };
  }
  try {
    const text = await callVertex(system, user, { maxTokens: 4000, temperature: 0.7 });
    return { text, model };
  } catch (err: any) {
    const msg = String(err?.message || err);
    const shouldFallback =
      openaiKey &&
      /401|403|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|permission_denied|unauthenticated|empty text|ENOENT|no such file|does not exist|credentials/i.test(msg);
    if (shouldFallback) {
      console.warn("[monitor-generate] Vertex failed, falling back to OpenAI:", msg.slice(0, 200));
      const text = await callOpenAIImpl(system, user, openaiKey!, 4000);
      return { text, model: "gpt-4o" };
    }
    throw err;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const item: any = await getMonitoredContentById(params.id);
    if (!item) {
      return NextResponse.json({ error: "Monitored item not found" }, { status: 404 });
    }

    const transcript = safe(item.raw_text).slice(0, 12000); // cap to protect token budget
    const summary = safe(item.summary);
    const topics = safe(item.topics);
    const tools = safe(item.tools_mentioned);
    const insights = safe(item.key_insights);
    const ideas = safe(item.content_ideas);

    if (!transcript && !summary && !insights) {
      return NextResponse.json(
        {
          error:
            "This item has no transcript, summary, or insights to work from. Re-poll the channel or pick another item.",
        },
        { status: 400 }
      );
    }

    const sourceHandle = item.source_channel_name || item.source_channel_id || "";

    const userPrompt = `Create a 55-65 second Reel script distilled from the source below. Remember: DO NOT describe the video — teach the viewer what the video taught you, in your own builder voice.

=== SOURCE ===
Platform: ${item.source}
Creator: ${sourceHandle}
Title: ${safe(item.title)}
URL: ${safe(item.url)}

=== AI-EXTRACTED SUMMARY ===
${summary || "(no summary)"}

=== TOPICS ===
${topics || "(none)"}

=== TOOLS / FRAMEWORKS MENTIONED ===
${tools || "(none)"}

=== KEY INSIGHTS ===
${insights || "(none)"}

=== CONTENT IDEAS (from prior analysis — for flavour, not mandatory to include) ===
${ideas || "(none)"}

=== RAW TRANSCRIPT / CAPTION (primary source — ground every specific claim here) ===
${transcript || "(no transcript available — rely on the summary & insights above)"}

Write the script now. Credit the source creator (${sourceHandle}) in the CTA section as specified.`;

    const settings = await getActiveSettings();
    const { text, model } = await callLLM(
      MONITOR_PROMPTS.video_derived_script,
      userPrompt,
      settings.openai_api_key
    );

    // ── Split the LLM output into labeled blocks ──
    // The model emits the script first, then a sequence of UPPERCASE-labeled
    // blocks (CAPTION, HASHTAGS, HOOKS, OPENER_CONCEPT, VEO_PROMPT,
    // HIGGSFIELD_PROMPT). We locate each label and slice the text between
    // consecutive labels so a block never bleeds into the next.
    const LABELS = [
      "CAPTION",
      "HASHTAGS",
      "HOOKS",
      "OPENER_CONCEPT",
      "VEO_PROMPT",
      "HIGGSFIELD_PROMPT",
    ] as const;

    // Find each label's position (first match only), keeping document order.
    const found = LABELS.map((label) => ({
      label,
      idx: text.search(new RegExp(`^\\s*${label}\\s*:`, "im")),
    }))
      .filter((m) => m.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    // Everything before the first recognized label is the spoken script.
    const firstIdx = found.length ? found[0].idx : text.length;
    const script = text.slice(0, firstIdx).trim();

    // Slice each block from its label to the start of the next label.
    const blocks: Record<string, string> = {};
    for (let i = 0; i < found.length; i++) {
      const start = found[i].idx;
      const end = i + 1 < found.length ? found[i + 1].idx : text.length;
      blocks[found[i].label] = text
        .slice(start, end)
        .replace(new RegExp(`^\\s*${found[i].label}\\s*:\\s*`, "i"), "")
        .trim();
    }

    const caption = blocks.CAPTION || "";
    const hashtags = blocks.HASHTAGS || "";
    const hooks = blocks.HOOKS || "";
    const openerConcept = blocks.OPENER_CONCEPT || "";
    const veoPrompt = blocks.VEO_PROMPT || "";
    const higgsfieldPrompt = blocks.HIGGSFIELD_PROMPT || "";

    await updateMonitoredContent(params.id, {
      generated_script: script,
      generated_caption: caption,
      generated_hashtags: hashtags,
      generated_hooks: hooks,
      opener_clip_concept: openerConcept,
      opener_clip_veo_prompt: veoPrompt,
      opener_clip_higgsfield_prompt: higgsfieldPrompt,
      script_model: model,
      script_generated_at: new Date().toISOString(),
      // Bump status to "reviewed" so the monitor list reflects that the item was acted on.
      status: item.status === "new" ? "reviewed" : item.status,
    });

    return NextResponse.json({
      success: true,
      script,
      caption,
      hashtags,
      hooks,
      openerConcept,
      veoPrompt,
      higgsfieldPrompt,
      model,
    });
  } catch (err: any) {
    console.error("[monitor-generate] failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate script from this item." },
      { status: 500 }
    );
  }
}
