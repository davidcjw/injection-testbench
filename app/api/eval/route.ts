import { NextResponse } from "next/server";
import { runEval } from "@/lib/eval";

export const runtime = "nodejs";
// The corpus makes many model calls; give the route room.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  let body: {
    systemPrompt?: string;
    defenses?: string[];
    useJudge?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const report = await runEval({
      systemPrompt: body.systemPrompt,
      defenseIds: Array.isArray(body.defenses) ? body.defenses : [],
      useJudge: body.useJudge !== false,
    });
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
