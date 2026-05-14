# pbir_clear_filters

> Remove ALL filters from a page or a specific visual.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| visualId | string | no | Omit to clear all page-level filters |

## Output

```jsonc
{ "success": true, "scope": "page" | "visual", "cleared": N }
```

## Behavior

- `destructiveHint: true`
- Empties `filterConfig.filters`
- Invalidates: `page:<id>`
