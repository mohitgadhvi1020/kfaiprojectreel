import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `You are a fast web-research analyst summarizing AI startups for a technical / business content creator.

Given a startup name + funding context, return a CRISP preview covering:

## What they do
1-2 sentences on the core product and who it's for.

## Tech stack (what's known)
Any named AI models, architecture patterns (RAG / agentic / fine-tuning / etc.), frameworks, or infra — only what's publicly documented. Say "unverified" where data isn't available. Don't guess.

## Business angle
Revenue model, pricing if public, named customers, GTM motion. Keep it factual.

## Market + funding
TAM if any source reports it. Lead investor and co-investors. Key competitors (2-3 named).

## Worth a deeper dive?
One honest line: is there a specific technical insight, business model pattern, or market observation here that would make a good builder-focused reel? Or is it a generic vertical AI play with nothing interesting to teach?

RULES:
- Include inline URL citations wherever possible.
- If a fact isn't verifiable, say "unverified" — NEVER fabricate names, numbers, or benchmarks.
- Max ~400 words total. This is a preview, not a deep-dive.
- Plain markdown. No emojis, no fluff phrases.`;

export async function POST(request: NextRequest) {
  try {
    const { startup_id } = await request.json();
    if (!startup_id) {
      return NextResponse.json({ error: "startup_id required" }, { status: 400 });
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 400 });
    }

    const startup = await db.getStartupById(startup_id);
    if (!startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const userPrompt = `Give a quick preview of the AI startup '${startup.name}' (raised ${startup.funding_amount} ${startup.funding_round}).

Context: ${startup.description}
Tech focus: ${startup.tech || "unverified"}
Lead investor: ${startup.investor || "unverified"}

Follow the section structure in the system prompt.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openai_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        web_search_options: {},
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || "";
    const annotations = choice?.message?.annotations || [];
    const citations = annotations
      .filter((a: any) => a?.type === "url_citation")
      .map((a: any) => ({
        title: a.url_citation?.title,
        url: a.url_citation?.url,
      }));

    return NextResponse.json({
      content,
      citations,
      usage: data.usage,
    });
  } catch (error: any) {
    console.error("quick-research error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch quick preview" },
      { status: 500 }
    );
  }
}
