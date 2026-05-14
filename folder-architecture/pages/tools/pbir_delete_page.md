# pbir_delete_page

> Delete a page and all its visuals.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | The page ID to delete |

## Output

```jsonc
{ "success": true, "deletedPageId": "..." }
```

## Behavior

- Mutation: yes (destructive)
- `destructiveHint: true`
- Side effects: removes from `pageOrder`, deletes page folder, falls active
  page back to first remaining if active was deleted. Invalidates entire cache.

## Gotchas

- No undo. Pair with `pbir_get_visual` / `pbir_list_visuals` first if you may
  need to recreate.

## See also

- `pbir_duplicate_page` for a safer "I'll redo this" flow
- `../context.md`
