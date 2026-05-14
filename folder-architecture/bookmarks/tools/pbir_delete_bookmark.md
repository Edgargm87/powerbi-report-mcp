# pbir_delete_bookmark

> Delete a bookmark by ID.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| bookmarkId | string | yes | From `pbir_list_bookmarks` |

## Output

```jsonc
{ "success": true, "bookmarkId":"...", "removed": 0 | 1 }
```

## Behavior

- `destructiveHint: true`
- Removes from `bookmarkOrder` AND deletes the bookmark folder
- Invalidates: `bookmarks`
