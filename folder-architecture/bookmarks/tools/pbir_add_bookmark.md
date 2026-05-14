# pbir_add_bookmark

> Create a new bookmark. The bookmark is created with an empty exploration state — open Power BI Desktop to capture the current view state into it.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| displayName | string | yes | Shown in the bookmarks panel |
| activePageId | string | no | Page to navigate to when activated |

## Output

```jsonc
{ "success": true, "bookmarkId":"...", "displayName":"..." }
```

## Behavior

- Mutation: yes (writes bookmark JSON + updates bookmarks.json order)
- `explorationState` is set to `{ activeSection: activePageId }` when provided, else empty
- Invalidates: `bookmarks`

## Gotchas

- Empty exploration state means the bookmark won't restore filters/selections
  until captured inside Desktop.
