# pbir_duplicate_visual

> Duplicate an existing visual, optionally to a different page or position.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | yes | — | Source page ID |
| visualId | string | yes | — | Visual ID to duplicate |
| targetPageId | string | no | source | |
| offsetX | number | no | 20 | |
| offsetY | number | no | 20 | |

## Output

```jsonc
{ "success": true, "newVisualId": "...", "targetPageId": "..." }
```

## Behavior

- Deep-clones the visual; generates new `name` and regenerates every filter ID
- Increments `z` and `tabOrder` by 1000
- Invalidates cache + `page:<target>` (and `page:<source>` when cross-page)
