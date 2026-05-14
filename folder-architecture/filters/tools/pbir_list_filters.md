# pbir_list_filters

> List filters on a page or visual. Slim mode (default) returns `Table[Column]` strings.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualId | string | no | — | Omit for page-level |
| slim | boolean | no | true | |

## Output

```jsonc
{
  "scope": "page:<id>" | "visual:<id>",
  "count": N,
  "filters": [ { "name":"...", "type":"Categorical","field":"Sales[Region]" } ]
}
```

## Behavior

- `readOnlyHint: true`
- Cached on `page:<id>`
- Slim flattens FieldRef → `Table[Column]`; non-slim returns the raw FieldRef
