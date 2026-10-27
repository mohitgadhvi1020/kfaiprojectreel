import { NextResponse } from "next/server";
import {
  getMonitoredContent,
  getMonitoredChannels,
  insertMonitoredContent,
  updateMonitoredChannel,
} from "@/lib/db";
import { getActiveSettings } from "@/lib/settings";
import { pollYouTubeChannels, extractTranscript } from "@/lib/youtube-monitor";
import { pollInstagramAccounts } from "@/lib/instagram-monitor";
import { analyzeVideoContent, analyzeInstagramContent } from "@/lib/content-analyzer";

const MAX_YOUTUBE_ITEMS_PER_POLL = 20;
const MAX_INSTAGRAM_ITEMS_PER_POLL = 30;
const INSTAGRAM_POSTS_PER_ACCOUNT = 10;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    const limit = parseInt(searchParams.get("limit") || "100");

    let items;
    if (source) {
      const { getMonitoredContentBySource } = await import("@/lib/db");
      items = await getMonitoredContentBySource(source, limit);
    } else {
      items = await getMonitoredContent(limit);
    }

    const channels = await getMonitoredChannels();

    return NextResponse.json({
      items,
      channels,
      total: items.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const settings = await getActiveSettings();
    const channels = await getMonitoredChannels();

    const ytChannels = channels
      .filter((c: any) => c.platform === "youtube")
      .map((c: any) => ({ id: c.channel_id, name: c.channel_name }));

    const igAccounts = channels
      .filter((c: any) => c.platform === "instagram")
      .map((c: any) => c.channel_id);

    console.log(
      `[monitor] POST starting — yt=${ytChannels.length} ig=${igAccounts.length} ` +
        `hasYouTubeChannels=${ytChannels.length > 0} hasApify=${!!settings.apify_api_key} ` +
        `hasOpenAI=${!!settings.openai_api_key}`
    );

    let ytProcessed = 0;
    let igProcessed = 0;
    const errors: string[] = [];

    if (ytChannels.length > 0) {
      try {
        const newVideos = await pollYouTubeChannels(ytChannels);
        console.log(`[monitor] youtube poll returned ${newVideos.length} new videos`);

        for (const video of newVideos.slice(0, MAX_YOUTUBE_ITEMS_PER_POLL)) {
          try {
            let transcript = "";
            let analysis = {
              summary: `New video: "${video.title}" by ${video.channelName}`,
              topics: [] as string[],
              tools_mentioned: [] as string[],
              content_ideas: [] as string[],
              key_insights: [] as string[],
              content_type: "unknown",
            };

            if (settings.openai_api_key) {
              transcript = await extractTranscript(video.videoId);
              analysis = await analyzeVideoContent(
                video.title,
                transcript,
                video.channelName,
                settings.openai_api_key
              );
            }

            await insertMonitoredContent({
              source: "youtube",
              source_channel_id: video.channelId,
              source_channel_name: video.channelName,
              title: video.title,
              url: video.url,
              thumbnail: video.thumbnail,
              published_at: video.published,
              raw_text: transcript.substring(0, 50000),
              summary: analysis.summary,
              topics: analysis.topics,
              tools_mentioned: analysis.tools_mentioned,
              content_ideas: analysis.content_ideas,
              key_insights: analysis.key_insights,
              content_type: analysis.content_type,
              status: "new",
              created_at: new Date().toISOString(),
            });

            ytProcessed++;
          } catch (err: any) {
            errors.push(`YT "${video.title}": ${err.message}`);
          }
        }

        for (const ch of channels.filter((c: any) => c.platform === "youtube")) {
          await updateMonitoredChannel(ch.id, {
            last_polled_at: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        errors.push(`YouTube polling: ${err.message}`);
      }
    }

    if (igAccounts.length > 0) {
      try {
        const newPosts = await pollInstagramAccounts(
          igAccounts,
          settings.apify_api_key,
          INSTAGRAM_POSTS_PER_ACCOUNT
        );
        console.log(`[monitor] instagram poll returned ${newPosts.length} new posts`);

        for (const post of newPosts.slice(0, MAX_INSTAGRAM_ITEMS_PER_POLL)) {
          try {
            let analysis = {
              summary: `Post by @${post.ownerUsername}`,
              topics: [] as string[],
              tools_mentioned: [] as string[],
              content_ideas: [] as string[],
              key_insights: [] as string[],
              content_type: "unknown",
            };

            if (settings.openai_api_key && post.caption.length > 10) {
              analysis = await analyzeInstagramContent(
                post.caption,
                post.ownerUsername,
                settings.openai_api_key
              );
            }

            await insertMonitoredContent({
              source: "instagram",
              source_channel_id: post.ownerUsername,
              source_channel_name: `@${post.ownerUsername}`,
              title: post.caption.substring(0, 120) || `Post by @${post.ownerUsername}`,
              url: post.url,
              thumbnail: post.thumbnailUrl,
              published_at: post.published,
              raw_text: post.caption,
              summary: analysis.summary,
              topics: analysis.topics,
              tools_mentioned: analysis.tools_mentioned,
              content_ideas: analysis.content_ideas,
              key_insights: analysis.key_insights,
              content_type: analysis.content_type,
              status: "new",
              created_at: new Date().toISOString(),
            });

            igProcessed++;
          } catch (err: any) {
            errors.push(`IG @${post.ownerUsername}: ${err.message}`);
          }
        }

        for (const ch of channels.filter((c: any) => c.platform === "instagram")) {
          await updateMonitoredChannel(ch.id, {
            last_polled_at: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        errors.push(`Instagram polling: ${err.message}`);
      }
    }

    console.log(
      `[monitor] done — ytProcessed=${ytProcessed} igProcessed=${igProcessed} ` +
        `errors=${errors.length}${
          errors.length ? "\n  - " + errors.join("\n  - ") : ""
        }`
    );

    return NextResponse.json({
      success: true,
      youtube_processed: ytProcessed,
      instagram_processed: igProcessed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
