# pbir_delete_visual_calculation

> Delete a visual calculation by name.

> **Registration status:** PARKED (see `pbir_list_visual_calculations.md`).

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| visualId | string | yes | |
| name | string | yes | From `pbir_list_visual_calculations` |

## Output

```jsonc
{ "success": true, "removed": N, "remaining": M }
```

## Behavior

- Filters projections by name; replaces array in place
- Legacy `query.calculations` is deleted if present
