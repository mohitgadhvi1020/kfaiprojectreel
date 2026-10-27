// One-shot: delete placeholder monitored_content rows left behind by the old
// getFallbackPosts() behaviour. Matches on the marker strings the fallback
// used to write into title/description/url.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("/Users/mohit/Downloads/kf-project-2/.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Pull anything that looks like a placeholder. Be generous — we want them gone.
const { data, error } = await sb
  .from("monitored_content")
  .select("id, title, url, source")
  .eq("source", "instagram");

if (error) {
  console.error("fetch failed:", error);
  process.exit(1);
}

const isPlaceholder = (r) => {
  const blob = `${r.title || ""} ${r.url || ""}`.toLowerCase();
  return (
    blob.includes("apify key not configured") ||
    blob.includes("[apify key") ||
    blob.includes("placeholder") ||
    r.url?.startsWith("https://www.instagram.com/_placeholder")
  );
};

const targets = data.filter(isPlaceholder);
console.log(`scanning ${data.length} instagram rows → ${targets.length} placeholders to delete`);

if (targets.length === 0) {
  console.log("nothing to clean. DB is healthy.");
  process.exit(0);
}

for (const row of targets) {
  console.log(`  - ${row.id}  ${(row.title || "").slice(0, 60)}`);
}

const ids = targets.map((r) => r.id);
const { error: delErr } = await sb.from("monitored_content").delete().in("id", ids);
if (delErr) {
  console.error("delete failed:", delErr);
  process.exit(1);
}
console.log(`✓ deleted ${ids.length} placeholder rows`);
