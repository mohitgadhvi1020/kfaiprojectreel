/**
 * POST /api/monitor/translate-script
 *
 * Translates an English dialogue script to Hindi (Hinglish-style for reels).
 * Keeps the spoken, conversational tone — not formal Hindi.
 *
 * Body: { script: string }
 * Returns: { hindiScript: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getActiveSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { script } = body;

    if (!script || typeof script !== "string") {
      return NextResponse.json(
        { error: "Script text is required" },
        { status: 400 }
      );
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key required. Set it in Settings." },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a script translator for short-form Instagram reels.

TASK: Translate the English dialogue script below into Hindi.

STYLE RULES:
- Use spoken, conversational Hindi — the way two friends would actually talk on a podcast or reel.
- Use Hinglish naturally: keep English tech terms, product names, brand names, and common English words as-is (e.g. "AI", "startup", "coding", "workflow", "open-source", "API", "subscribe").
- Do NOT use heavily Sanskritized/formal Hindi. Think casual Delhi/Mumbai Hindi, not news anchor Hindi.
- Keep the same energy, humor, and tone as the original.
- Preserve line breaks — each line should stay as a separate line.
- Do NOT add character names or labels. Just the spoken dialogue lines.
- Keep it tight — same length or shorter than the English version.

OUTPUT: Return ONLY the Hindi script lines, separated by blank lines. No labels, no commentary, no markdown.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openai_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: script },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `OpenAI API error (${response.status}): ${err.slice(0, 200)}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const hindiScript = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ hindiScript });
  } catch (err: any) {
    console.error("[translate-script] Error:", err);
    return NextResponse.json(
      { error: err.message || "Translation failed" },
      { status: 500 }
    );
  }
}
