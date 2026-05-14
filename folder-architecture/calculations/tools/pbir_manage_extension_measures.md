# pbir_manage_extension_measures

> Manage extension measures (report-level DAX in `reportExtensions.json`). Empty file crashes PBI Desktop — tool auto-deletes when empty.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| operation | enum `list` \| `add` \| `remove` | yes | — | |
| tableName | string | no | `_Measures` | Home table |
| measureName | string | add/remove | — | |
| expression | string | add | — | DAX |
| dataType | string | no | `Text` | `Text/Double/Int64/Boolean/DateTime` |

## Output

```jsonc
// list
{ "success": true, "measures": [ { "table":"_Measures","name":"...","expression":"...","dataType":"Text" } ], "count": N }
// add
{ "success": true, "operation":"add", "table":"_Measures", "measure":"..." }
// remove
{ "success": true, "operation":"remove", "measure":"...", "removed": true }
```

## Behavior

- `destructiveHint: true` (remove path can drop the file)
- `add` upserts — same `(tableName, measureName)` replaces the previous
- `remove` prunes empty entities; auto-deletes `reportExtensions.json` when entities is empty

## Gotchas

- Empty `reportExtensions.json` crashes PBI Desktop on open. The auto-delete-when-empty
  behavior is the safety belt.
- Creates the file with the canonical PBIR schema URL when first measure is added.
