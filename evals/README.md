# Evaluations

End-to-end checks of whether an LLM can drive the `pbir_*` surface against a
realistic `.Report` folder using nothing but the tool descriptions and schemas.
Per the [mcp-builder eval guide](https://github.com/anthropics/skills) — the
fourth phase of the workflow (Research → Implementation → Test → **Eval**).

## Run it

```bash
npm run eval:install              # one-time, requires Python 3.10+
export ANTHROPIC_API_KEY=sk-ant-...
npm run build
npm run eval                      # writes evals/last-report.md
```

The runner spawns the MCP over stdio with `PBIR_REPORT_PATH` pointing at the
frozen fixture, asks Claude each question with the MCP tools enabled, and
compares the answer against the expected single-string value.

A baseline summary lives in [`baseline.md`](./baseline.md) (committed). The
detailed per-question report (`last-report.md`) is gitignored — regenerated on
every run.

## Files

```
evals/
├── fixtures/sample.Report/   # frozen .Report folder — DO NOT EDIT
├── build-fixture.js          # rebuilds the fixture deterministically
├── questions.xml             # 10 qa_pair elements
├── run.py                    # vendored evaluation runner (stdio)
├── requirements.txt          # anthropic + mcp
├── baseline.md               # last-known accuracy summary (committed)
└── README.md                 # this file
```

## Fixture provenance

The fixture is built by `build-fixture.js`, which:

1. Patches `crypto.randomBytes` so `generateId()` returns counter-based hex
   (`00000000000000000001` etc) rather than random — identical bytes on every
   rebuild.
2. Patches `Date.now()` to `0` so the theme filename is reproducible.
3. Scaffolds a bare `.Report` skeleton (definition/report.json, version.json,
   pages/pages.json with empty pageOrder).
4. Drives the build through the same MCP tool handlers a real LLM would call:
   `pbir_create_page` × 3 (Overview, Products, Detail), `pbir_set_active_page`
   on Overview, `pbir_add_visual` (batch) × 3 for 10 visuals total,
   `pbir_set_report_theme` with a 4-color palette named "EvalTheme",
   `pbir_add_bookmark` × 2, `pbir_add_page_filter` × 2.

No `.SemanticModel` sibling is generated. Tools that walk model usage will
return "no semantic model" — that's intentional and at least one question
exercises that path.

To rebuild from scratch:

```bash
rm -rf evals/fixtures/sample.Report
node evals/build-fixture.js
```

The output should be byte-identical across runs. **Treat the fixture as
frozen** — never edit visual/page JSON files to make a question pass; rewrite
the question to reflect what the tool surface actually returns.

## Adding a question

1. Open `evals/questions.xml`.
2. Add a `<qa_pair>` block:
   ```xml
   <qa_pair>
     <question>Your single-answer question here.</question>
     <answer>single string</answer>
   </qa_pair>
   ```
3. Solve it manually using only read-only `pbir_*` tools (`pbir_get_*`,
   `pbir_list_*`, `pbir_lookup_*`, `pbir_audit_*`, `pbir_diff_*`,
   `pbir_model_usage`, `pbir_guide`). Never use `pbir_set_*`, `pbir_add_*`,
   `pbir_delete_*`, `pbir_update_*`.
4. Verify the answer is a single string (no JSON, no list).
5. Commit.

## Why eval is not in `test:all`

`npm run eval` calls the Anthropic API — it costs tokens and takes minutes.
Run it explicitly when validating tool-surface changes; let CI run the cheap
unit tests on every push.
