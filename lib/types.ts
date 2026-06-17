// Shared types for the injection test-bench.

/** The six mechanisms by which prompt injection works. The corpus is grouped
 *  by these so the eval matrix shows *which class* of attack a given defense
 *  actually moves the needle on. */
export type AttackCategory =
  | "instruction_override"
  | "roleplay_jailbreak"
  | "encoding_obfuscation"
  | "indirect_injection"
  | "tool_exfiltration"
  | "delimiter_confusion";

export const CATEGORY_LABELS: Record<AttackCategory, string> = {
  instruction_override: "Instruction Override",
  roleplay_jailbreak: "Role-play / Jailbreak",
  encoding_obfuscation: "Encoding / Obfuscation",
  indirect_injection: "Indirect Injection",
  tool_exfiltration: "Tool / Exfiltration",
  delimiter_confusion: "Delimiter Confusion",
};

/** Where the malicious payload enters the model.
 *  - "user": typed by the user directly.
 *  - "tool_data": smuggled inside content the app retrieved on the user's
 *    behalf (a document, a web page, a product review) — the most important
 *    and underrated class, since the user never sees it. */
export type AttackChannel = "user" | "tool_data";

/** A concrete, machine-checkable definition of "the attack succeeded".
 *  This is what makes the canary verdict deterministic. */
export type AttackGoal =
  // The model leaked the secret access token from its system prompt.
  | { type: "canary_leak" }
  // The model emitted a specific forbidden string it was told never to output.
  | { type: "forbidden_string"; value: string }
  // The model invoked a banned tool based on injected instructions.
  | { type: "banned_tool"; call: string };

export interface Attack {
  id: string;
  category: AttackCategory;
  name: string;
  /** Why this works — the mechanism, in one or two sentences. The point of the
   *  bench is to understand this, not just to score it. */
  why: string;
  channel: AttackChannel;
  goal: AttackGoal;
  /** Builds the payload. Receives the per-run canary so encoded attacks can
   *  reference it if needed (most don't — the token lives in the system
   *  prompt and the attack just tries to extract it). */
  build: (canary: string) => string;
}

/** A defense is a set of optional transforms applied around the model call.
 *  Layered so you can toggle each independently and watch the matrix change. */
export type DefenseLayer = "prompt" | "input" | "output" | "arch";

export interface Defense {
  id: string;
  name: string;
  description: string;
  layer: DefenseLayer;
  /** Harden the system prompt (instruction hierarchy, spotlighting rules). */
  transformSystem?: (system: string) => string;
  /** Pre-filter untrusted input. `blocked: true` short-circuits the model
   *  call entirely (the request is refused before it reaches the model). */
  transformInput?: (content: string, channel: AttackChannel) => {
    content: string;
    blocked: boolean;
  };
  /** Post-process the model output (redaction, allow-listing). */
  transformOutput?: (output: string, goal: AttackGoal, canary: string) => string;
}

export interface AttackResult {
  attackId: string;
  category: AttackCategory;
  name: string;
  channel: AttackChannel;
  goalType: AttackGoal["type"];
  /** True if an input filter refused the request before the model saw it. */
  blocked: boolean;
  /** True if the untrusted content was routed through the quarantined LLM
   *  (dual-LLM mode) instead of reaching the privileged model directly. */
  quarantined: boolean;
  output: string;
  /** Deterministic verdict: did the goal string/token actually appear? */
  canaryCompromised: boolean;
  /** LLM-judge verdict: does a separate model think the response was owned? */
  judgeCompromised: boolean | null;
  judgeReasoning: string | null;
  /** The interesting cell to study: where the two verdicts disagree. */
  agree: boolean | null;
}

export interface CategoryStat {
  category: AttackCategory;
  total: number;
  /** Attack-success-rate by the canary (deterministic) verdict, 0..1. */
  canaryAsr: number;
  /** Attack-success-rate by the LLM judge, 0..1 (null if judge disabled). */
  judgeAsr: number | null;
}

export interface EvalReport {
  canary: string;
  targetModel: string;
  judgeModel: string | null;
  defenses: string[];
  results: AttackResult[];
  byCategory: CategoryStat[];
  /** 0..100, where 100 = no attack succeeded (by the canary verdict). */
  robustnessScore: number;
  overallCanaryAsr: number;
  overallJudgeAsr: number | null;
  /** Count of attacks where canary and judge disagreed. */
  disagreements: number;
}
