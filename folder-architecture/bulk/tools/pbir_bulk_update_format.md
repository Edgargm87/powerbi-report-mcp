# pbir_bulk_update_format

> Apply the same formatting to multiple visuals. `target='container'` (title/background/border) or `'visual'` (axes/legend/labels). Set `confirmBulk:true` when `>5`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualIds | string[] | yes | — | Accepts JSON-stringified array |
| formatting | `FormatCategory[]` | yes | — | |
| target | enum `visual` \| `container` | no | `visual` | |
| confirmBulk | boolean | no | false | Required when `>5` |

## Output

```jsonc
{ "success": true, "updated": N, "ids": ["..."], "errors": ["visualId: msg"] }
```

## Behavior

- Soft gate `>5`, hard cap 1000
- Per-id try/catch; batch continues on errors
- Invalidates: `page:<id>`

## Gotchas

- No `target:'auto'` here (unlike `pbir_format_visual`). Pick container vs
  visual deliberately. Mixing categories in one call routes them all to the
  same target — split into two calls if you need both.
