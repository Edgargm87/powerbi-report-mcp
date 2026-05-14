# Calculations Context

## When this folder is loaded

Load this room when adding DAX to the report itself (visual calculations or
report-level extension measures). Skip when the calculation belongs in the
*semantic model* — that's a different MCP entirely.

## Tools in this room

- `pbir_list_visual_calculations` — List DAX visual calcs on a matrix/table visual
- `pbir_add_visual_calculation` — Add a NativeVisualCalculation projection
- `pbir_delete_visual_calculation` — Remove by name
- `pbir_manage_extension_measures` — Report-level measures in `reportExtensions.json`

## Pipeline / ordering

Visual calc:

1. `visuals/pbir_get_visual(verbose:true)` to inspect existing projections
2. `pbir_add_visual_calculation` with a DAX expression
3. `pbir_list_visual_calculations` to verify

Extension measure:

1. `pbir_manage_extension_measures(operation:'list')` to inspect
2. `pbir_manage_extension_measures(operation:'add', tableName, measureName, expression, dataType)`
3. Same tool with `'remove'` when done

## Cross-references

- Reads `knowledge/calculations.md` for DAX patterns
- Pairs with `visuals/pbir_update_visual_bindings` (measures bind via the
  same FieldRef path)
- `report/pbir_model_usage` cross-references both visual calcs and extension measures

## Gotchas

- **Visual calculations require a matrix or table visual** with bindings —
  `findValuesBucket()` looks in `Values` then `Rows`, then first bucket with
  projections; throws if none found.
- **Empty `reportExtensions.json` crashes PBI Desktop** — `pbir_manage_extension_measures`
  auto-deletes the file when the last measure is removed.
- **`_Measures` is the default home table** for extension measures. PBI Desktop
  shows it as a "report-level" measures table separate from the model.
- **Common DAX patterns**: `RUNNINGSUM([Sales])`, `RANK()`, `MOVINGAVERAGE([V],3)`,
  `PERCENTOFGRANDTOTAL([V])`, `[V]-PREVIOUS([V])`.

## Note on registration

The visual-calculation tools are registered under `src/tools/calculations.ts`
but `registerCalculationTools` is **commented out (PARKED)** in `src/index.ts`
as of v0.9.6 — they're not actually exposed. Documented here for completeness.
`pbir_manage_extension_measures` IS active.
