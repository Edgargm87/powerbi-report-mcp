# pbir_remove_filter

> Remove a specific filter by name from a page or visual.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | |
| filterName | string | yes | From `pbir_list_filters` |
| visualId | string | no | Omit for page-level |

## Output

```jsonc
{ "success": true, "scope": "page" | "visual", "removed": N }
```

## Behavior

- `destructiveHint: true`
- Filters `filterConfig.filters` by `name !== filterName`
- Invalidates: `page:<id>` (always — finally block)
