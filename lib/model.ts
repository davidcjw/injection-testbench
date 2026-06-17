import type Anthropic from "@anthropic-ai/sdk";

/** The model being attacked. Defaults to the most capable model so the
 *  defenses are tested against a strong adversary's target. */
export const TARGET_MODEL = process.env.TARGET_MODEL || "claude-opus-4-8";

/** One turn of the system-under-test: a system prompt + a single user message.
 *  No thinking — this is a plain assistant responding to a (possibly hostile)
 *  request, and we want its default behavior. The client is supplied by the
 *  caller so the request runs on the right (user-supplied or env) key. */
export async function callTarget(
  client: Anthropic,
  system: string,
  userContent: string,
): Promise<string> {
  const res = await client.messages.create({
    model: TARGET_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
