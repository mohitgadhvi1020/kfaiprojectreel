import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { reviseContent } from "@/lib/content-generator";
import { getActiveSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const { content_id, instructions } = await request.json();

    if (!content_id || !instructions?.trim()) {
      return NextResponse.json(
        { error: "content_id and instructions are required" },
        { status: 400 }
      );
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key required. Go to Settings." },
        { status: 400 }
      );
    }

    const allContent = await db.getAllContent(1000);
    const contentItem = allContent.find((c: any) => c.id === content_id);
    if (!contentItem) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    let startupName = "";
    if (contentItem.startup_id) {
      const startup = await db.getStartupById(contentItem.startup_id);
      startupName = startup?.name || "";
    } else if (contentItem.x_tip_id) {
      const tip = await db.getXTipById(contentItem.x_tip_id);
      startupName = tip ? `@${(tip.author || "").replace(/^@+/, "")} tip` : "";
    }

    const preferencesText = await db.getPreferencesText();

    const contentTypeLabels: Record<string, string> = {
      reel_script: "Reel Script",
      carousel_text: "Carousel Text",
      caption_hashtags: "Caption + Hashtags",
    };

    const revised = await reviseContent(
      {
        contentType: contentTypeLabels[contentItem.content_type] || contentItem.content_type,
        currentContent: contentItem.content,
        userInstructions: instructions.trim(),
        startupName,
        preferencesText,
      },
      settings.openai_api_key
    );

    await db.updateContent(content_id, {
      content: revised,
      is_refined: true,
    });

    return NextResponse.json({ success: true, revised_content: revised });
  } catch (error: any) {
    console.error("Content revision failed:", error);
    return NextResponse.json(
      { error: error.message || "Revision failed. Try again." },
      { status: 500 }
    );
  }
}
