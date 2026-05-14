# pbir_bulk_delete_visuals

> Delete multiple visuals from a page. Set `confirmBulk:true` when `>5`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualIds | string[] | yes | — | Accepts JSON-stringified array |
| confirmBulk | boolean | no | false | Required when `>5` |

## Output

```jsonc
{ "success": true, "deleted": N, "ids": ["..."], "errors": ["visualId: msg"] }
```

## Behavior

- `destructiveHint: true`
- Soft gate `>5`, hard cap 1000
- Per-id try/catch — failures are reported, batch continues
- Full cache invalidate + `page:<id>`

## See also

- `visuals/tools/pbir_delete_visual.md` — single
- `../context.md` — safety gates
