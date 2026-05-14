# pbir_change_visual_type

> Change the visual type of an existing visual (e.g. `barChart` → `columnChart`) while keeping data bindings.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| visualId | string | yes | |
| visualType | string | yes | New type |

## Output

```jsonc
{ "success": true, "visualId": "...", "visualType": "columnChart" }
```

## Behavior

- Only changes `visual.visualType`. Bindings, filters, formatting are untouched.
- Full cache invalidate + `page:<id>`.

## Gotchas

- The new type may expect different buckets — e.g. switching from `barChart`
  (Category/Y) to `scatterChart` (Category/X/Y/Size) leaves bindings stranded.
  Re-run `pbir_update_visual_bindings` after.
- Format properties carry over even if they don't apply to the new type;
  re-audit with `pbir_audit_theme_compliance`.
