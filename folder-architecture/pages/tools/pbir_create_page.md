# pbir_create_page

> Create a new page in the report. Supports standard, tooltip, and drillthrough page types.

## Inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| displayName | string | yes | — | Display name for the page |
| type | enum `standard` \| `tooltip` | no | `standard` | Tooltip pages are 320×240 overlay pages hidden from nav |
| width | number | no | 1280 (320 if tooltip) | Page width |
| height | number | no | 720 (240 if tooltip) | Page height |
| displayOption | enum `FitToPage` \| `FitToWidth` \| `ActualSize` | no | `FitToPage` (`ActualSize` if tooltip) | |
| drillthrough | `{ entity: string, property: string }` | no | — | Makes this a drillthrough page filtered by this field |

## Output

```jsonc
{
  "success": true,
  "pageId": "...",
  "displayName": "...",
  "type": "standard" | "tooltip",
  "drillthrough": false,
  "canvas": { /* getCanvasSummary() — null for tooltips */ }
}
```

## Behavior

- Mutation: yes (writes new page folder, updates `pages.json` order)
- Read-only: no
- Idempotent: no
- Side effects: invalidates `pages` + `report` cache scopes

## Validation

None pre-write. Page schema is generated server-side; drillthrough builds a
Categorical filter with `isAllFilter: true`.

## Gotchas

- The new page is appended to the end of `pageOrder` — call `pbir_reorder_pages`
  if you need it earlier in the tab strip.
- Tooltip pages auto-set `type: "Tooltip"` and `visibility: "HiddenInViewMode"`.
- The `canvas` echo on create is the canonical place to get usable area for
  subsequent `pbir_add_visual` calls.

## See also

- `knowledge/pages.md` — page-type semantics
- `knowledge/wireframes.md` — canvas constants
- `../context.md` — room-level orientation
