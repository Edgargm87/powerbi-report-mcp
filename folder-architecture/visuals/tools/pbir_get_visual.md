# pbir_get_visual

> Get visual details. Default returns id/type/position/title/bindings summary. `verbose:true` returns full PBIR JSON.

## Inputs

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| pageId | string | no (auto-resolved) | |
| visualId | string | yes | |
| verbose | boolean | no | Full raw PBIR JSON (heavy) |
| slim | boolean | no | Deprecated alias for `!verbose` |

## Output (slim)

```jsonc
{
  "id": "...", "type": "barChart",
  "x": 0, "y": 0, "w": 280, "h": 280,
  "title": "...",
  "bindings": { "Category": ["Sales[Region]"], "Y": ["Sales[Total]"] },
  "filterCount": 0,
  // slicer-only:
  "slicerMode": "Dropdown",
  "multiSelect": false
}
```

## Output (verbose)

Full PBIR `VisualDefinition` JSON.

## Behavior

- `readOnlyHint: true`
- Cached on `page:<id>` scope
- Bindings rendered as `Table[Field]` strings in slim mode
- Slicer detection inspects `objects.data[0].properties.mode` and `objects.selection[0].properties.singleSelect`; applies PBI defaults when literal is absent

## Gotchas

- `multiSelect` for `slicer` defaults to `true` when not Dropdown; for
  `listSlicer`/`textSlicer` defaults to `true` regardless.

## See also

- `pbir_list_visuals` for a page-wide overview
- `../context.md`
