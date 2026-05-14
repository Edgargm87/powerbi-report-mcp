# pbir_auto_layout

> Auto-arrange all visuals on a page in a grid.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | yes | — | The page ID |
| columns | number | no | 3 | |
| padding | number | no | 10 | |
| marginTop | number | no | 10 | |
| marginLeft | number | no | 10 | |

## Output

```jsonc
{ "success": true, "layout": { "columns": 3, "rows": N, "cellWidth": W, "cellHeight": H, "visualCount": N } }
```

## Behavior

- Reflows EVERY visual on the page into a `columns × rows` grid
- Mutates `position.{x,y,width,height,z,tabOrder}` for each visual
- Z-orders are re-numbered in placement order (`i * 1000`)
- Invalidates: `page:<id>`, `pages`

## Gotchas

- Defaults do NOT match the canonical wireframe geometry. For deliberate
  layouts, prefer `layout/pbir_layout_grid` with default margins/gaps and
  declared cells.
- No-op when the page has zero visuals.
