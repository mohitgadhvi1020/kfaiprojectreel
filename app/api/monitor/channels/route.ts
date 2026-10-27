import { NextResponse } from "next/server";
import {
  getAllMonitoredChannels,
  insertMonitoredChannel,
  deleteMonitoredChannel,
  updateMonitoredChannel,
} from "@/lib/db";
import { resolveChannelInput } from "@/lib/channel-resolver";

export async function GET() {
  try {
    const channels = await getAllMonitoredChannels();
    return NextResponse.json({ channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { platform: platformHint, url, channel_id, channel_name, channel_url } = body;

    // New flow: user pastes a URL (or @handle). Server resolves channel_id + name.
    // Legacy flow: caller supplies channel_id + channel_name directly.
    let finalPlatform: "youtube" | "instagram" = platformHint;
    let finalId = channel_id;
    let finalName = channel_name;
    let finalUrl = channel_url;

    if (url && (!channel_id || !channel_name)) {
      try {
        const resolved = await resolveChannelInput(url, platformHint);
        finalPlatform = resolved.platform;
        finalId = resolved.channel_id;
        finalName = channel_name?.trim() || resolved.channel_name;
        finalUrl = resolved.channel_url;
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || "Could not resolve channel from URL" },
          { status: 400 }
        );
      }
    }

    if (!finalPlatform || !finalId || !finalName) {
      return NextResponse.json(
        { error: "Provide a channel URL, or platform + channel_id + channel_name." },
        { status: 400 }
      );
    }

    if (!["youtube", "instagram", "twitter"].includes(finalPlatform)) {
      return NextResponse.json(
        { error: "platform must be youtube, instagram, or twitter" },
        { status: 400 }
      );
    }

    const channel = await insertMonitoredChannel({
      platform: finalPlatform,
      channel_id: finalId,
      channel_name: finalName,
      channel_url: finalUrl || null,
      added_at: new Date().toISOString(),
      last_polled_at: null,
      is_active: true,
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteMonitoredChannel(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const channel = await updateMonitoredChannel(id, updates);
    return NextResponse.json({ channel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
