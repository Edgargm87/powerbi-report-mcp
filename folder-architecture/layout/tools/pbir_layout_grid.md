# pbir_layout_grid

> Compute a deterministic rows×cols grid; server owns margin/gap/remainder math. Use this INSTEAD of N `pbir_add_visual` calls when building a page from scratch. `planOnly:true` (default) returns the plan; `planOnly:false` validates bindings+layout then writes in one call.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| rows | number ≥ 1 | yes | — | |
| cols | number ≥ 1 | yes | — | |
| gaps | number ≥ 0 | no | CANVAS.gap (5) | Px between cells, both directions |
| margins | `{left?, right?, top?, bottom?}` | no | canonical | All in px |
| reserveBannerRow | boolean | no | false | Start grid at `CANVAS.firstContentRowY`, leaving top `CANVAS.bannerHeight` px for a banner shape |
| cells | `Cell[]` | yes (min 1) | — | Empty slots allowed |
| planOnly | boolean | no | true | true = plan only; false = validate + write |
| strictLayout | boolean | no | env default | |
| strictBindings | boolean | no | env default | Commit-mode only |
| includeTypes | boolean | no | false | Return full `{visualId,visualType,slotRef,x,y,width,height}` per cell |

`Cell` shape includes a row/col location, optional spans, and a full
`VisualSpecSchema` payload (see `visuals/pbir_add_visual.md`).

## Output (planOnly)

```jsonc
{
  "success": true,
  "plan": [ { "slotRef": "r0c0", "x":20, "y":50, "width":..., "height":..., "visualType":"barChart" } ],
  "canvas": { /* getCanvasSummary() */ },
  "grid": { "rows":2, "cols":3, "gaps":5, "margins":{...}, "reserveBannerRow":false }
}
```

## Output (commit)

Adds `"created": [...]` and may include `bindingAutoCorrections`, `bindingValidation`, `layoutWarnings`.

## Validation

1. **Pre-geometry grid check** — every cell fits inside `rows×cols`, no two cells
   overlap the same slot. Fails with `error: "grid_validation_failed"`.
2. **Layout validator** — runs the computed positions through margins/gaps/overlap rules.
3. **Binding validator** — only when `planOnly:false`.

## What's NOT replicable in markdown

- Cell-grid permutation validation
- Margin / gap / remainder arithmetic (slotWidth = (canvas - marginL - marginR - (cols-1)*gap) / cols, etc.)
- `validateCellGrid` + `runLayoutValidation` are dozens of lines of geometric code

## See also

- `knowledge/wireframes.md` — grid-shape selection
- `../context.md`
- `pbir_validate_wireframe.md` — post-hoc audit
