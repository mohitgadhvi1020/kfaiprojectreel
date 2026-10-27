import { NextResponse } from "next/server";
import { getAllCharacterSets } from "@/lib/video/character-sets";

export async function GET() {
  const sets = getAllCharacterSets();
  return NextResponse.json({ characterSets: sets });
}
