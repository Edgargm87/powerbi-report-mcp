<!-- doc-version: 1.0 | Last updated: 2026-04-15 -->
<!-- summary: Visual-scope DAX calcs (running totals, period-over-period, ranking), authoring status, manage_extension_measures for report-level measures. -->
# Skill: Visual Calculations — Status and DAX Authoring

## TL;DR

**Visual calculations are parked in this MCP.** The code path exists in `src/tools/calculations.ts` but is not registered in `index.ts`, so `add_visual_calculation`, `list_visual_calculations`, and `delete_visual_calculation` are **not callable tools**. Read the rest of this file to understand why, and where DAX authoring actually belongs.

## What are visual calculations?

Visual calculations are DAX expressions scoped to the row/column context of a single visual (matrix, table, or chart) rather than the semantic model. They were introduced in Power BI Desktop in 2024 and are stored inside the PBIR JSON as `NativeVisualCalculation` projections attached to the visual's `queryState.Values` bucket:

```json
{
  "field": {
    "NativeVisualCalculation": {
      "Language": "dax",
      "Expression": "RUNNINGSUM([Sum of Profit])",
      "Name": "Running sum"
    }
  },
  "queryRef": "select",
  "nativeQueryRef": "Running sum"
}
```

Typical expressions: `RUNNINGSUM`, `RANK`, `MOVINGAVERAGE`, `PERCENTOFGRANDTOTAL`, `[Value] - PREVIOUS([Value])`.

## Why it's parked

Writing the JSON above into a visual directly produces a PBIR file that **loads without error** in Power BI Desktop but does not render the calculation — the column is absent from the matrix and there's no error surface. The prior UAT round (see bug B14 in `tests.md`) concluded that visual calculations require internal Power BI Desktop state initialization (column metadata registration, query plan compilation, client-side formula bar wiring) that cannot be reproduced by file manipulation alone.

Until that gap is understood, the tools stay unregistered so agents don't silently produce broken reports. The parked code is kept so a future contributor with PBI Desktop instrumentation access can resume the investigation — it is **not** a "just uncomment to enable" situation.

If you're a contributor: start by re-reading the B14 entry in `tests.md`, then compare the JSON the MCP writes with what PBI Desktop writes when you add a visual calculation manually through the formula bar. The divergence (if any) is the starting point.

## Where DAX actually belongs: the semantic model

For 99% of "give me a running total / % of total / rank / YoY delta" requests, the right answer is **a model-level measure**, not a visual calculation. Measures are:

- **Reusable** across every visual on every page
- **Testable** in DAX Studio / Tabular Editor
- **Version-controlled** in the TMDL / BIM file alongside the rest of the model
- **Documented** by Microsoft, SQLBI, and community references

Visual calculations exist for the narrow case where you need a result that depends on the visual's sort order or row context after filtering (e.g. "running total of whatever is currently displayed"). If the answer doesn't require visual context, use a measure.

## Authoring DAX for this MCP

DAX authoring is **not** a responsibility of `powerbi-report-mcp`. This server writes and reads the `.Report` folder; it does not touch the semantic model. DAX goes in the sibling MCP:

**`powerbi-modeling-mcp`** — Microsoft's official modeling MCP. It ships with its own skill documentation (in the `skills/` or equivalent folder inside that server's repo) covering:

- `measure_operations` — create, update, delete measures
- `column_operations` — calculated columns
- `calculation_group_operations` — calculation groups
- `dax_query_operations` — DAX queries for testing
- `table_operations`, `relationship_operations`, `perspective_operations`, etc.

When both MCPs are connected to the same Claude session, the agent can author a measure in the model MCP and then reference it by `Table[MeasureName]` in an `add_visual` call on the report MCP. You don't need to copy the DAX into this repo — the modeling MCP is the authority for model-level DAX.

### External DAX references (canonical)

If you need to write DAX from scratch (or review what the model MCP produced), these are the free, authoritative sources:

- **[daxpatterns.com](https://www.daxpatterns.com/)** — SQLBI's pattern library. Time intelligence, dynamic segmentation, ABC classification, cumulative totals, budget vs actual, new/returning customers, etc. Each pattern includes the measure definition and an explanation of the context transition.
- **[dax.guide](https://dax.guide/)** — SQLBI's DAX function reference. Every function with syntax, parameters, return type, and examples.
- **[Microsoft DAX reference](https://learn.microsoft.com/en-us/dax/dax-function-reference)** — the official function list with Microsoft examples.
- **SQLBI articles and videos** — Marco Russo and Alberto Ferrari publish long-form articles explaining *why* a pattern works, not just *what* to type. Search "sqlbi running total" or "sqlbi moving average" before inventing your own.

These are the same references Microsoft Learn links to. Nothing in this skill file is proprietary; it's just a pointer so an agent working in this MCP knows where to go.

## If a user asks for "a running total column in this table"

1. **Stop** — do not attempt to add a visual calculation.
2. Confirm whether they want it model-wide (almost always yes) or truly visual-scoped (rare).
3. If model-wide: hand the DAX request off to `powerbi-modeling-mcp` (`measure_operations` → create), then bind the new measure to the visual via `add_visual` or `update_visual_bindings`.
4. If visual-scoped: explain that this MCP does not currently support visual calculations and that the user will need to add the calculation manually in PBI Desktop's formula bar. Point them at the visual calculation documentation on Microsoft Learn.

## Related files

- `src/tools/calculations.ts` — parked code (not registered)
- `tests.md` — B14 entry with the original investigation
- `CHANGELOG.md` — `v0.5.x` row noting the park
- `skills/svg-visuals.md` — another DAX-adjacent topic; measures authored for SVG visuals follow the same modeling-MCP pattern
