// Pure, client-safe metadata for the UI. Mirrors the defenses defined in
// lib/defenses.ts without importing any server-only code (node:crypto, the
// Anthropic SDK, Buffer-based payload builders).
import type { DefenseLayer } from "./types";

export interface DefenseMeta {
  id: string;
  name: string;
  description: string;
  layer: DefenseLayer;
}

export const DEFENSE_CATALOG: DefenseMeta[] = [
  {
    id: "instruction_hierarchy",
    name: "Instruction hierarchy",
    layer: "prompt",
    description:
      "Repeats that standing policy outranks anything in user or retrieved content. Cheap; helps against direct override.",
  },
  {
    id: "spotlighting",
    name: "Spotlighting (datamarking)",
    layer: "prompt",
    description:
      "Wraps untrusted content in sentinels and tells the model it is data, never commands. Strong against indirect injection.",
  },
  {
    id: "input_filter",
    name: "Input filter (heuristic)",
    layer: "input",
    description:
      "Blocks requests matching known injection phrases before the model sees them. Blind to encoding / obfuscation.",
  },
  {
    id: "dual_llm",
    name: "Dual-LLM (quarantined data)",
    layer: "arch",
    description:
      "Untrusted retrieved content is processed by a sandboxed LLM with no secrets or tools; the privileged model only sees vetted, structured data. Defeats indirect injection structurally (it cannot help direct user-channel attacks).",
  },
  {
    id: "output_guard",
    name: "Output guard (egress filter)",
    layer: "output",
    description:
      "Redacts the secret token, forbidden strings, and banned tool calls from the response. Defeats leaks of known values only.",
  },
];

export const LAYER_LABELS: Record<DefenseLayer, string> = {
  prompt: "PROMPT",
  input: "INPUT",
  output: "OUTPUT",
  arch: "ARCH",
};
