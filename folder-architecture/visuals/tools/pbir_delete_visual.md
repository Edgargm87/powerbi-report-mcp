# pbir_delete_visual

> Delete a visual from a page.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | yes | |

## Output

```jsonc
{ "success": true, "deletedVisualId": "..." }
```

## Behavior

- `destructiveHint: true`
- Removes the visual folder; no undo
- Full cache invalidate + `page:<id>` scope invalidate
