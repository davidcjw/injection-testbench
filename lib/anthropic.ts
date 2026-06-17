import Anthropic from "@anthropic-ai/sdk";

/**
 * Construct a per-request Anthropic client. When `apiKey` is provided (the
 * web path — every run is BYOK), the key is used for that request only and is
 * never persisted or logged server-side. When omitted (the CLI path), the SDK
 * falls back to the ANTHROPIC_API_KEY environment variable.
 */
export function makeClient(apiKey?: string): Anthropic {
  return new Anthropic(apiKey ? { apiKey } : {});
}
