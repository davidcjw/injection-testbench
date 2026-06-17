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

- **`lib/eval.ts`** — `runBatch()` runs a subset of attacks (or all) and returns
  raw per-attack results; each runs through input → model → output transforms,
  graded by canary + optional judge. Bounded concurrency via `mapLimit`.
  `runEval()` is a thin CLI wrapper (runBatch all → aggregate).
- **`lib/report.ts`** — pure, client-safe ASR aggregation (`aggregateReport`).
  The browser recomputes it as batches stream in (categories with no results
  yet are omitted, so the matrix grows). Server (CLI) uses it too.
- **`lib/ratelimit.ts`** — Upstash per-IP sliding window; **no-op when the
  `UPSTASH_*` env vars are absent** (local/forks still work).
- **Batched execution (Hobby 60s cap):** the client (`app/page.tsx`) fetches
  `GET /api/attacks` for metadata, chunks the corpus (`BATCH_SIZE`), and POSTs
  batches to `/api/eval` a few at a time, merging results client-side. Don't
  move aggregation back into the route — it would force one long request.
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
- **`app/api/eval/route.ts`** — POST endpoint wrapping `runEval`. **BYOK:** reads
  the caller's key from the `x-api-key` header (required; no env fallback on the
  web path), passes it to `runEval({ apiKey })`, and **never logs or persists
  it**. The Anthropic client is built per-request in `lib/anthropic.ts`
  (`makeClient`) and threaded through `eval.ts` → `model`/`judge`/`dual`. The CLI
  passes no key, so the SDK falls back to `ANTHROPIC_API_KEY`.
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
- **Client/server split:** the eval harness is server-only (it pulls in
  `node:crypto`, `Buffer`, the Anthropic SDK). Client components may import only
  the client-safe modules: `lib/types.ts` (types), `lib/catalog.ts` (defense
  metadata), and `lib/report.ts` (pure aggregation). Anything else stays server-
  side behind an API route.
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
