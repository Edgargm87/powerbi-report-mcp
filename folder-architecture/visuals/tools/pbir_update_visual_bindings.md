# pbir_update_visual_bindings

> Update the data bindings of an existing visual. Replaces the query state entirely. Supports `Table[Column]` shorthand: `{ "field": "Sales[Net Price]", "type": "measure" }` as an alternative to separate `entity`/`property`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | yes | — | |
| visualId | string | yes | — | |
| bindings | `BucketBinding[]` | yes | — | New bindings (replaces existing). Accepts JSON-stringified array. |
| autoFilters | boolean | no | true | Auto-add categorical filters for bound categorical columns |
| strictBindings | boolean | no | env default | true=fail on unknown field, false=warn |

`BucketBinding` and `FieldSpec` shapes — see `pbir_add_visual.md`.

## Output

```jsonc
{
  "success": true,
  "visualId": "...",
  "bindingAutoCorrections": [ /* if any */ ],
  "bindingValidation": { /* metadata */ }
}
```

## Validation

Same binding validator as `pbir_add_visual` — inventory lookup against the
sibling `.SemanticModel/`, strict-vs-warn driven by param + env.

## Behavior

- Replaces the visual's `queryState` entirely (NOT a merge)
- Surfaces measure home-table auto-corrections
- Full cache invalidate + `page:<id>`

## Gotchas

- "Replaces entirely" — passing a partial set wipes the omitted buckets.
- For multi-visual rebinds, prefer `bulk/pbir_bulk_bind`.

## See also

- `bulk/tools/pbir_bulk_bind.md`
- `../context.md`
