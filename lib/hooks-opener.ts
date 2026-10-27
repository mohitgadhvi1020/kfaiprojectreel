/**
 * Shared helper: generate viral hook variants + an AI cold-open clip concept
 * (Veo 3 + Higgsfield prompts) from a monitored_content item.
 *
 * Used by BOTH the reel-script flow (/api/monitor/:id/generate) and the
 * dialogue-video flow (/api/monitor/:id/generate-dialogue) so every monitored
 * item gets hooks + an opener clip regardless of which output format the user
 * picks.
 */

import { MONITOR_PROMPTS } from "@/config/api-keys";
import { callVertex } from "@/lib/vertex-client";
import { callOpenAIImpl } from "@/lib/content-generator";

export interface HooksAndOpener {
  hooks: string;
  openerConcept: string;
  veoPrompt: string;
  higgsfieldPrompt: string;
}

function safe(s: any): string {
  if (s == null) return "";
  if (Array.isArray(s)) return s.filter(Boolean).join("\n- ");
  return String(s);
}

/**
 * Split an LLM response into UPPERCASE-labeled blocks. Each block runs from its
 * label to the start of the next recognized label, so blocks never bleed.
 */
export function parseLabeledBlocks(
  text: string,
  labels: readonly string[]
): { lead: string; blocks: Record<string, string> } {
  const found = labels
    .map((label) => ({
      label,
      idx: text.search(new RegExp(`^\\s*${label}\\s*:`, "im")),
    }))
    .filter((m) => m.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  const firstIdx = found.length ? found[0].idx : text.length;
  const lead = text.slice(0, firstIdx).trim();

  const blocks: Record<string, string> = {};
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx;
    const end = i + 1 < found.length ? found[i + 1].idx : text.length;
    blocks[found[i].label] = text
      .slice(start, end)
      .replace(new RegExp(`^\\s*${found[i].label}\\s*:\\s*`, "i"), "")
      .trim();
  }
  return { lead, blocks };
}

async function callLLM(system: string, user: string, openaiKey?: string): Promise<string> {
  const provider = (process.env.GENERATION_PROVIDER || "vertex").toLowerCase();
  if (provider === "openai" && openaiKey) {
    return callOpenAIImpl(system, user, openaiKey, 1500);
  }
  try {
    return await callVertex(system, user, { maxTokens: 1500, temperature: 0.8 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    // Fall back to OpenAI on auth/config/credentials-file errors so a
    // misconfigured Vertex project/key doesn't brick hook generation.
    const shouldFallback =
      openaiKey &&
      /401|403|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|permission_denied|unauthenticated|empty text|ENOENT|no such file|does not exist|credentials/i.test(
        msg
      );
    if (shouldFallback) {
      console.warn("[hooks-opener] Vertex failed, falling back to OpenAI:", msg.slice(0, 160));
      return callOpenAIImpl(system, user, openaiKey!, 1500);
    }
    throw err;
  }
}

/**
 * Build the source brief and generate hooks + opener clip prompts for an item.
 * Throws on hard LLM failure — callers should wrap in try/catch if the result
 * is non-critical (e.g. the dialogue flow generates this best-effort).
 */
export async function generateHooksAndOpener(
  item: any,
  openaiKey?: string
): Promise<HooksAndOpener> {
  const transcript = safe(item.raw_text).slice(0, 12000);
  const summary = safe(item.summary);
  const topics = safe(item.topics);
  const tools = safe(item.tools_mentioned);
  const insights = safe(item.key_insights);
  const sourceHandle = item.source_channel_name || item.source_channel_id || "";

  const userPrompt = `Generate viral hooks + an AI cold-open clip from the source below.

=== SOURCE ===
Platform: ${safe(item.source)}
Creator: ${sourceHandle}
Title: ${safe(item.title)}

=== SUMMARY ===
${summary || "(none)"}

=== TOPICS ===
${topics || "(none)"}

=== TOOLS / FRAMEWORKS ===
${tools || "(none)"}

=== KEY INSIGHTS ===
${insights || "(none)"}

=== RAW TRANSCRIPT / CAPTION (primary source — ground every hook here) ===
${transcript || "(no transcript — rely on the summary & insights above)"}

Output the HOOKS, OPENER_CONCEPT, VEO_PROMPT, and HIGGSFIELD_PROMPT blocks now.`;

  const text = await callLLM(MONITOR_PROMPTS.hooks_and_opener_clip, userPrompt, openaiKey);
  const { blocks } = parseLabeledBlocks(text, [
    "HOOKS",
    "OPENER_CONCEPT",
    "VEO_PROMPT",
    "HIGGSFIELD_PROMPT",
  ]);

  return {
    hooks: blocks.HOOKS || "",
    openerConcept: blocks.OPENER_CONCEPT || "",
    veoPrompt: blocks.VEO_PROMPT || "",
    higgsfieldPrompt: blocks.HIGGSFIELD_PROMPT || "",
  };
}
