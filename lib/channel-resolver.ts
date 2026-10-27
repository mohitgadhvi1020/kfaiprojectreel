/**
 * Resolve a pasted YouTube / Instagram URL (or handle) into the canonical IDs
 * the monitor needs: channel_id, channel_name, channel_url.
 *
 * YouTube accepts any of:
 *   - https://www.youtube.com/@handle
 *   - https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx
 *   - https://www.youtube.com/c/CustomName
 *   - @handle
 *   - UCxxxxxxxxxxxxxxxxxxxxxx   (raw channel id)
 *
 * Instagram accepts:
 *   - https://instagram.com/username
 *   - https://www.instagram.com/username/
 *   - @username
 *   - username
 *
 * For YouTube, we fetch the channel page and scrape `"browseId":"UC…"` +
 * `<meta property="og:title" content="…">` so we can display a nice name.
 * No YouTube API key required.
 */

export type ResolvedChannel = {
  platform: "youtube" | "instagram";
  channel_id: string;      // UC… for YT, username for IG
  channel_name: string;
  channel_url: string;
};

const UC_RE = /^UC[A-Za-z0-9_-]{22}$/;

export async function resolveChannelInput(
  input: string,
  platformHint?: "youtube" | "instagram"
): Promise<ResolvedChannel> {
  const raw = (input || "").trim();
  if (!raw) throw new Error("Empty input");

  // 1. Platform detection
  const lower = raw.toLowerCase();
  let platform: "youtube" | "instagram" = platformHint || "youtube";
  if (!platformHint) {
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) platform = "youtube";
    else if (lower.includes("instagram.com")) platform = "instagram";
    // Raw UC… IDs are YouTube
    else if (UC_RE.test(raw)) platform = "youtube";
  }

  if (platform === "instagram") {
    // Extract username
    let username = raw.replace(/^@+/, "");
    const igMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
    if (igMatch) username = igMatch[1];
    username = username.replace(/\/+$/, "").trim();
    if (!username) throw new Error("Could not extract Instagram username from input");
    return {
      platform: "instagram",
      channel_id: username,
      channel_name: `@${username}`,
      channel_url: `https://www.instagram.com/${username}`,
    };
  }

  // YouTube
  // Raw UC… ID — short-circuit with just the ID (fetch name as a bonus).
  if (UC_RE.test(raw)) {
    const name = await fetchYouTubeTitle(`https://www.youtube.com/channel/${raw}`).catch(() => raw);
    return {
      platform: "youtube",
      channel_id: raw,
      channel_name: name || raw,
      channel_url: `https://www.youtube.com/channel/${raw}`,
    };
  }

  // Normalise to a fetchable URL.
  let url = raw;
  if (!/^https?:\/\//i.test(url)) {
    // @handle or bare handle
    const handle = url.replace(/^@+/, "");
    url = `https://www.youtube.com/@${handle}`;
  }

  // Fetch HTML and scrape channel ID + title
  const html = await fetchHtml(url);
  const idMatch =
    html.match(/"browseId":"(UC[A-Za-z0-9_-]{22})"/) ||
    html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) ||
    html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/);
  if (!idMatch) {
    throw new Error(
      `Couldn't find channel ID in ${url}. Double-check the link or paste the UC… ID directly.`
    );
  }
  const channelId = idMatch[1];

  const titleMatch =
    html.match(/<meta property="og:title" content="([^"]+)"/) ||
    html.match(/<title>([^<]+?)(?: - YouTube)?<\/title>/);
  const channelName = (titleMatch?.[1] || channelId).trim();

  return {
    platform: "youtube",
    channel_id: channelId,
    channel_name: channelName,
    channel_url: url,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.text();
}

async function fetchYouTubeTitle(url: string): Promise<string | null> {
  try {
    const html = await fetchHtml(url);
    const m =
      html.match(/<meta property="og:title" content="([^"]+)"/) ||
      html.match(/<title>([^<]+?)(?: - YouTube)?<\/title>/);
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}
