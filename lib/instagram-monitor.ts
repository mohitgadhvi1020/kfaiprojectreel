import { getMonitoredContentUrls } from "./db";

interface InstagramPost {
  postId: string;
  url: string;
  caption: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  likesCount: number;
  commentsCount: number;
  published: string;
  ownerUsername: string;
  type: string;
}

const APIFY_ACTOR_ID = "apify~instagram-post-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

export async function fetchInstagramPosts(
  username: string,
  apifyKey: string,
  maxPosts: number = 10
): Promise<InstagramPost[]> {
  try {
    // apify~instagram-post-scraper expects `username: string[]`. Strip
    // any leading @ since the actor wants the bare handle.
    const cleanUsername = username.replace(/^@/, "");
    const runResponse = await fetch(
      `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: [cleanUsername],
          resultsLimit: maxPosts,
        }),
      }
    );

    if (!runResponse.ok) {
      const err = await runResponse.text();
      console.error(`[ig-monitor] Apify run failed for @${username}: ${err.slice(0, 200)}`);
      // Return empty — do NOT insert a placeholder row. The account just
      // gets retried next poll cycle. A real failure (rate limit, private
      // account, Apify outage) shouldn't pollute the DB with fake posts.
      return [];
    }

    const runData = await runResponse.json();
    const datasetId = runData?.data?.defaultDatasetId;

    if (!datasetId) {
      console.error(`[ig-monitor] No dataset returned for @${username}`);
      return [];
    }

    await new Promise((r) => setTimeout(r, 15000));

    const dataResponse = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyKey}&limit=${maxPosts}`
    );

    if (!dataResponse.ok) {
      console.error(
        `[ig-monitor] Apify dataset fetch failed for @${username}: ${dataResponse.status}`
      );
      return [];
    }

    const items = await dataResponse.json();

    return (items || []).map((item: any) => ({
      postId: item.id || item.shortCode || "",
      url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      caption: item.caption || "",
      mediaUrl: item.videoUrl || item.videoUrlDownload || null,
      thumbnailUrl: item.displayUrl || null,
      likesCount: item.likesCount || 0,
      commentsCount: item.commentsCount || 0,
      published: item.timestamp || new Date().toISOString(),
      ownerUsername: item.ownerUsername || username,
      type: item.type || "Image",
    }));
  } catch (err) {
    console.error(`[ig-monitor] Error fetching Instagram for @${username}:`, err);
    // Same rationale: a transient fetch error should not become a database
    // row. Skip this account this cycle, retry next time.
    return [];
  }
}

// Use `apify/instagram-scraper` for single-URL fetches — unlike the
// post-scraper actor used for channel polling, this one properly resolves
// `directUrls` without requiring a username, so it fetches the exact post
// rather than a random recent post from the account.
const APIFY_URL_ACTOR_ID = "apify~instagram-scraper";

export async function fetchInstagramPostByUrl(
  postUrl: string,
  apifyKey: string
): Promise<InstagramPost | null> {
  if (!postUrl || !apifyKey) return null;

  try {
    // Clean the URL — strip tracking params that can confuse the scraper
    let cleanUrl = postUrl.trim();
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.hostname.includes("instagram.com")) {
        cleanUrl = `https://www.instagram.com${parsed.pathname}`;
      }
    } catch {
      // URL parsing failed — use as-is
    }

    console.log(`[ig-monitor] Starting Apify URL scrape for: ${cleanUrl}`);

    const runResponse = await fetch(
      `${APIFY_BASE}/acts/${APIFY_URL_ACTOR_ID}/runs?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [cleanUrl],
          resultsType: "posts",
          resultsLimit: 1,
        }),
      }
    );

    if (!runResponse.ok) {
      const err = await runResponse.text();
      console.error(`[ig-monitor] Apify URL actor failed: ${err.slice(0, 300)}`);

      // Fallback: try the post-scraper actor with directUrls + username
      console.log(`[ig-monitor] Falling back to post-scraper actor...`);
      return fetchInstagramPostByUrlFallback(cleanUrl, postUrl, apifyKey);
    }

    const runData = await runResponse.json();
    const runId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    if (!datasetId || !runId) {
      console.error(`[ig-monitor] No dataset/run ID returned`);
      return null;
    }

    // Poll for run completion — Apify runs can take 20-90s.
    const result = await pollApifyRun(runId, datasetId, apifyKey, cleanUrl);
    return result
      ? normalizeInstagramItem(result, postUrl)
      : null;
  } catch (err) {
    console.error(`[ig-monitor] Error fetching Instagram URL ${postUrl}:`, err);
    return null;
  }
}

/** Fallback: use the post-scraper actor (requires username). */
async function fetchInstagramPostByUrlFallback(
  cleanUrl: string,
  originalUrl: string,
  apifyKey: string
): Promise<InstagramPost | null> {
  try {
    // Extract the shortcode from the URL to verify later
    const shortcodeMatch = cleanUrl.match(/\/(p|reel|tv)\/([^/?]+)/);
    const targetShortcode = shortcodeMatch?.[2] || null;

    // Extract username from URL if possible
    let usernameHint = "instagram";
    try {
      const pathParts = new URL(cleanUrl).pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2 && !["reel", "p", "tv"].includes(pathParts[0])) {
        usernameHint = pathParts[0];
      }
    } catch {}

    console.log(`[ig-monitor] Fallback: using post-scraper for @${usernameHint}, shortcode=${targetShortcode}`);

    const runResponse = await fetch(
      `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${apifyKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: [usernameHint],
          resultsLimit: 30, // fetch more so we can find the target post
        }),
      }
    );

    if (!runResponse.ok) return null;

    const runData = await runResponse.json();
    const runId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    if (!datasetId || !runId) return null;

    // Poll for completion
    const MAX_POLL_TIME_MS = 120_000;
    const POLL_INTERVAL_MS = 5_000;
    const start = Date.now();

    while (Date.now() - start < MAX_POLL_TIME_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyKey}`);
      if (!statusRes.ok) continue;
      const statusData = await statusRes.json();
      const runStatus = statusData?.data?.status;
      console.log(`[ig-monitor] Fallback run ${runId}: ${runStatus} (${Math.round((Date.now() - start) / 1000)}s)`);
      if (runStatus === "SUCCEEDED") break;
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(runStatus)) return null;
    }

    // Fetch all results and find the matching post by shortcode
    const dataResponse = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyKey}&limit=50`
    );
    if (!dataResponse.ok) return null;

    const allItems = await dataResponse.json();
    if (!Array.isArray(allItems) || allItems.length === 0) return null;

    // Find the exact post by shortcode match
    let item = allItems[0]; // default to first
    if (targetShortcode) {
      const match = allItems.find(
        (i: any) =>
          i.shortCode === targetShortcode ||
          (i.url && i.url.includes(targetShortcode))
      );
      if (match) {
        item = match;
        console.log(`[ig-monitor] Fallback: found exact shortcode match`);
      } else {
        console.warn(`[ig-monitor] Fallback: shortcode ${targetShortcode} not found in ${allItems.length} results`);
        return null;
      }
    }

    return normalizeInstagramItem(item, originalUrl);
  } catch (err) {
    console.error(`[ig-monitor] Fallback fetch failed:`, err);
    return null;
  }
}

/** Poll an Apify run until SUCCEEDED or failure. Returns the first dataset item. */
async function pollApifyRun(
  runId: string,
  datasetId: string,
  apifyKey: string,
  cleanUrl: string
): Promise<any | null> {
  const MAX_POLL_TIME_MS = 120_000;
  const POLL_INTERVAL_MS = 5_000;
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyKey}`);
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const runStatus = statusData?.data?.status;
    console.log(`[ig-monitor] Apify run ${runId}: ${runStatus} (${Math.round((Date.now() - start) / 1000)}s)`);

    if (runStatus === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(runStatus)) {
      console.error(`[ig-monitor] Apify run ended: ${runStatus}`);
      return null;
    }
  }

  const dataResponse = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyKey}&limit=5`
  );
  if (!dataResponse.ok) {
    console.error(`[ig-monitor] Dataset fetch failed: ${dataResponse.status}`);
    return null;
  }

  const items = await dataResponse.json();
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) {
    console.warn(`[ig-monitor] Apify returned 0 items for ${cleanUrl}`);
    return null;
  }

  console.log(`[ig-monitor] Fetched post by @${item.ownerUsername || item.owner?.username || "unknown"} — shortCode=${item.shortCode || "?"}`);
  return item;
}

/** Normalize an Apify result item into our InstagramPost shape. */
function normalizeInstagramItem(item: any, fallbackUrl: string): InstagramPost {
  return {
    postId: item.id || item.shortCode || "",
    url: item.url || fallbackUrl,
    caption: item.caption || "",
    mediaUrl: item.videoUrl || item.videoUrlDownload || null,
    thumbnailUrl: item.displayUrl || null,
    likesCount: item.likesCount || 0,
    commentsCount: item.commentsCount || 0,
    published: item.timestamp || new Date().toISOString(),
    ownerUsername: item.ownerUsername || item.owner?.username || "",
    type: item.type || "Image",
  };
}

export async function pollInstagramAccounts(
  accounts: string[],
  apifyKey: string,
  maxPostsPerAccount: number = 10
): Promise<InstagramPost[]> {
  const existingUrls = await getMonitoredContentUrls();
  const allNew: InstagramPost[] = [];

  if (!apifyKey) {
    console.warn(`[ig-monitor] no Apify key set — skipping ${accounts.length} accounts`);
    return [];
  }

  for (const username of accounts) {
    const posts = await fetchInstagramPosts(username, apifyKey, maxPostsPerAccount);
    let newCount = 0;
    for (const post of posts) {
      if (!existingUrls.has(post.url)) {
        allNew.push(post);
        newCount++;
      }
    }
    console.log(
      `[ig-monitor] @${username} — fetched=${posts.length} new=${newCount}`
    );
  }

  return allNew;
}
