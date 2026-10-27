/**
 * Lightweight Open Graph / Twitter Card scraper.
 *
 * For each source URL we get from the explainer (cursor.com, anthropic.com,
 * huggingface.co, etc.), launch pages almost always set <meta property="og:image">
 * pointing at a polished hero image — the same one that shows up when you
 * paste the URL into Slack/Twitter. We pull that, plus a couple of fallbacks
 * (twitter:image, twitter:player, og:video) and the page title.
 *
 * No API keys, no third-party libs. Just fetch + a small regex pass that's
 * good enough for the launch-page case (we are NOT trying to parse arbitrary
 * HTML — just <meta> tags in the <head>).
 */

export interface OgResult {
  sourceUrl: string;
  title: string | null;
  description: string | null;
  image: string | null; // best hero image we could find
  video: string | null; // og:video or twitter:player if present
  siteName: string | null;
  /** Extra images we found (twitter:image, additional og:image tags). The
   *  primary one is in `image`; this is for the gallery to show alternates. */
  extraImages: string[];
}

// Tight per-fetch timeout: launch pages should respond in <2s. If they don't,
// we'd rather skip and let the rest of the pipeline run than hang.
const FETCH_TIMEOUT_MS = 4000;

const UA =
  "Mozilla/5.0 (compatible; AI-Content-Engine/1.0; +https://example.com/bot)";

function abs(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/**
 * Pull all <meta name|property="..." content="..."> values from a chunk of
 * HTML. Order-preserving so the first og:image wins (which is what every
 * spec-compliant page sets as primary).
 */
function extractMetaTags(html: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  // Cap to first 64KB — the head is always at the top and we don't want to
  // regex through a 2MB SPA bundle.
  const head = html.slice(0, 65536);
  const re =
    /<meta\s+(?:[^>]*?\s)?(?:name|property)\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  // Also handle reversed order: content="..." property="..."
  const reReversed =
    /<meta\s+(?:[^>]*?\s)?content\s*=\s*["']([^"']*)["'][^>]*?(?:name|property)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) {
    out.push({ key: m[1].toLowerCase(), value: m[2] });
  }
  while ((m = reReversed.exec(head))) {
    out.push({ key: m[2].toLowerCase(), value: m[1] });
  }
  return out;
}

function extractTitle(html: string): string | null {
  const m = html.slice(0, 65536).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export async function scrapeOg(url: string): Promise<OgResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return null;
    }
    // We only need the head — read the response as text but rely on our
    // 64KB slice above to avoid blowing memory on huge pages. (fetch doesn't
    // give us a clean way to say "first 64KB only" cross-platform.)
    const html = await res.text();
    const tags = extractMetaTags(html);

    const get = (...keys: string[]) => {
      for (const k of keys) {
        const t = tags.find((x) => x.key === k);
        if (t && t.value) return t.value;
      }
      return null;
    };

    const allOgImages = tags
      .filter((x) => x.key === "og:image" || x.key === "twitter:image" || x.key === "og:image:secure_url")
      .map((x) => abs(x.value, url));

    const primaryImage = allOgImages[0] || null;
    const extraImages = Array.from(new Set(allOgImages.slice(1)));

    const video =
      get("og:video", "og:video:url", "og:video:secure_url", "twitter:player") || null;

    const description = get("og:description", "twitter:description", "description");

    return {
      sourceUrl: url,
      title: get("og:title", "twitter:title") || extractTitle(html),
      description,
      image: primaryImage,
      video: video ? abs(video, url) : null,
      siteName: get("og:site_name") || (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      })(),
      extraImages,
    };
  } catch (err: any) {
    // Timeout, DNS error, blocked by CF — caller treats null as "skip".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scrape multiple URLs in parallel. Bounded concurrency so a card with
 * 5 sources doesn't fan out to 5 simultaneous fetches if one site is slow.
 */
export async function scrapeOgBatch(urls: string[]): Promise<OgResult[]> {
  const results = await Promise.all(urls.map((u) => scrapeOg(u)));
  return results.filter((r): r is OgResult => r !== null);
}
