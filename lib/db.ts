import { localStore } from "./local-store";

/**
 * Abstracted database layer.
 * Uses local JSON file storage by default.
 * If Supabase is configured (env vars set), it can optionally use Supabase.
 * For now, everything goes through local storage - simple, no setup required.
 */

function useSupabase(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

async function getSupabaseClient() {
  const { getSupabase } = await import("./supabase");
  return getSupabase();
}

// ============ RUNS ============

export async function getRuns(limit: number = 20) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  const all = localStore.getAll<any>("runs");
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
}

export async function getRunById(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("runs").select("*").eq("id", id).single();
    return data;
  }
  return localStore.getById("runs", id);
}

export async function createRun() {
  const run = {
    status: "researching",
    created_at: new Date().toISOString(),
    completed_at: null,
    startups_found: 0,
    x_tips_found: 0,
    trending_found: 0,
    selected_startup_id: null,
    selected_x_tip_id: null,
    content_type: null,
  };

  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from("runs").insert(run).select().single();
    if (error) throw error;
    return data;
  }
  return localStore.insert("runs", run);
}

export async function updateRun(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("runs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return localStore.update("runs", id, updates);
}

// ============ STARTUPS ============

export async function getStartups(limit: number = 200) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("startups")
      .select("*")
      .order("discovered_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  const all = localStore.getAll<any>("startups");
  return all.sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()).slice(0, limit);
}

export async function getStartupsByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("startups")
      .select("*")
      .eq("run_id", runId)
      .order("discovered_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("startups", "run_id", runId);
}

export async function getStartupById(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("startups").select("*").eq("id", id).single();
    return data;
  }
  return localStore.getById("startups", id);
}

export async function getAllStartupNames(): Promise<Set<string>> {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("startups").select("name");
    return new Set((data || []).map((s: any) => s.name.toLowerCase()));
  }
  const all = localStore.getAll<any>("startups");
  return new Set(all.map((s: any) => (s.name || "").toLowerCase()));
}

export async function insertStartup(startup: any): Promise<boolean> {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { error } = await sb.from("startups").insert(startup);
    return !error;
  }
  const { inserted } = localStore.insertIfNotExists("startups", startup, "name");
  return inserted;
}

export async function updateStartup(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("startups").update(updates).eq("id", id);
    return;
  }
  localStore.update("startups", id, updates);
}

// ============ X TIPS ============

export async function getAllXTips(limit: number = 200) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("x_tips")
      .select("*")
      .order("discovered_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  const all = localStore.getAll<any>("x_tips");
  return all.sort((a: any, b: any) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()).slice(0, limit);
}

export async function getXTipsByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("x_tips")
      .select("*")
      .eq("run_id", runId)
      .order("discovered_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("x_tips", "run_id", runId);
}

export async function getXTipById(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("x_tips").select("*").eq("id", id).single();
    return data;
  }
  return localStore.getById("x_tips", id);
}

export async function insertXTip(tip: any): Promise<boolean> {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { error } = await sb.from("x_tips").insert(tip);
    return !error;
  }
  localStore.insert("x_tips", tip);
  return true;
}

export async function updateXTip(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("x_tips").update(updates).eq("id", id);
    return;
  }
  localStore.update("x_tips", id, updates);
}

// ============ TRENDING TOPICS ============

export async function getTrendingByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("trending_topics")
      .select("*")
      .eq("run_id", runId)
      .order("discovered_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("trending_topics", "run_id", runId);
}

export async function insertTrending(topic: any): Promise<boolean> {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { error } = await sb.from("trending_topics").insert(topic);
    return !error;
  }
  localStore.insert("trending_topics", topic);
  return true;
}

// ============ RESEARCH DATA ============

export async function getResearchByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("research_data")
      .select("*")
      .eq("run_id", runId)
      .limit(1)
      .single();
    return data || null;
  }
  const all = localStore.getByField<any>("research_data", "run_id", runId);
  return all[0] || null;
}

export async function getResearchByStartupId(startupId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("research_data")
      .select("*")
      .eq("startup_id", startupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return data || null;
  }
  const all = localStore.getByField<any>("research_data", "startup_id", startupId);
  return all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
}

export async function insertResearch(research: any) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { error } = await sb.from("research_data").insert(research);
    if (error) {
      console.error("[insertResearch] FAILED to persist research:", error);
      throw new Error(`Failed to save research to DB: ${error.message}. Research was generated but not stored — this is expensive, fix schema and retry.`);
    }
    console.log(`[insertResearch] ✓ saved research for ${research.startup_id || research.x_tip_id}`);
    return;
  }
  localStore.insert("research_data", research);
}

export async function deleteResearchByStartupId(startupId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("research_data").delete().eq("startup_id", startupId);
    return;
  }
  const all = localStore.getByField<any>("research_data", "startup_id", startupId);
  for (const item of all) {
    localStore.delete("research_data", item.id);
  }
}

export async function deleteResearchByXTipId(xTipId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("research_data").delete().eq("x_tip_id", xTipId);
    return;
  }
  const all = localStore.getByField<any>("research_data", "x_tip_id", xTipId);
  for (const item of all) {
    localStore.delete("research_data", item.id);
  }
}

// ============ GENERATED CONTENT ============

export async function getContentByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("generated_content")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("generated_content", "run_id", runId);
}

export async function insertContent(items: any[]) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("generated_content").insert(items).select();
    return data;
  }
  const results = items.map((item) => localStore.insert("generated_content", item));
  return results;
}

export async function getContentByStartupId(startupId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("generated_content")
      .select("*")
      .eq("startup_id", startupId)
      .order("created_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("generated_content", "startup_id", startupId);
}

export async function getContentById(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("generated_content").select("*").eq("id", id).single();
    return data || null;
  }
  return localStore.getById("generated_content", id);
}

export async function getContentByXTipId(xTipId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("generated_content")
      .select("*")
      .eq("x_tip_id", xTipId)
      .order("created_at", { ascending: false });
    return data || [];
  }
  return localStore.getByField("generated_content", "x_tip_id", xTipId);
}

export async function getAllContent(limit: number = 500) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("generated_content")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  const all = localStore.getAll<any>("generated_content");
  return all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
}

export async function updateContent(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("generated_content")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return localStore.update("generated_content", id, updates);
}

export async function deleteContentByStartupId(startupId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("generated_content").delete().eq("startup_id", startupId);
    return;
  }
  const all = localStore.getByField<any>("generated_content", "startup_id", startupId);
  for (const item of all) {
    localStore.delete("generated_content", item.id);
  }
}

export async function deleteContentByXTipId(xTipId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("generated_content").delete().eq("x_tip_id", xTipId);
    return;
  }
  const all = localStore.getByField<any>("generated_content", "x_tip_id", xTipId);
  for (const item of all) {
    localStore.delete("generated_content", item.id);
  }
}

export async function deleteContentByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("generated_content").delete().eq("run_id", runId);
    return;
  }
  const all = localStore.getByField<any>("generated_content", "run_id", runId);
  for (const item of all) {
    localStore.delete("generated_content", item.id);
  }
}

export async function deleteResearchByRunId(runId: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("research_data").delete().eq("run_id", runId);
    return;
  }
  const all = localStore.getByField<any>("research_data", "run_id", runId);
  for (const item of all) {
    localStore.delete("research_data", item.id);
  }
}

// ============ CONTENT PREFERENCES ============

export async function getContentPreferences() {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("content_preferences")
      .select("*")
      .order("created_at", { ascending: false });
    return data || [];
  }
  const all = localStore.getAll<any>("content_preferences");
  return all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function insertContentPreference(pref: { note: string; category: string }) {
  const item = { ...pref, created_at: new Date().toISOString() };
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from("content_preferences").insert(item).select().single();
    if (error) throw error;
    return data;
  }
  return localStore.insert("content_preferences", item);
}

export async function deleteContentPreference(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("content_preferences").delete().eq("id", id);
    return;
  }
  localStore.delete("content_preferences", id);
}

export async function getPreferencesText(): Promise<string> {
  const prefs = await getContentPreferences();
  if (prefs.length === 0) return "";
  const lines = prefs.map((p: any) => {
    const label = p.category === "like" ? "LIKES" : p.category === "dislike" ? "DISLIKES" : p.category === "style" ? "STYLE" : "INSTRUCTION";
    return `[${label}] ${p.note}`;
  });
  return `\n\nCREATOR PREFERENCES (respect these in all output):\n${lines.join("\n")}`;
}

// ============ MONITORED CHANNELS ============

export async function getMonitoredChannels() {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("monitored_channels")
      .select("*")
      .eq("is_active", true)
      .order("added_at", { ascending: false });
    return data || [];
  }
  const all = localStore.getAll<any>("monitored_channels");
  return all.filter((c: any) => c.is_active !== false)
    .sort((a: any, b: any) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
}

export async function getAllMonitoredChannels() {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("monitored_channels")
      .select("*")
      .order("added_at", { ascending: false });
    return data || [];
  }
  const all = localStore.getAll<any>("monitored_channels");
  return all.sort((a: any, b: any) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
}

export async function insertMonitoredChannel(channel: any) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from("monitored_channels").insert(channel).select().single();
    if (error) throw error;
    return data;
  }
  return localStore.insert("monitored_channels", channel);
}

export async function updateMonitoredChannel(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("monitored_channels")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return localStore.update("monitored_channels", id, updates);
}

export async function deleteMonitoredChannel(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("monitored_channels").delete().eq("id", id);
    return;
  }
  localStore.delete("monitored_channels", id);
}

// ============ MONITORED CONTENT ============

export async function getMonitoredContent(limit: number = 100) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("monitored_content")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  const all = localStore.getAll<any>("monitored_content");
  return all
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function getMonitoredContentById(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("monitored_content").select("*").eq("id", id).single();
    return data;
  }
  return localStore.getById("monitored_content", id);
}

export async function getMonitoredContentBySource(source: string, limit: number = 50) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("monitored_content")
      .select("*")
      .eq("source", source)
      .order("published_at", { ascending: false })
      .limit(limit);
    return data || [];
  }
  return localStore.getByField<any>("monitored_content", "source", source)
    .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, limit);
}

export async function getMonitoredContentUrls(): Promise<Set<string>> {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb.from("monitored_content").select("url");
    return new Set((data || []).map((i: any) => i.url));
  }
  const all = localStore.getAll<any>("monitored_content");
  return new Set(all.map((i: any) => i.url));
}

export async function insertMonitoredContent(item: any) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from("monitored_content").insert(item).select().single();
    if (error) throw error;
    return data;
  }
  return localStore.insert("monitored_content", item);
}

export async function updateMonitoredContent(id: string, updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("monitored_content")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return localStore.update("monitored_content", id, updates);
}

export async function deleteMonitoredContent(id: string) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    await sb.from("monitored_content").delete().eq("id", id);
    return;
  }
  localStore.delete("monitored_content", id);
}

// ============ SETTINGS ============

export async function getSettings() {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("app_settings")
      .select("*")
      .limit(1)
      .single();
    return data || {};
  }
  return localStore.getSettings();
}

export async function updateSettings(updates: Record<string, any>) {
  if (useSupabase()) {
    const sb = await getSupabaseClient();
    const { data: current } = await sb
      .from("app_settings")
      .select("id")
      .limit(1)
      .single();
    if (!current) throw new Error("No settings row. Run schema SQL first.");
    const { data, error } = await sb
      .from("app_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return localStore.saveSettings({ ...updates, updated_at: new Date().toISOString() });
}
