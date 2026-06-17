import { NextResponse } from "next/server";
import { runBatch } from "@/lib/eval";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
// Vercel Hobby caps function duration at 60s. The web client sends the corpus
// in small batches so each request stays well under this.
export const maxDuration = 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
}

export async function POST(req: Request) {
  // Per-IP rate limit (protects Hobby compute minutes; no-op if Upstash unset).
  const rl = await checkRateLimit(clientIp(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limited. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  // BYOK: every web run uses the caller's own key. Read from the header, used
  // in-memory for this request only, never logged or persisted.
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API key. Add your Anthropic API key in the UI to run." },
      { status: 401 },
    );
  }
  if (!apiKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "That doesn't look like an Anthropic API key (expected sk-ant-…)." },
      { status: 400 },
    );
  }

  let body: {
    systemPrompt?: string;
    defenses?: string[];
    useJudge?: boolean;
    attackIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const batch = await runBatch({
      apiKey,
      systemPrompt: body.systemPrompt,
      defenseIds: Array.isArray(body.defenses) ? body.defenses : [],
      useJudge: body.useJudge !== false,
      attackIds: Array.isArray(body.attackIds) ? body.attackIds : undefined,
    });
    // Don't return the canary to the client — it's the secret under test.
    return NextResponse.json({
      targetModel: batch.targetModel,
      judgeModel: batch.judgeModel,
      results: batch.results,
    });
  } catch (err) {
    // Surface auth failures from the user's key clearly, but never echo the key.
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = /authentication|api key|401|invalid x-api-key/i.test(message)
      ? 401
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
