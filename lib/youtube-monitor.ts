import { parseStringPromise } from "xml2js";
import { fetchTranscript } from "youtube-transcript";
import { getMonitoredContentUrls } from "./db";

interface YouTubeVideo {
  videoId: string;
  title: string;
  url: string;
  published: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
}

const RSS_BASE = "https://www.youtube.com/feeds/videos.xml?channel_id=";
const CHANNEL_PAGE_BASE = "https://www.youtube.com/channel/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Convert YouTube's relative "X days ago" / "X hours ago" text into an
 * approximate ISO publish timestamp. Good enough for ordering + display — the
 * actual dedupe is on URL anyway.
 */
function parseRelativeTime(text: string | undefined): string {
  const now = Date.now();
  if (!text) return new Date(now).toISOString();
  const m = text.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return new Date(now).toISOString();
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const msPer: Record<string, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return new Date(now - n * (msPer[unit] || 0)).toISOString();
}

/**
 * Fallback: scrape the channel's /videos HTML page when the RSS endpoint is
 * unavailable. Parses ytInitialData to find all videoRenderer entries.
 */
async function fetchChannelViaHtml(
  channelId: string,
  channelName: string
): Promise<YouTubeVideo[]> {
  try {
    const res = await fetch(`${CHANNEL_PAGE_BASE}${channelId}/videos`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(
        `HTML scrape failed for ${channelName}: ${res.status}`
      );
      return [];
    }
    const html = await res.text();
    const m = html.match(/var ytInitialData\s*=\s*({[\s\S]*?});\s*<\/script>/);
    if (!m) {
      console.error(`ytInitialData not found for ${channelName}`);
      return [];
    }
    let data: any;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      console.error(`ytInitialData parse failed for ${channelName}`);
      return [];
    }
    const seen = new Set<string>();
    const vids: YouTubeVideo[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (n.videoRenderer) {
        const v = n.videoRenderer;
        const id: string | undefined = v.videoId;
        if (id && !seen.has(id)) {
          seen.add(id);
          const title: string =
            v.title?.runs?.[0]?.text || v.title?.simpleText || "(untitled)";
          const published = parseRelativeTime(
            v.publishedTimeText?.simpleText
          );
          vids.push({
            videoId: id,
            title,
            url: `https://www.youtube.com/watch?v=${id}`,
            published,
            channelId,
            channelName,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          });
        }
      }
      if (Array.isArray(n)) for (const c of n) walk(c);
      else for (const k in n) walk(n[k]);
    };
    walk(data);
    return vids.slice(0, 15);
  } catch (err) {
    console.error(`HTML scrape error for ${channelName}:`, err);
    return [];
  }
}

export async function fetchChannelFeed(
  channelId: string,
  channelName: string
): Promise<YouTubeVideo[]> {
  // 1) Try RSS first (cheap, structured, dated)
  try {
    const response = await fetch(`${RSS_BASE}${channelId}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 0 },
    });

    if (response.ok) {
      const xml = await response.text();
      const parsed = await parseStringPromise(xml, { explicitArray: false });
      const entries = parsed?.feed?.entry;
      if (entries) {
        const items = Array.isArray(entries) ? entries : [entries];
        return items.slice(0, 15).map((entry: any) => ({
          videoId: entry["yt:videoId"],
          title: entry.title,
          url:
            entry.link?.$?.href ||
            `https://www.youtube.com/watch?v=${entry["yt:videoId"]}`,
          published: entry.published,
          channelId,
          channelName,
          thumbnail: `https://i.ytimg.com/vi/${entry["yt:videoId"]}/hqdefault.jpg`,
        }));
      }
    } else {
      console.warn(
        `[yt-monitor] RSS ${response.status} for ${channelName} — falling back to HTML scrape`
      );
    }
  } catch (err) {
    console.warn(
      `[yt-monitor] RSS error for ${channelName} — falling back to HTML scrape:`,
      (err as Error).message
    );
  }

  // 2) Fallback: HTML scrape of /channel/{id}/videos
  return fetchChannelViaHtml(channelId, channelName);
}

export async function extractTranscript(videoId: string): Promise<string> {
  try {
    const segments = await fetchTranscript(videoId);
    if (!segments || segments.length === 0) return "";
    return segments.map((s: any) => s.text).join(" ");
  } catch (err) {
    console.error(`Transcript extraction failed for ${videoId}:`, err);
    return "";
  }
}

export async function pollYouTubeChannels(
  channels: { id: string; name: string }[]
): Promise<YouTubeVideo[]> {
  const existingUrls = await getMonitoredContentUrls();
  const allNew: YouTubeVideo[] = [];

  const feedPromises = channels.map((ch) => fetchChannelFeed(ch.id, ch.name));
  const feeds = await Promise.all(feedPromises);

  for (let i = 0; i < feeds.length; i++) {
    const videos = feeds[i];
    const ch = channels[i];
    let newCount = 0;
    for (const video of videos) {
      if (!existingUrls.has(video.url)) {
        allNew.push(video);
        newCount++;
      }
    }
    console.log(
      `[yt-monitor] ${ch.name} (${ch.id}) — feed=${videos.length} new=${newCount}`
    );
  }

  return allNew;
}
