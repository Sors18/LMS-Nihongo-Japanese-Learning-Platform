import { NextResponse } from "next/server";
import { tokenizeAction } from "@/app/actions/tokenize";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text as unknown;

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    const tokens = await tokenizeAction(text);
    return NextResponse.json({ tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { text: string } to tokenize. Uses server-only kuromoji with 3600s cache.",
  });
}
