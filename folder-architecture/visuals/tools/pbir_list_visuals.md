# pbir_list_visuals

> List visuals on a page (paginated). Default slim returns id/type/x/y/w/h/title. `slim:false` includes filterCount. Use `limit`/`offset` to page through large pages. Use `visualType` to filter for cross-page sweeps.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| slim | boolean | no | true | |
| visualType | string | no | — | Case-sensitive filter. Applied BEFORE pagination — `total` is filtered count |
| limit | number (1-500) | no | 100 | |
| offset | number | no | 0 | |

## Output

```jsonc
{
  "visuals": [{ "id":"...","type":"barChart","x":0,"y":0,"w":280,"h":280,"title":"..." }],
  "total": 5, "total_count": 5,
  "truncated": false, "has_more": false,
  "nextOffset": null, "next_offset": null
}
```

## Behavior

- `readOnlyHint: true`
- Cached on `page:<id>`
- Slim mode uses `type`, verbose uses `visualType` — both checked when filtering
