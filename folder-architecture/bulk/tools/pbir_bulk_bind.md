# pbir_bulk_bind

> Rebind multiple visuals in one call. Replaces existing bindings. Set `confirmBulk:true` when `>5`. `continueOnError:true` validates per-entry — bad bindings don't abort the batch.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| updates | `{ visualId, bindings: BucketBinding[] }[]` | yes | — | |
| autoFilters | boolean | no | true | |
| confirmBulk | boolean | no | false | Required when `>5` |
| continueOnError | boolean | no | false | Per-entry validation; bad bindings don't abort |
| strictBindings | boolean | no | env default | |

## Output

```jsonc
{
  "success": true,
  "updated": N, "ids": ["..."],
  "errors": ["..."],
  "perEntryBindingErrors": [ { "visualId":"...", "errors":[...] } ],
  "bindingAutoCorrections": [ /* if any */ ],
  "bindingValidation": { /* metadata */ }
}
```

## Behavior

- **Batch mode (default)**: pre-flights every binding via one validator pass;
  fails the whole call if strict mode finds unknowns.
- **`continueOnError`**: validates each entry separately; failures are appended
  to `errors[]` + `perEntryBindingErrors[]`; good entries still write.
- Soft gate at `>5` (BULK_CONFIRM_THRESHOLD); hard cap at 1000 (BULK_MAX_ITEMS).
- Surfaces measure home-table auto-corrections across all entries.

## In the default tool set

One of the 13 default-loaded tools.

## See also

- `visuals/tools/pbir_update_visual_bindings.md` — single-visual variant
- `../context.md` — safety gates
