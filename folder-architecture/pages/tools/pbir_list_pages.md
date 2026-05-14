# pbir_list_pages

> List pages (paginated). Slim default returns id/displayName/width/height/visualCount/isActive/hidden; slim:false adds displayOption. includeVisuals:true (or pageId) embeds per-visual summaries. Top-level `totalVisualCount` sums the FULL set, not just the visible slice. For cross-page sweeps prefer one `includeVisuals:true` call over fanning out per-page `pbir_list_visuals`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| slim | boolean | no | true | Slim mode omits displayOption |
| includeVisuals | boolean | no | false | Embed per-visual entries on each page |
| pageId | string | no | — | Scope to a single page (implies includeVisuals; limit/offset ignored) |
| limit | number (1-500) | no | 100 | Max pages to return |
| offset | number | no | 0 | Pagination offset |

## Output

```jsonc
{
  "pages": [{
    "id": "...", "displayName": "...", "width": 1280, "height": 720,
    "visualCount": 5, "isActive": true, "hidden": false
  }],
  "total": 1, "total_count": 1,
  "totalVisualCount": 5,
  "truncated": false, "has_more": false,
  "nextOffset": null, "next_offset": null,
  "canvas": { /* canvas summary */ }
}
```

## Behavior

- Read-only: yes
- Cached via `cachedRead` on scopes `["report"]` + `["pages"]` (or `["page:<id>"]`)

## Gotchas

- `totalVisualCount` is global, not per-slice. Use it to decide whether to
  page through.
- `pageId` mode returns the single page regardless of limit/offset.
- Canonical aliases ship alongside legacy names (`has_more`/`next_offset`/`total_count`).

## See also

- `visuals/tools/pbir_list_visuals.md` for per-page detail
- `../context.md`
