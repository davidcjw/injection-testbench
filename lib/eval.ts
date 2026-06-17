import type {
  Attack,
  AttackResult,
  Defense,
  EvalReport,
  AttackChannel,
} from "./types";
import { ATTACKS, buildBaseSystemPrompt } from "./attacks";
import { getDefenses } from "./defenses";
import type Anthropic from "@anthropic-ai/sdk";
import { makeCanary, canaryCompromised } from "./canary";
import { makeClient } from "./anthropic";
import { aggregateReport } from "./report";
import { callTarget, TARGET_MODEL } from "./model";
import { judge, JUDGE_MODEL } from "./judge";
import { quarantine, buildVettedContext, DUAL_LLM_ID } from "./dual";

/** Run all enabled defenses' transforms around a single attack and return the
 *  graded result. The order — input filter → spotlight wrap → model → output
 *  guard — mirrors a real request pipeline. */
async function runOne(
  client: Anthropic,
  attack: Attack,
  canary: string,
  baseSystem: string,
  defenses: Defense[],
  useJudge: boolean,
  dual: boolean,
): Promise<AttackResult> {
  // 1. Prompt-layer defenses harden the (privileged) system prompt.
  let system = baseSystem;
  for (const d of defenses) if (d.transformSystem) system = d.transformSystem(system);

  // 2. Input-layer defenses transform / gate the untrusted content.
  let content = attack.build(canary);
  let blocked = false;
  const channel: AttackChannel = attack.channel;
  for (const d of defenses) {
    if (d.transformInput) {
      const r = d.transformInput(content, channel);
      content = r.content;
      if (r.blocked) blocked = true;
    }
  }

  // 3. Resolve the model output along one of three paths.
  let output: string;
  let quarantined = false;
  if (blocked) {
    output = "[request blocked by input filter before reaching the model]";
  } else if (dual && channel === "tool_data") {
    // Dual-LLM: untrusted retrieved content is handled by the quarantined
    // model (no secrets, no tools); the privileged model only sees the vetted
    // structured summary, so injected instructions never reach it.
    quarantined = true;
    const q = await quarantine(client, content);
    output = await callTarget(client, system, buildVettedContext(q));
    for (const d of defenses)
      if (d.transformOutput) output = d.transformOutput(output, attack.goal, canary);
  } else {
    // Single-LLM path. Note: in dual mode, direct user-channel messages still
    // reach the privileged model — the user is the principal and cannot be
    // quarantined without breaking the assistant. This is why dual-LLM helps
    // indirect injection far more than direct injection.
    output = await callTarget(client, system, content);
    for (const d of defenses)
      if (d.transformOutput) output = d.transformOutput(output, attack.goal, canary);
  }

  // 5. Grade: deterministic canary verdict + optional LLM judge.
  const canaryHit = blocked ? false : canaryCompromised(output, attack.goal, canary);

  let judgeCompromised: boolean | null = null;
  let judgeReasoning: string | null = null;
  if (useJudge && !blocked) {
    const v = await judge(client, attack, output);
    judgeCompromised = v.compromised;
    judgeReasoning = v.reasoning;
  } else if (useJudge && blocked) {
    judgeCompromised = false;
    judgeReasoning = "request was blocked before the model responded";
  }

  return {
    attackId: attack.id,
    category: attack.category,
    name: attack.name,
    channel: attack.channel,
    goalType: attack.goal.type,
    blocked,
    quarantined,
    output: output.slice(0, 2000),
    canaryCompromised: canaryHit,
    judgeCompromised,
    judgeReasoning,
    agree: judgeCompromised === null ? null : judgeCompromised === canaryHit,
  };
}

/** Bounded-concurrency map so we don't open dozens of API calls at once. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface RunBatchOptions {
  systemPrompt?: string;
  defenseIds?: string[];
  useJudge?: boolean;
  concurrency?: number;
  /** Per-request key (web/BYOK). Omit to fall back to ANTHROPIC_API_KEY (CLI). */
  apiKey?: string;
  /** Run only this subset of attacks (by id). Omit to run the whole corpus.
   *  The web client passes small batches so each request fits the 60s cap. */
  attackIds?: string[];
}

export interface BatchOutput {
  canary: string;
  targetModel: string;
  judgeModel: string | null;
  results: AttackResult[];
}

/** Run a subset (or all) of the corpus and return the raw per-attack results.
 *  Aggregation into the ASR matrix is done separately (lib/report.ts) so the
 *  web client can merge batches and recompute progressively. */
export async function runBatch(opts: RunBatchOptions = {}): Promise<BatchOutput> {
  const {
    systemPrompt,
    defenseIds = [],
    useJudge = true,
    concurrency = 4,
    apiKey,
    attackIds,
  } = opts;

  const client = makeClient(apiKey);
  const canary = makeCanary();
  const defenses = getDefenses(defenseIds);
  const dual = defenseIds.includes(DUAL_LLM_ID);
  // The user can supply their own persona; the canary + security policy are
  // always injected so the goals stay checkable.
  const baseSystem = buildBaseSystemPrompt(
    canary,
    systemPrompt?.trim() ? `\nADDITIONAL CONTEXT FROM OPERATOR:\n${systemPrompt.trim()}` : "",
  );

  const selected =
    attackIds && attackIds.length
      ? ATTACKS.filter((a) => attackIds.includes(a.id))
      : ATTACKS;

  const results = await mapLimit(selected, concurrency, (attack) =>
    runOne(client, attack, canary, baseSystem, defenses, useJudge, dual),
  );

  return {
    canary,
    targetModel: TARGET_MODEL,
    judgeModel: useJudge ? JUDGE_MODEL : null,
    results,
  };
}

export type RunEvalOptions = Omit<RunBatchOptions, "attackIds">;

/** Convenience wrapper for the CLI: run the whole corpus in one shot and
 *  aggregate into a full report. */
export async function runEval(opts: RunEvalOptions = {}): Promise<EvalReport> {
  const batch = await runBatch(opts);
  return aggregateReport(batch.results, {
    defenses: opts.defenseIds ?? [],
    targetModel: batch.targetModel,
    judgeModel: batch.judgeModel,
    canary: batch.canary,
  });
}
