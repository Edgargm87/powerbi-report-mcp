# pbir_set_visual_sort

> Set the sort order of a visual. Overrides the auto-sort. Use `Table[Column]` for field refs.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualId | string | yes | — | |
| sort | `SortEntry[]` | yes | — | Priority order |
| isDefaultSort | boolean | no | false | true = user can override |

`SortEntry`:

| Field | Type | Default | Description |
|-------|------|:-------:|-------------|
| field | string | — | `Table[Column]` |
| type | enum `column` \| `measure` \| `aggregation` | `column` | |
| aggregation | string | — | `Sum`/`Avg`/etc when type=aggregation |
| direction | enum `Ascending` \| `Descending` | `Descending` | |

## Output

```jsonc
{ "success": true, "pageId":"...", "visualId":"...", "sortFields":["Sales[Total] Descending"], "bindingAutoCorrections":[ /* if any */ ] }
```

## Behavior

- Builds FieldRef via the shared `parseFieldSpec` path — measure home-table auto-resolution applies here too
- Sets `visual.query.sortDefinition`
- Throws (error envelope) if the visual has no `query` — sort requires data bindings

## Gotchas

- v0.9.3 audit follow-up: sort uses the same `parseFieldSpec` correction as
  bindings, so wrong-entity measures get auto-resolved here too.
