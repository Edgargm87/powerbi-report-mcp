# pbir_duplicate_page

> Duplicate an entire page with all its visuals to a new page.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | yes | Source page ID |
| displayName | string | no | Defaults to `Copy of <original>` |

## Output

```jsonc
{ "success": true, "newPageId": "...", "displayName": "...", "visualCount": N }
```

## Behavior

- Deep-clones page JSON, then deep-clones every visual under it
- Regenerates `name` for the new page + every duplicated visual + every filter
  (filters get fresh IDs to avoid collisions)
- Appends new page to `pageOrder`
- Invalidates: full cache, `pages`, `page:<newPageId>`

## Gotchas

- Z-orders are NOT re-numbered — the duplicate carries the same stack.
- Bookmarks pointing at the source page are NOT rewritten.
