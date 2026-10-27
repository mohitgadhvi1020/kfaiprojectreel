/**
 * POST /api/startups/manual
 *
 * Manually add a startup by name (no discovery run needed). We ask Perplexity
 * to fill in the basic metadata (funding, round, investor, one-line
 * description, key tech) based on the name alone, then insert the row into
 * `startups` with content_status="none" so the user can click "Generate Reel"
 * from the dashboard just like any discovered startup.
 *
 * Body: { name: string, hint?: string }
 *   - name: startup name (required)
 *   - hint: optional extra context the user types ("they do AI for X") that we
 *           pass along to help Perplexity disambiguate.
 */

import { NextResponse } from "next/server";
import * as db from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";

async function lookupStartupMeta(
  name: string,
  hint: string,
  perplexityKey: string
): Promise<{
  funding_amount: string;
  funding_round: string;
  investor: string;
  description: string;
  tech: string;
  scale: string;
  builder_value: string;
  raw: string;
}> {
  const prompt = `I need structured metadata for the AI startup "${name}"${
    hint ? ` (context: ${hint})` : ""
  }. Use the most recent public info you can find (funding announcements, Crunchbase, TechCrunch, YC pages, their website, founder tweets).

Return EXACTLY one line in this pipe-separated format (no markdown, no bullets, no prose around it):

NAME | FUNDING_AMOUNT | ROUND_TYPE | ONE_LINE_DESCRIPTION | LEAD_INVESTOR | KEY_TECH_USED | SCALE | BUILDER_VALUE

Where:
- FUNDING_AMOUNT: e.g. "$8M", "$250K", or "Undisclosed" if unknown
- ROUND_TYPE: Seed, Pre-seed, Series A, Series B, YC Seed, etc. — or "Unknown"
- ONE_LINE_DESCRIPTION: one sentence, concrete, no fluff
- LEAD_INVESTOR: e.g. "Accel", "Y Combinator", or "Undisclosed"
- KEY_TECH_USED: short phrase about their technical approach (e.g. "custom diffusion models", "agentic RAG", "fine-tuned Llama")
- SCALE: exactly "small" (under $10M) or "medium" ($10M–$50M) or "large" ($50M+)
- BUILDER_VALUE: exactly "high" or "medium" or "low"

If you truly cannot find anything about this startup, return:
${name} | Unknown | Unknown | (no public info found) | Unknown | Unknown | small | low`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perplexityKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Perplexity ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content || "";

  // Find the pipe-separated line in the response
  const line =
    content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.split("|").length >= 7) || "";

  const parts = line.split("|").map((p) => p.trim());
  const [
    ,
    funding_amount = "Unknown",
    funding_round = "Unknown",
    description = "(no public info found)",
    investor = "Unknown",
    tech = "Unknown",
    scale = "small",
    builder_value = "medium",
  ] = parts;

  return {
    funding_amount,
    funding_round,
    investor,
    description,
    tech,
    scale: scale.toLowerCase(),
    builder_value: builder_value.toLowerCase(),
    raw: content,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawName = String(body?.name || "").trim();
    const hint = String(body?.hint || "").trim();

    if (!rawName) {
      return NextResponse.json(
        { error: "Startup name is required" },
        { status: 400 }
      );
    }
    if (rawName.length > 120) {
      return NextResponse.json(
        { error: "Name is too long — please enter a real startup name." },
        { status: 400 }
      );
    }

    // Dedupe by case-insensitive name
    const existing = await db.getAllStartupNames();
    if (existing.has(rawName.toLowerCase())) {
      return NextResponse.json(
        { error: `"${rawName}" is already in your startup list.` },
        { status: 409 }
      );
    }

    const settings = await getActiveSettings();
    if (!settings.perplexity_api_key) {
      return NextResponse.json(
        { error: "Perplexity API key not configured. Go to Settings." },
        { status: 400 }
      );
    }

    const meta = await lookupStartupMeta(rawName, hint, settings.perplexity_api_key);

    // Create a synthetic run so downstream /api/generate has a run_id to attach
    // research + content rows to. We mark it "ready" immediately because the
    // actual content generation is a separate user-triggered step.
    const run = await db.createRun();
    await db.updateRun(run.id, {
      status: "ready",
      startups_found: 1,
      x_tips_found: 0,
      trending_found: 0,
      raw_startups: `[manual add] ${rawName}${hint ? ` | hint: ${hint}` : ""}\n\n${meta.raw}`,
    });

    const row = {
      name: rawName,
      funding_amount: meta.funding_amount,
      funding_round: meta.funding_round,
      investor: meta.investor,
      description: meta.description,
      tech: meta.tech,
      scale: meta.scale,
      builder_value: meta.builder_value,
      run_id: run.id,
      discovered_at: new Date().toISOString(),
      is_used: false,
      reel_created: false,
      content_status: "none",
    };

    const ok = await db.insertStartup(row);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to insert startup (maybe a duplicate slipped through)." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, startup: row, raw: meta.raw });
  } catch (err: any) {
    console.error("[manual-startup] failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to add startup" },
      { status: 500 }
    );
  }
}
