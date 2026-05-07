<!-- doc-version: 1.2 | Last updated: 2026-05-02 -->
# Eval Baseline — v0.9.6

Reference accuracy against `evals/fixtures/sample.Report` and `evals/questions.xml`
(10 read-only multi-hop questions). Recorded 2026-04-26.

Re-run with `npm run eval -- --model <model>`. Anything below the Sonnet
or Opus thresholds in this table on a future run = regression — investigate
before merging.

## Frozen results

### v0.9.6 (current — release-gate run after `pbir_validate_wireframe` addition)

| Model | Accuracy | Avg duration | Avg tool calls |
|-------|---------:|-------------:|---------------:|
| `claude-sonnet-4-5` | **10/10 (100 %)** | 65.4 s | **1.6** |

Sonnet **gained a point** vs the v0.9.0 baseline (was 9/10) — likely cumulative
effect of the v0.9.5 catalog trim + slimmer `pbir_get_visual_types` + the
v0.9.6 description discipline. Sonnet now matches Opus accuracy AND runs ~17 s
faster per task (65 s vs 78 s on the v0.9.0 Opus run). Tool-call count also
dropped from 1.9 → 1.6 — the model is making more decisive single-call choices
(likely picking `includeVisuals:true` more often, per the v0.9.2 description
nudge). 16 total calls (was 19) across 10 tasks.

The new `pbir_validate_wireframe` tool didn't appear in the agent's chosen
sequences — none of the 10 evaluation questions ask about layout validity.
That's expected; the tool's value surfaces in different workflows
(authoring, debugging) not the read-only verification questions in this suite.

### v0.9.1 (prior baseline — release-gate after `pbir_set_report` outputSchema fix)

| Model | Accuracy | Avg duration | Avg tool calls |
|-------|---------:|-------------:|---------------:|
| `claude-opus-4-5` | **10/10 (100 %)** | 82.3 s | 1.7 |

Opus held 10/10 after the v0.9.1 outputSchema fix (Option C: drop generic
outputSchema on mutation tools). +3 total tool calls vs v0.9.0 is model
variance — the model picked parallel `pbir_list_visuals` per page over
`pbir_list_pages({includeVisuals:true})` for Tasks 3 and 4 this run.
Same correct answers, chattier strategy. Not a regression.

### v0.9.0 (prior baseline)

| Model | Accuracy | Avg duration | Avg tool calls |
|-------|---------:|-------------:|---------------:|
| `claude-haiku-4-5` | 9/10 (90 %) | ~22 s | 1.9 |
| `claude-sonnet-4-5` | 9/10 (90 %) | ~39 s | 1.9 |
| `claude-opus-4-5` | **10/10 (100 %)** | ~78 s | **1.4** |

> Opus picks better tool combinations (e.g. one `pbir_list_pages` with
> `includeVisuals:true` instead of three sequential `pbir_list_visuals`
> calls). Sonnet matches Haiku on accuracy at 90 %, so the surface is
> well-shaped for mid-sized models — Opus's gain is decisiveness, not
> capability the smaller models lack.

## Regression thresholds

| Run on | Threshold | Below this means |
|--------|-----------|------------------|
| `claude-sonnet-4-5` | **≥ 9/10** | Tool description, schema, or fixture drift |
| `claude-opus-4-5` | **= 10/10** | Something the surface should make obvious is now ambiguous |

## Release gate

**Run `claude-sonnet-4-5` before each release.** Sonnet is the right
balance — fast enough to run regularly, capable enough that a real
regression actually shows up. Opus is too slow / expensive to gate on
(you'd resist running it). Haiku is too cheap to be informative — small
models can pass on questions where the surface is actually broken.

```sh
npm run eval -- --model claude-sonnet-4-5 -o evals/last-report.md
# Accept if accuracy ≥ 90 %. Otherwise diff against this baseline,
# investigate the failing question(s), fix the surface (or the question
# if it became ambiguous), update this file in the same PR.
```

## Run cost (approximate, per-run)

| Model | Cost | When to use |
|-------|-----:|-------------|
| Haiku 4.5 | ~$0.05 | Smoke test the runner end-to-end after touching evals/ |
| Sonnet 4.5 | ~$0.30 | Release gate (default) |
| Opus 4.5 | ~$1.50 | Ceiling test — only if Sonnet drops below 90 % |

## Provenance

- **Fixture:** `evals/fixtures/sample.Report/` — built by `evals/build-fixture.js`,
  byte-deterministic across reruns (verified `diff -r`). 3 pages, 10 visuals,
  4-color theme, 2 bookmarks, 2 page filters.
- **Questions:** `evals/questions.xml` — 10 read-only questions authored against
  the live MCP tool surface (not by reading fixture JSON), each manually solved
  to verify the expected answer.
- **MCP version at current baseline:** v0.9.6 (`fe335ff`). Original baseline at v0.9.0 (`8a6a82f`).
- **Runner:** `evals/run.py` (vendored from anthropic-skills:mcp-builder, patched
  for MCPEncoder + parallel tool_use handling).

## Adding a new question

The fixture is **frozen** — do not edit it to make a question pass. To add a
question:

1. Author the XML entry in `evals/questions.xml` against the existing fixture.
2. Solve it yourself by exercising the MCP tools.
3. Add it to `questions.xml` with the verified answer.
4. Re-run the baseline (all 3 models, save to `evals/last-report.md`) and
   update this file's table — the threshold may shift slightly with more
   questions in the mix.
