import { NextResponse } from "next/server";
import { ATTACKS } from "@/lib/attacks";
import type { AttackMeta } from "@/lib/types";

export const runtime = "nodejs";

/** Client-safe attack metadata (no payloads). The browser uses this to split
 *  the corpus into batches and render pending rows. No model calls, so no key
 *  or rate limit needed. */
export async function GET() {
  const attacks: AttackMeta[] = ATTACKS.map((a) => ({
    id: a.id,
    category: a.category,
    name: a.name,
    channel: a.channel,
    why: a.why,
    goalType: a.goal.type,
  }));
  return NextResponse.json({ attacks });
}
