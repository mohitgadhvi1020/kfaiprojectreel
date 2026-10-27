/**
 * YouTube Data API v3 search wrapper.
 *
 * For each entity extracted from the script (e.g. "Cursor Composer", "Llama
 * 4 Vision") we run a search like `<entity> demo` to surface creator-uploaded
 * walkthroughs. These videos are gold for B-roll: you can screen-record them,
 * link them in the caption, or use thumbnails as still frames.
 *
 * Quota cost: search.list = 100 units per call. Default daily quota is 10k,
 * so roughly 100 searches/day before the key throttles. We make 1 call per
 * entity per topic — usually 2-3 entities, so a full visuals fetch costs
 * ~300 units. Plenty of headroom for normal usage.
 */

export interface YouTubeVideo {
  videoId: string;
  url: string; // canonical watch URL
  embedUrl: string; // for iframe previews
  title: string;
  channelTitle: string;
  publishedAt: string; // ISO string
  thumbnail: string; // medium quality, good for grid cards
  description: string;
}

const FETCH_TIMEOUT_MS = 6000;

export async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults: number = 5
): Promise<YouTubeVideo[]> {
  if (!apiKey) return [];

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(maxResults));
  // "relevance" is the YT default; we want the search engine's pick rather
  // than chronological — popular demos surface first this way.
  url.searchParams.set("order", "relevance");
  // Filter to videos under 20 minutes — long lectures aren't great B-roll.
  // YT's enum is short (<4min) | medium (4-20min) | long (>20min).
  url.searchParams.set("videoDuration", "medium");
  // Embeddable only — saves the user from picking a video they can't iframe.
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("key", apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) {
      const txt = await res.text();
      console.error(
        `[yt-search] failed for "${query}" (${res.status}): ${txt.slice(0, 200)}`
      );
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .map((it: any): YouTubeVideo | null => {
        const videoId = it?.id?.videoId;
        const sn = it?.snippet;
        if (!videoId || !sn) return null;
        const thumb =
          sn.thumbnails?.medium?.url ||
          sn.thumbnails?.high?.url ||
          sn.thumbnails?.default?.url ||
          "";
        return {
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          title: sn.title || "",
          channelTitle: sn.channelTitle || "",
          publishedAt: sn.publishedAt || "",
          thumbnail: thumb,
          description: sn.description || "",
        };
      })
      .filter((v: YouTubeVideo | null): v is YouTubeVideo => v !== null);
  } catch (err: any) {
    console.error(`[yt-search] error for "${query}":`, err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run several queries in parallel. We dedupe by videoId across queries
 * because the same demo often surfaces for related search terms (e.g.
 * "Cursor Composer" and "Cursor demo" both return the same launch video).
 */
export async function searchYouTubeBatch(
  queries: string[],
  apiKey: string,
  perQuery: number = 4
): Promise<YouTubeVideo[]> {
  if (!apiKey || queries.length === 0) return [];
  const all = await Promise.all(
    queries.map((q) => searchYouTube(q, apiKey, perQuery))
  );
  const seen = new Set<string>();
  const out: YouTubeVideo[] = [];
  for (const list of all) {
    for (const v of list) {
      if (seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(v);
    }
  }
  return out;
}
