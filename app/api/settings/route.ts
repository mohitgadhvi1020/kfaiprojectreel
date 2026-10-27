import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await db.getSettings();

    const masked = { ...data };
    const keyFields = [
      "perplexity_api_key",
      "openai_api_key",
      "supabase_service_key",
    ];
    for (const field of keyFields) {
      if (masked[field] && masked[field].length > 4) {
        masked[field] = "••••••••" + masked[field].slice(-4);
      }
    }

    return NextResponse.json(masked);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Get current settings to check for masked values
    const current = await db.getSettings();

    const KEY_PREFIXES: Record<string, string[]> = {
      perplexity_api_key: ["pplx-"],
      openai_api_key: ["sk-"],
    };

    const updates: Record<string, any> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (key === "id") continue;
      if (typeof value === "string" && value.startsWith("••••••••")) {
        continue; // Skip masked values - keep existing
      }
      // Validate API-key shape to block browser-autofill junk
      if (KEY_PREFIXES[key] && typeof value === "string" && value.length > 0) {
        const ok = KEY_PREFIXES[key].some(p => value.startsWith(p));
        if (!ok) {
          rejected.push(key);
          continue;
        }
      }
      updates[key] = value;
    }

    if (rejected.length > 0 && Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: `Rejected invalid key format for: ${rejected.join(", ")}. Expected prefixes — Perplexity: pplx-, OpenAI: sk-. This often happens from browser password autofill.`,
        },
        { status: 400 }
      );
    }

    const saved = await db.updateSettings(updates);
    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
