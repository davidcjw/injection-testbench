/**
 * CLI harness — the fast iteration loop for learning.
 *
 *   npm run eval                          # all attacks, no defenses, with judge
 *   npm run eval -- --defenses spotlighting,output_guard
 *   npm run eval -- --no-judge            # canary verdict only (faster/cheaper)
 *   npm run eval -- --defenses input_filter --no-judge
 *
 * Prints the per-category attack-success-rate matrix and flags any cells where
 * the canary and the LLM judge disagree — the most instructive output.
 */
import { runEval } from "../lib/eval";
import { DEFENSES } from "../lib/defenses";
import { CATEGORY_LABELS } from "../lib/types";

function parseArgs(argv: string[]) {
  let defenses: string[] = [];
  let useJudge = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--defenses") defenses = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--no-judge") useJudge = false;
  }
  return { defenses, useJudge };
}

const bar = (asr: number, width = 20) => {
  const filled = Math.round(asr * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};
const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(4);

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY is not set. Add it to .env or your shell.");
    process.exit(1);
  }

  const { defenses, useJudge } = parseArgs(process.argv.slice(2));
  const known = new Set(DEFENSES.map((d) => d.id));
  const unknown = defenses.filter((d) => !known.has(d));
  if (unknown.length) {
    console.error(`✗ Unknown defense(s): ${unknown.join(", ")}`);
    console.error(`  Available: ${DEFENSES.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n  defenses: ${defenses.length ? defenses.join(", ") : "(none)"}`);
  console.log(`  judge:    ${useJudge ? "on" : "off"}`);
  console.log("  running corpus…\n");

  const report = await runEval({ defenseIds: defenses, useJudge });

  console.log(`  target: ${report.targetModel}    judge: ${report.judgeModel ?? "—"}`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  CATEGORY                 CANARY-ASR              JUDGE-ASR`);
  for (const c of report.byCategory) {
    const judge = c.judgeAsr === null ? "  —" : pct(c.judgeAsr);
    console.log(
      `  ${CATEGORY_LABELS[c.category].padEnd(22)} ${bar(c.canaryAsr)} ${pct(c.canaryAsr)}   ${judge}`,
    );
  }
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  ROBUSTNESS SCORE: ${report.robustnessScore}/100   (overall canary-ASR ${pct(report.overallCanaryAsr)})`);
  if (report.overallJudgeAsr !== null)
    console.log(`  judge overall-ASR ${pct(report.overallJudgeAsr)}   disagreements: ${report.disagreements}`);

  const disagree = report.results.filter((r) => r.agree === false);
  if (disagree.length) {
    console.log(`\n  ⚠ canary/judge disagreements (study these):`);
    for (const r of disagree) {
      console.log(
        `    • ${r.attackId}: canary=${r.canaryCompromised ? "OWNED" : "safe"} judge=${r.judgeCompromised ? "OWNED" : "safe"}`,
      );
      if (r.judgeReasoning) console.log(`      judge: ${r.judgeReasoning}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
