# pbir_format_visual

> Format visual properties. Auto-routes `title`/`background`/`border`/`padding`/`dropShadow`/`visualHeader` to container, others to visual; override with `target='visual'|'container'`. Call `pbir_lookup_theme_property` for valid category/property names. Gotchas: slicer uses `textSize`, not `fontSize` (items/header); waterfall uses `sentimentColors`, not `dataPoint`.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visualId | string | yes | — | |
| formatting | `FormatCategory[]` | yes | — | Accepts JSON-stringified array |
| target | enum `visual` \| `container` \| `auto` | no | `auto` | Routing |

`FormatCategory`:

```jsonc
{
  "category": "labels",           // or "title", "background", "axes", ...
  "properties": { "fontSize": 12, "fontFamily": "Segoe UI" }
}
```

## Output

```jsonc
{ "success": true, "pageId":"...", "visualId":"...", "formatted": ["title","labels"] }
```

## Validation

Typo catcher (Levenshtein over bundled schema) runs first. Returns
`error: "format_typo"` with `issues: [{ cat, prop?, didYouMean }]` BEFORE write
when a category or property is misspelled.

## Behavior

- `auto` splits CONTAINER_CATEGORIES (`title`, `subTitle`, `background`,
  `border`, `padding`, `dropShadow`, `visualHeader`, `visualHeaderTooltip`)
  from the rest
- Mutates `visualContainerObjects` and/or `objects` per category
- Invalidates: `page:<id>`

## What's NOT replicable in markdown

- The typo catcher needs the live 1.2 MB schema.
- The PBIR literal-expression construction (`{ expr: { Literal: { Value: ... }}}`,
  string quoting for hex colors, `${val}D` for numbers) is non-trivial code.

## See also

- `themes/tools/pbir_lookup_theme_property.md`
- `knowledge/formatting.md`
- `bulk/tools/pbir_bulk_update_format.md` for fan-out
