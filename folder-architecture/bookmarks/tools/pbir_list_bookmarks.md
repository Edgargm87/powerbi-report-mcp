# pbir_list_bookmarks

> List all bookmarks defined in the report.

## Inputs

No parameters.

## Output

```jsonc
{ "count": N, "bookmarks": [ { "id":"...", "displayName":"..." } ] }
```

## Behavior

- `readOnlyHint: true`
- Cached on `bookmarks` scope
- Falls back to `"(unreadable)"` displayName when a bookmark file is broken
