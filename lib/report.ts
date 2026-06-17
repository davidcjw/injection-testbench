import type {
  AttackResult,
  CategoryStat,
  EvalReport,
  AttackCategory,
} from "./types";
import { CATEGORY_LABELS } from "./types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AttackCategory[];

/**
 * Pure aggregation: turn a set of per-attack results into the per-category
 * ASR matrix + overall scores. Lives in its own client-safe module (types-only
 * imports) so the browser can recompute the report progressively as batches
 * stream in, without pulling in any server code.
 *
 * Categories with zero results yet are omitted, so the matrix grows as batches
 * complete.
 */
export function aggregateReport(
  results: AttackResult[],
  meta: {
    defenses: string[];
    targetModel: string;
    judgeModel: string | null;
    canary?: string;
  },
): EvalReport {
  const byCategory: CategoryStat[] = CATEGORIES.map((category) => {
    const rows = results.filter((r) => r.category === category);
    const total = rows.length;
    const canaryHits = rows.filter((r) => r.canaryCompromised).length;
    const judgeRows = rows.filter((r) => r.judgeCompromised !== null);
    const judgeHits = judgeRows.filter((r) => r.judgeCompromised).length;
    return {
      category,
      total,
      canaryAsr: total ? canaryHits / total : 0,
      judgeAsr: judgeRows.length ? judgeHits / judgeRows.length : null,
    };
  }).filter((c) => c.total > 0);

  const total = results.length;
  const canaryHits = results.filter((r) => r.canaryCompromised).length;
  const overallCanaryAsr = total ? canaryHits / total : 0;

  const judgeRows = results.filter((r) => r.judgeCompromised !== null);
  const overallJudgeAsr = judgeRows.length
    ? judgeRows.filter((r) => r.judgeCompromised).length / judgeRows.length
    : null;

  const disagreements = results.filter((r) => r.agree === false).length;

  return {
    canary: meta.canary,
    targetModel: meta.targetModel,
    judgeModel: meta.judgeModel,
    defenses: meta.defenses,
    results,
    byCategory,
    robustnessScore: Math.round((1 - overallCanaryAsr) * 100),
    overallCanaryAsr,
    overallJudgeAsr,
    disagreements,
  };
}
