# pbir_model_usage

> Cross-reference the semantic model with the report — shows where every measure and column is used, DAX dependencies, unused fields, and per-page coverage. Also generates an HTML dashboard for visual inspection. Requires a sibling `.SemanticModel/` folder alongside the `.Report/` — call `pbir_get_report` first to check `hasSemanticModel` before invoking this tool.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| reportPath | string | no | current binding | Override |
| slim | boolean | no | true | Slim returns usage counts only; false adds visual-level detail |

## Output

Massive — usage map of measures, columns, calculation groups, etc., plus a
path to the regenerated HTML dashboard.

## Behavior

- `readOnlyHint: true`
- Per-report cache with mtime fingerprint; rebuilds only when files change
- Always regenerates HTML dashboard (async, non-blocking) under `<reportRoot>/.pbir-mcp/usage/`
- File watchers re-bust cache on `.SemanticModel/` mutations

## What's NOT replicable in markdown

- TMDL parser for the semantic model
- DAX dependency graph builder
- HTML generator (`generateHTML`)
- mtime-based fingerprint cache + file-system watchers

## In the default tool set

One of the 13 default-loaded tools — the "did I forget to bind this measure?"
question is too frequent to require activation.

## Categorization note

`pbir_model_usage` lives in `src/model-usage.ts` (its own file), not under
`src/tools/`. Filed here under `report/` because it's the report's
cross-reference with the model.
