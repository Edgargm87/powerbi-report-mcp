# pbir_list_visual_calculations

> List all visual calculations on a visual. Visual calculations are DAX expressions scoped to the visual context (e.g. running totals, ranks).

> **Registration status:** PARKED — `registerCalculationTools` is commented out in `src/index.ts` as of v0.9.6. Documented here for completeness.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| visualId | string | yes | |

## Output

```jsonc
{ "count": N, "calculations": [ { "name":"Running sum","expression":"RUNNINGSUM([Sum of Profit])","displayName":"Running sum" } ] }
```

## Behavior

- Reads `visual.query.queryState[<bucket>].projections[]` for `NativeVisualCalculation` entries
- Bucket priority: `Values` → `Rows` → first bucket with projections
