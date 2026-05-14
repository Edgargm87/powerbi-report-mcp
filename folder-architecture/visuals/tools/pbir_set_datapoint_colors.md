# pbir_set_datapoint_colors

> Set data point colors. Series-based charts use metadata mode. Category-based (no Series) requires `categoryEntity`+`categoryProperty`.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | yes | |
| colors | `{ seriesName?: string, color: hex }[]` | yes | Accepts JSON-stringified array |
| categoryEntity | string | conditionally | Required for category-based charts |
| categoryProperty | string | conditionally | Required for category-based charts |
| defaultTransparency | number | no | |

## Output

```jsonc
{ "success": true, "pageId":"...", "visualId":"...", "colorCount": N }
```

## Behavior

- Mutation: writes `objects.dataPoint[]` entries
- Invalidates: `page:<id>`

## Gotchas

- Series mode (with `seriesName`) uses metadata selector — works for series-based charts.
- Category mode requires `(categoryEntity, categoryProperty)` to build the
  data-view selector; missing them on a category chart silently no-ops in PBI.
- Waterfall uses `sentimentColors` instead of `dataPoint` — use `pbir_format_visual`
  there.
