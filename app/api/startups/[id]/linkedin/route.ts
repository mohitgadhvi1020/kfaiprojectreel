/**
 * POST /api/startups/:id/linkedin
 *
 * Generates a single ready-to-paste LinkedIn post (Sorai Tech company voice) for
 * a startup, reusing the SAME research dossier the Instagram flow produces.
 *
 * Flow:
 *  - If research already exists for this startup (because IG hooks/script were
 *    generated), reuse it — free, instant.
 *  - If not, run the deep research pass first (costs a Perplexity call), so the
 *    LinkedIn flow works standalone straight from the Startups DB.
 *  - Upsert a single generated_content row with content_type = 'linkedin_post'.
 *
 * Optional body: { selected_hook } — anchors the post around a picked hook.
 */

import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { runDeepResearch } from "@/lib/research";
import { generateAndVerifyLinkedInPost } from "@/lib/content-generator";
import { getActiveSettings } from "@/lib/settings";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const startupId = params.id;
  try {
    const body = await req.json().catch(() => ({}));
    const selectedHook = body?.selected_hook || null;

    const startup: any = await db.getStartupById(startupId);
    if (!startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const settings = await getActiveSettings();
    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key required. Go to Settings." },
        { status: 400 }
      );
    }

    // Research must be rich enough to name founders + describe the tech they're
    // building. Reuse what we have, but re-run a fresh deep-research pass if it's
    // missing entirely OR "thin" (no founders OR no technical content) — that's
    // what produced earlier posts with no founder names.
    let research: any = await db.getResearchByStartupId(startupId);

    const isThin = (r: any) =>
      !r ||
      !((r.founders_research || "").trim()) ||
      !((r.technical_research || "").trim());

    if (isThin(research)) {
      if (!settings.perplexity_api_key) {
        if (!research) {
          return NextResponse.json(
            {
              error:
                "No research found for this startup yet. Generate the breakdown (hooks) first, or add a Perplexity API key in Settings to research from here.",
            },
            { status: 400 }
          );
        }
        // Have thin research but no key to improve it — proceed with what we have.
        console.warn("[linkedin] research is thin and no Perplexity key to refresh; proceeding.");
      } else {
        console.log(`[linkedin] research ${research ? "thin" : "missing"} for ${startup.name} — running fresh deep research.`);
        const fresh = await runDeepResearch(
          {
            name: startup.name,
            funding_amount: startup.funding_amount,
            funding_round: startup.funding_round,
            description: startup.description,
          },
          settings.perplexity_api_key
        );
        const researchRow = {
          run_id: startup.run_id,
          startup_id: startupId,
          technical_research: fresh.technical.content,
          technical_sources: fresh.technical.citations,
          product_research: fresh.product.content,
          product_sources: fresh.product.citations,
          market_research: fresh.market.content,
          market_sources: fresh.market.citations,
          founders_research: fresh.founders.content,
          founders_sources: fresh.founders.citations,
          business_research: fresh.business.content,
          business_sources: fresh.business.citations,
          contrarian_research: fresh.contrarian.content,
          contrarian_sources: fresh.contrarian.citations,
          viral_angles: fresh.viral.content,
          research_quality_score: fresh.qualityScore,
          research_passed: fresh.passed,
          research_warning: fresh.warning,
          created_at: new Date().toISOString(),
        };

        // Adopt the fresh research only if it's actually richer than what we had
        // (avoids replacing decent research with a worse re-run). Persist by
        // replacing the old row. The fact-check pass guards against hallucination.
        const freshIsBetter = !research || !isThin(researchRow);
        if (freshIsBetter) {
          try {
            await db.deleteResearchByStartupId(startupId);
            await db.insertResearch(researchRow);
          } catch (e) {
            console.warn("[linkedin] research replace failed (non-fatal):", e);
          }
          research = researchRow;
        } else if (!research) {
          research = researchRow; // nothing before; use it even if still thin
        }

        // If we STILL have no usable founders/tech and started from nothing, the
        // startup is too obscure to cover responsibly.
        if (!research || (!(research.founders_research || "").trim() && !(research.technical_research || "").trim() && !(research.market_research || "").trim())) {
          return NextResponse.json(
            {
              error: `Couldn't gather enough public information on "${startup.name}" to write a grounded post (founders/tech not found). Try a startup with more public coverage.`,
            },
            { status: 422 }
          );
        }
      }
    }

    const prefs = await db.getPreferencesText();

    const { post, verification, tagTargets } = await generateAndVerifyLinkedInPost(
      {
        name: startup.name,
        funding: startup.funding_amount,
        round: startup.funding_round,
        selectedHook,
        technicalResearch: research.technical_research || "",
        productResearch: research.product_research || "",
        marketResearch: research.market_research || "",
        foundersResearch: research.founders_research || "",
        businessResearch: research.business_research || "",
        contrarianResearch: research.contrarian_research || "",
        viralAngles: research.viral_angles || "",
        warning: research.research_warning || "",
        website: startup.website,
      },
      settings.openai_api_key,
      prefs
    );

    // Upsert: update the existing linkedin_post row if present, else insert one.
    // We intentionally do NOT touch the IG content rows for this startup.
    const existing = (await db.getContentByStartupId(startupId)) as any[];
    const existingPost = existing.find((c) => c.content_type === "linkedin_post");

    // Save with tag_targets; if that column doesn't exist yet (migration not run),
    // retry without it so the post still saves. Mirrors the hooks_cache fallback.
    const base: any = {
      content: post,
      selected_hook: selectedHook,
      is_refined: true,
      reviewer_notes: verification.notes,
    };
    const saveUpdate = async (withTags: boolean) =>
      db.updateContent(existingPost!.id, withTags ? { ...base, tag_targets: tagTargets } : base);
    const saveInsert = async (withTags: boolean) => {
      const row: any = {
        run_id: startup.run_id || null,
        startup_id: startupId,
        x_tip_id: null,
        content_type: "linkedin_post",
        hooks: null,
        quality_score: null,
        created_at: new Date().toISOString(),
        ...base,
      };
      if (withTags) row.tag_targets = tagTargets;
      const inserted = await db.insertContent([row]);
      return Array.isArray(inserted) ? inserted[0] : inserted;
    };

    let saved: any;
    try {
      saved = existingPost ? await saveUpdate(true) : await saveInsert(true);
    } catch (e) {
      console.warn("[linkedin] save with tag_targets failed (run migration?); retrying without:", e);
      saved = existingPost ? await saveUpdate(false) : await saveInsert(false);
    }

    return NextResponse.json({ success: true, content: saved, post, verification, tagTargets });
  } catch (err: any) {
    console.error("[linkedin] generation failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate LinkedIn post" },
      { status: 500 }
    );
  }
}
