# AGENTS.md

Guidance for AI agents working in this repo.

## What this is

A prompt-injection **defense test-bench**. It runs a corpus of injection
attacks against a live Claude model (a sandboxed mock "SupportBot") and reports
attack-success-rate per category, graded by a deterministic canary check and an
independent LLM judge. Research/educational tool — the goal is to *understand
and measure* defenses, not to ship the highest score.

Public, MIT-licensed (see `LICENSE`). Contributor workflow + standards are in
`README.md` → Contributing.

## Architecture

- **`lib/eval.ts`** — orchestrator. `runEval()` builds the defended system
  prompt, runs each attack through input → model → output transforms, grades it,
  and aggregates the ASR matrix. Bounded concurrency via `mapLimit`.
- **`lib/attacks.ts`** — the corpus. Each `Attack` has a `category`, a checkable
  `goal`, a `channel` (`user` vs `tool_data`), and a documented `why`. Keep two
  attacks per category and **always document the mechanism**.
- **`lib/defenses.ts`** — `Defense` objects with optional `transformSystem` /
  `transformInput` / `transformOutput`. Adding a defense = add it here **and**
  mirror its metadata in `lib/catalog.ts` (client-safe, no server deps).
  `arch`-layer defenses (e.g. `dual_llm`) are **execution-mode markers** with no
  transforms — they change the eval's code path; `eval.ts` checks for the id.
- **`lib/dual.ts`** — the dual-LLM / quarantined-data architectural defense:
  `quarantine()` runs untrusted content through a sandboxed LLM (no secrets, no
  tools, schema-constrained output); `buildVettedContext()` is what the
  privileged model sees. Routed by `eval.ts` for `tool_data`-channel attacks
  when `dual_llm` is enabled.
- **`lib/canary.ts`** — deterministic verdict (ground truth).
- **`lib/judge.ts`** — LLM-judge verdict via structured output.
- **`lib/model.ts`** — target-model call.
- **`app/api/eval/route.ts`** — POST endpoint wrapping `runEval`.
- **`app/page.tsx`** — client UI. Must import only from `lib/catalog.ts` and
  `lib/types.ts` (type-only) — never from server modules that pull in
  `node:crypto`, `Buffer`, or the Anthropic SDK.

## Conventions

- **Models:** default to `claude-opus-4-8` for target, judge, and quarantine
  (overridable via `TARGET_MODEL` / `JUDGE_MODEL` / `QUARANTINE_MODEL`). Don't
  hardcode other model IDs.
- **New `arch` defense?** It won't fit `transformSystem/Input/Output` — add a
  marker to `defenses.ts` + `catalog.ts` and branch on its id in `eval.ts`'s
  `runOne`, the way `dual_llm` does.
- **Client/server split:** the eval harness is server-only. Don't import it into
  client components — use `lib/catalog.ts` for UI metadata.
- **Design system:** OLED-dark slate, green/amber/red status, Fira Code + Fira
  Sans. Tokens live in `app/globals.css` (`@theme`). Built with the
  `ui-ux-pro-max` + `frontend-design` skills — keep the security-lab aesthetic.
- **Tailwind v4** — config-less, `@import "tailwindcss"` + `@theme`.

## Before you call it done

```bash
npm test        # offline logic tests — must pass
npm run build   # type-check + production build — must pass
```

`npm run eval` needs `ANTHROPIC_API_KEY` and makes live calls; don't run it in CI
by default.

When you add an attack or defense: update the corpus/defense table in
`README.md`, mirror defense metadata in `lib/catalog.ts`, and add/extend a test
in `tests/harness.test.ts`.
