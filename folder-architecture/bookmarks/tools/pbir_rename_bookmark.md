# pbir_rename_bookmark

> Rename an existing bookmark.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| bookmarkId | string | yes | |
| displayName | string | yes | |

## Output

```jsonc
{ "success": true, "bookmarkId":"...", "displayName":"..." }
```

## Behavior

- Mutation: yes
- Invalidates: `bookmarks`
