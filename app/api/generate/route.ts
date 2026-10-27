import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { runDeepResearch, runXTipResearch } from "@/lib/research";
import {
  generateHooks,
  generateStartupContent,
  generateXTipContent,
  generateAndVerifyLinkedInPost,
  refineContent,
} from "@/lib/content-generator";
import { getActiveSettings } from "@/lib/settings";

async function getPrefs(): Promise<string> {
  return db.getPreferencesText();
}

export async function POST(request: NextRequest) {
  try {
    const { run_id, startup_id, x_tip_id, type, regenerate_hook, stage, selected_hook } = await request.json();
    // Unify: stage=script uses `selected_hook`, legacy flow uses `regenerate_hook`.
    const pickedHook = regenerate_hook || selected_hook;

    if (!startup_id && !x_tip_id) {
      return NextResponse.json(
        { error: "Either startup_id or x_tip_id required" },
        { status: 400 }
      );
    }

    const settings = await getActiveSettings();

    if (!settings.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key required for content generation. Go to Settings." },
        { status: 400 }
      );
    }

    // stage=script → user picked a hook from the 10-hook list; build the full script.
    // stage=hooks (default) → research + 10 hooks only, UI shows picker, NO script yet.
    if (pickedHook || stage === "script") {
      if (!pickedHook) {
        return NextResponse.json(
          { error: "stage=script requires selected_hook in body." },
          { status: 400 }
        );
      }
      return handleHookRegeneration(run_id, startup_id, x_tip_id, type, pickedHook, settings);
    }

    if (!settings.perplexity_api_key) {
      return NextResponse.json(
        { error: "Perplexity API key required for research. Go to Settings." },
        { status: 400 }
      );
    }

    if (type === "startup" && startup_id) {
      await db.deleteContentByStartupId(startup_id);
      await db.deleteResearchByStartupId(startup_id);
      // Clear stale hook cache so the UI doesn't show old hooks during regen.
      try { await db.updateStartup(startup_id, { hooks_cache: null }); } catch {}
      return handleStartupGeneration(run_id, startup_id, settings);
    }

    if (type === "x_tip" && x_tip_id) {
      await db.deleteContentByXTipId(x_tip_id);
      await db.deleteResearchByXTipId(x_tip_id);
      return handleXTipGeneration(run_id, x_tip_id, settings);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate content" },
      { status: 500 }
    );
  }
}

async function handleHookRegeneration(
  runId: string,
  startupId: string | undefined,
  xTipId: string | undefined,
  type: string,
  selectedHook: any,
  settings: any
) {
  const research = startupId
    ? await db.getResearchByStartupId(startupId)
    : xTipId
      ? (await db.getResearchByRunId(runId))
      : null;

  if (!research) {
    // Fallback: no research row (orphaned content from an earlier run).
    // Trigger a full fresh generation — that will re-research + regenerate.
    if (startupId) {
      console.warn(`[regen-hook] no research for ${startupId}; running full generation instead`);
      await db.deleteContentByStartupId(startupId);
      return handleStartupGeneration(runId, startupId, settings);
    }
    if (xTipId) {
      console.warn(`[regen-hook] no research for x_tip ${xTipId}; running full generation instead`);
      await db.deleteContentByXTipId(xTipId);
      return handleXTipGeneration(runId, xTipId, settings);
    }
    return NextResponse.json(
      { error: "No existing research found. Generate content first." },
      { status: 400 }
    );
  }

  // Pull the 10 hooks first from startups.hooks_cache (new flow), then from any
  // existing generated_content row (legacy / post-first-script regenerate).
  let allHooks: any[] = [];
  if (startupId) {
    const sRow = await db.getStartupById(startupId);
    const cache = sRow?.hooks_cache;
    if (cache) {
      allHooks = typeof cache === "string" ? JSON.parse(cache) : cache;
    }
  }
  if (allHooks.length === 0) {
    const existingContent = startupId
      ? await db.getContentByStartupId(startupId)
      : xTipId
        ? await db.getContentByXTipId(xTipId)
        : [];
    allHooks = existingContent.length > 0
      ? (typeof existingContent[0].hooks === "string" ? JSON.parse(existingContent[0].hooks) : existingContent[0].hooks) || []
      : [];
  }

  if (startupId) {
    await db.deleteContentByStartupId(startupId);
    await db.updateStartup(startupId, { content_status: "scripting" });
  } else if (xTipId) {
    await db.deleteContentByXTipId(xTipId);
  }

  try {
    const prefs = await getPrefs();
    let scripts: { reelScript: string; carouselText: string; caption: string };

    if (type === "x_tip" && xTipId) {
      const tip = await db.getXTipById(xTipId);
      if (!tip) {
        if (startupId) await db.updateStartup(startupId, { content_status: "failed" });
        return NextResponse.json({ error: "X Tip not found" }, { status: 404 });
      }
      const author = (tip.author || "").replace(/^@+/, "");
      scripts = await generateXTipContent(
        {
          author,
          summary: tip.post_summary,
          takeaway: tip.practical_takeaway,
          post: tip.post_snippet || tip.post_summary,
          selectedHook,
          deepResearch: research.technical_research || "",
          warning: research.research_warning || "",
        },
        settings.openai_api_key,
        prefs
      );
    } else {
      const startup = startupId ? await db.getStartupById(startupId) : null;
      if (!startup) {
        if (startupId) await db.updateStartup(startupId, { content_status: "failed" });
        return NextResponse.json({ error: "Startup not found" }, { status: 404 });
      }
      scripts = await generateStartupContent(
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
        },
        settings.openai_api_key,
        prefs
      );
    }

    if (startupId) await db.updateStartup(startupId, { content_status: "refining" });

    let refineName = "";
    let refineFunding: string | undefined;
    let refineRound: string | undefined;
    let refineWebsite: string | undefined;
    if (type === "x_tip" && xTipId) {
      const tipData = await db.getXTipById(xTipId);
      refineName = `@${(tipData?.author || "").replace(/^@+/, "")} tip`;
    } else if (startupId) {
      const startupData = await db.getStartupById(startupId);
      refineName = startupData?.name || "";
      refineFunding = startupData?.funding_amount;
      refineRound = startupData?.funding_round;
      refineWebsite = startupData?.website;
    }

    const refined = await refineContent(
      {
        name: refineName,
        funding: refineFunding,
        round: refineRound,
        reelScript: scripts.reelScript,
        carouselText: scripts.carouselText,
        caption: scripts.caption,
        warning: research.research_warning || "",
        foundersResearch: research.founders_research,
        technicalResearch: research.technical_research,
        selectedHook, // so refinement can't drop the user-picked hook
      },
      settings.openai_api_key,
      prefs
    );

    // Safety net: if the refined reel somehow doesn't include the user-picked hook
    // in the first ~160 characters, prepend it verbatim. This is the last line of defense
    // against prompt drift dropping the hook the user explicitly chose.
    const hookText = (selectedHook?.hook || "").trim();
    const leading = (refined.refinedReel || "").replace(/\s+/g, " ").slice(0, 160).toLowerCase();
    const hookPresent = hookText && leading.includes(hookText.slice(0, 40).toLowerCase());
    let finalReel = refined.refinedReel;
    if (hookText && !hookPresent) {
      console.warn(`[hook-guard] refined reel did not open with user hook — prepending.`);
      finalReel = `${hookText}\n\n${refined.refinedReel}`;
    }

    const contentInserts = [
      {
        run_id: runId, startup_id: startupId || null, x_tip_id: xTipId || null,
        content_type: "reel_script", content: finalReel, is_refined: true,
        hooks: allHooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: refined.reviewerNotes,
        created_at: new Date().toISOString(),
      },
      {
        run_id: runId, startup_id: startupId || null, x_tip_id: xTipId || null,
        content_type: "carousel_text", content: refined.refinedCarousel, is_refined: true,
        hooks: allHooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: "",
        created_at: new Date().toISOString(),
      },
      {
        run_id: runId, startup_id: startupId || null, x_tip_id: xTipId || null,
        content_type: "caption_hashtags", content: refined.refinedCaption, is_refined: true,
        hooks: allHooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: "",
        created_at: new Date().toISOString(),
      },
    ];

    const savedContent = await db.insertContent(contentInserts);
    if (startupId) await db.updateStartup(startupId, { content_status: "completed", is_used: true });

    // Auto-draft a LinkedIn post (Sorai Tech) from the same research, anchored on
    // the user-picked hook. Best-effort — a LinkedIn failure must NOT fail the IG
    // flow the user actually waited for. Startups only (x_tips stay IG-only).
    if (startupId) {
      try {
        const { post: liPost, verification: liVerify, tagTargets: liTags } = await generateAndVerifyLinkedInPost(
          {
            name: refineName,
            funding: refineFunding || "",
            round: refineRound || "",
            selectedHook,
            technicalResearch: research.technical_research || "",
            productResearch: research.product_research || "",
            marketResearch: research.market_research || "",
            foundersResearch: research.founders_research || "",
            businessResearch: research.business_research || "",
            contrarianResearch: research.contrarian_research || "",
            viralAngles: research.viral_angles || "",
            warning: research.research_warning || "",
            website: refineWebsite,
          },
          settings.openai_api_key,
          prefs
        );
        // Content for this startup was wiped at the top of this handler, so there's
        // no stale linkedin_post row — a plain insert is correct.
        await db.insertContent([
          {
            run_id: runId, startup_id: startupId, x_tip_id: null,
            content_type: "linkedin_post", content: liPost, is_refined: true,
            hooks: null, selected_hook: selectedHook,
            quality_score: null, reviewer_notes: liVerify.notes,
            tag_targets: liTags,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (liErr) {
        console.warn("[linkedin] auto-draft on script-gen failed (non-fatal):", liErr);
      }
    }

    return NextResponse.json({
      success: true, content: savedContent, hooks: allHooks, selectedHook,
      qualityScore: refined.qualityScore, reviewerNotes: refined.reviewerNotes,
    });
  } catch (error: any) {
    console.error("Hook regeneration failed:", error);
    // Revert to hooks_ready so the user can retry with a different hook without
    // paying for another research pass (research row is still in DB).
    if (startupId) {
      const sRow = await db.getStartupById(startupId);
      const revertTo = sRow?.hooks_cache ? "hooks_ready" : "failed";
      await db.updateStartup(startupId, { content_status: revertTo });
    }
    return NextResponse.json(
      { error: error.message || "Failed to regenerate with selected hook. Try again." },
      { status: 500 }
    );
  }
}

async function handleStartupGeneration(
  runId: string,
  startupId: string,
  settings: any
) {
  const startup = await db.getStartupById(startupId);
  if (!startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  await db.updateStartup(startupId, { content_status: "generating" });
  await db.updateRun(runId, {
    selected_startup_id: startupId,
    selected_x_tip_id: null,
    content_type: "startup",
  });

  try {
    const research = await runDeepResearch(
      {
        name: startup.name,
        funding_amount: startup.funding_amount,
        funding_round: startup.funding_round,
        description: startup.description,
      },
      settings.perplexity_api_key
    );

    // IMMEDIATELY dump raw research to disk — belt-and-suspenders backup before
    // touching DB, so an expensive Perplexity call is never lost to a schema bug.
    try {
      const fs = await import("fs");
      const path = await import("path");
      const dumpDir = path.join(process.cwd(), ".research-backups");
      if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
      const dumpPath = path.join(dumpDir, `${startupId}_${Date.now()}.json`);
      fs.writeFileSync(dumpPath, JSON.stringify({ startupId, runId, startup: startup.name, research }, null, 2));
      console.log(`[research-backup] saved ${dumpPath}`);
    } catch (e) {
      console.warn("[research-backup] filesystem dump failed:", e);
    }

    const researchRow = {
      run_id: runId,
      startup_id: startupId,
      technical_research: research.technical.content,
      technical_sources: research.technical.citations,
      product_research: research.product.content,
      product_sources: research.product.citations,
      market_research: research.market.content,
      market_sources: research.market.citations,
      founders_research: research.founders.content,
      founders_sources: research.founders.citations,
      business_research: research.business.content,
      business_sources: research.business.citations,
      contrarian_research: research.contrarian.content,
      contrarian_sources: research.contrarian.citations,
      viral_angles: research.viral.content,
      research_quality_score: research.qualityScore,
      research_passed: research.passed,
      research_warning: research.warning,
      created_at: new Date().toISOString(),
    };

    try {
      await db.insertResearch(researchRow);
    } catch (dbErr: any) {
      // Full insert failed (usually column mismatch). Retry with a minimal payload
      // so we at least persist the core research text. Missing fields can be recovered
      // from the filesystem dump above.
      console.warn("[research] full insert failed; retrying with minimal payload:", dbErr?.message);
      try {
        await db.insertResearch({
          run_id: runId,
          startup_id: startupId,
          technical_research: JSON.stringify({
            technical: research.technical?.content,
            product: research.product?.content,
            market: research.market?.content,
            founders: research.founders?.content,
            business: research.business?.content,
            contrarian: research.contrarian?.content,
            viral: research.viral?.content,
          }),
          research_passed: research.passed,
          created_at: new Date().toISOString(),
        });
        console.log("[research] minimal payload saved as fallback");
      } catch (fallbackErr: any) {
        console.error("[research] BOTH insert attempts failed. Research is on disk only.", fallbackErr);
        // Don't block generation — we still have research in memory.
      }
    }

    if (!research.passed) {
      await db.updateStartup(startupId, { content_status: "failed" });
      return NextResponse.json(
        {
          error: `Research quality check failed. Only ${research.qualityScore}/5 streams mention "${startup.name}". Try a different startup.`,
        },
        { status: 422 }
      );
    }

    await db.updateStartup(startupId, { content_status: "hooks" });

    const prefs = await getPrefs();

    const hooks = await generateHooks(
      "startup",
      {
        name: startup.name,
        funding: startup.funding_amount,
        round: startup.funding_round,
        technicalResearch: research.technical.content,
        productResearch: research.product.content,
        marketResearch: research.market.content,
        foundersResearch: research.founders.content,
        businessResearch: research.business.content,
        contrarianResearch: research.contrarian.content,
        viralAngles: research.viral.content,
        warning: research.warning,
      },
      settings.openai_api_key,
      prefs
    );

    // Stage 1 ends here: cache the 10 hooks on the startup row. The generated_content
    // table has CHECK + NOT NULL constraints that don't fit a "hooks-only" placeholder,
    // so we stash hooks on startups.hooks_cache (see supabase-migration-hooks-cache.sql).
    // Stage 2 (user picks a hook) will read hooks_cache, generate the script, and write
    // the real reel_script/carousel_text/caption_hashtags rows.
    try {
      await db.updateStartup(startupId, {
        hooks_cache: hooks,
        content_status: "hooks_ready",
      });
    } catch (e) {
      // If hooks_cache column doesn't exist yet (migration not run), fall back to
      // status-only update so the UI still gets the hooks via the API response.
      console.warn("[hooks-cache] update failed (run migration?):", e);
      await db.updateStartup(startupId, { content_status: "hooks_ready" });
    }

    // Reuse the existing "hooks" status — runs.status has a CHECK constraint that
    // only allows researching/ready/generating/hooks/scripting/refining/completed/failed,
    // and we don't want to fail the whole turn over a run-status label.
    try {
      await db.updateRun(runId, { status: "hooks" });
    } catch (e) {
      console.warn("[stage-hooks] updateRun failed (non-fatal):", e);
    }

    return NextResponse.json({
      success: true,
      stage: "hooks",
      hooks,
      message: "10 hooks ready — pick one to generate the script.",
    });
  } catch (error: any) {
    console.error("Startup generation failed:", error);
    await db.updateStartup(startupId, { content_status: "failed" });
    return NextResponse.json(
      { error: error.message || "Content generation failed. Try again." },
      { status: 500 }
    );
  }
}

async function handleXTipGeneration(
  runId: string,
  xTipId: string,
  settings: any
) {
  const tip = await db.getXTipById(xTipId);
  if (!tip) {
    return NextResponse.json({ error: "X Tip not found" }, { status: 404 });
  }

  const author = (tip.author || "").replace(/^@+/, "");

  await db.updateRun(runId, {
    selected_x_tip_id: xTipId,
    selected_startup_id: null,
    content_type: "x_tip",
  });

  try {
    const research = await runXTipResearch(
      {
        author,
        post_summary: tip.post_summary,
        practical_takeaway: tip.practical_takeaway,
        post_snippet: tip.post_snippet,
      },
      settings.perplexity_api_key
    );

    await db.insertResearch({
      run_id: runId, x_tip_id: xTipId,
      technical_research: research.deepResearch.content,
      technical_sources: research.deepResearch.citations,
      research_quality_score: research.passed ? 3 : 1,
      research_passed: research.passed,
      research_warning: research.warning,
      created_at: new Date().toISOString(),
    });

    if (!research.passed) {
      return NextResponse.json(
        { error: "Research too thin for this X tip. Try another." },
        { status: 422 }
      );
    }

    const prefs = await getPrefs();

    const hooks = await generateHooks(
      "x_tip",
      {
        name: `@${author}`,
        author,
        summary: tip.post_summary,
        takeaway: tip.practical_takeaway,
        deepResearch: research.deepResearch.content,
        warning: research.warning,
      },
      settings.openai_api_key,
      prefs
    );

    const selectedHook =
      hooks[Math.floor(Math.random() * hooks.length)] || hooks[0];

    const scripts = await generateXTipContent(
      {
        author,
        summary: tip.post_summary,
        takeaway: tip.practical_takeaway,
        post: tip.post_snippet || tip.post_summary,
        selectedHook,
        deepResearch: research.deepResearch.content,
        warning: research.warning,
      },
      settings.openai_api_key,
      prefs
    );

    const refined = await refineContent(
      {
        name: `@${author} tip`,
        reelScript: scripts.reelScript,
        carouselText: scripts.carouselText,
        caption: scripts.caption,
        warning: research.warning,
      },
      settings.openai_api_key,
      prefs
    );

    const contentInserts = [
      {
        run_id: runId, x_tip_id: xTipId, content_type: "reel_script",
        content: refined.refinedReel, is_refined: true,
        hooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: refined.reviewerNotes,
        created_at: new Date().toISOString(),
      },
      {
        run_id: runId, x_tip_id: xTipId, content_type: "carousel_text",
        content: refined.refinedCarousel, is_refined: true,
        hooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: "",
        created_at: new Date().toISOString(),
      },
      {
        run_id: runId, x_tip_id: xTipId, content_type: "caption_hashtags",
        content: refined.refinedCaption, is_refined: true,
        hooks, selected_hook: selectedHook,
        quality_score: refined.qualityScore, reviewer_notes: "",
        created_at: new Date().toISOString(),
      },
    ];

    const savedContent = await db.insertContent(contentInserts);

    await db.updateXTip(xTipId, { is_used: true });
    await db.updateRun(runId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true, content: savedContent, hooks, selectedHook,
      qualityScore: refined.qualityScore, reviewerNotes: refined.reviewerNotes,
    });
  } catch (error: any) {
    console.error("X tip generation failed:", error);
    return NextResponse.json(
      { error: error.message || "X tip content generation failed. Try again." },
      { status: 500 }
    );
  }
}
