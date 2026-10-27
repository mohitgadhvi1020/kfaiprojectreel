import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET() {
  try {
    const preferences = await db.getContentPreferences();
    return NextResponse.json({ preferences });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { note, category } = body;

    if (!note || !note.trim()) {
      return NextResponse.json({ error: "Note is required" }, { status: 400 });
    }

    const validCategories = ["like", "dislike", "style", "instruction"];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const pref = await db.insertContentPreference({ note: note.trim(), category });
    return NextResponse.json({ preference: pref });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    await db.deleteContentPreference(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
