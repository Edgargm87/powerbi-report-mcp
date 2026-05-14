# pbir_add_visual_calculation

> Add a DAX visual calculation to a matrix or table visual.

> **Registration status:** PARKED (see `pbir_list_visual_calculations.md`).

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| visualId | string | yes | |
| expression | string | yes | DAX (e.g. `RUNNINGSUM([Sales Amount])`) |
| displayName | string | yes | Shown in the visual |

## Output

```jsonc
{ "success": true, "name":"...", "displayName":"...", "expression":"..." }
```

## Behavior

- Appends a `NativeVisualCalculation` projection (Language:"dax") to the
  values bucket; legacy `query.calculations` array is deleted if present
- Fails when no queryState bucket with projections exists

## Common patterns

- `RUNNINGSUM([Sales])` — running total
- `RANK()` — rank within visual context
- `MOVINGAVERAGE([V], 3)` — 3-period moving average
- `PERCENTOFGRANDTOTAL([V])` — % of grand total
- `[V] - PREVIOUS([V])` — period-on-period delta
