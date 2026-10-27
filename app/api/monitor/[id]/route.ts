import { NextResponse } from "next/server";
import {
  getMonitoredContentById,
  updateMonitoredContent,
  deleteMonitoredContent,
} from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const item = await getMonitoredContentById(params.id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body;

    if (status && !["new", "reviewed", "used", "dismissed"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be new, reviewed, used, or dismissed" },
        { status: 400 }
      );
    }

    const updated = await updateMonitoredContent(params.id, body);
    return NextResponse.json({ item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await deleteMonitoredContent(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
