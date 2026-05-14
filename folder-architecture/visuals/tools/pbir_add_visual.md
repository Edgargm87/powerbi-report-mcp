# pbir_add_visual

> Add visuals to a page via `visuals: [...]` batch. Inline `containerFormat` / `visualFormat` / `dataColors` per entry avoids extra `pbir_format_visual` calls. Stacked charts need a Series binding; 'KPI card' = `card` with one measure; scatter uses `Category` bucket. Use `pbir_lookup_theme_property` for valid category/property names.

This is the most complex tool in the MCP — the per-visual `VisualSpecSchema`
has ~30 fields covering data charts, slicers, shapes, text boxes, images, and
action buttons.

## Top-level inputs

| Param | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| pageId | string | no (auto-resolved) | — | |
| visuals | VisualSpec[] | yes | — | Batch of visuals to create |
| strictBindings | boolean | no | env default | `true`=strict (unknown fields fail), `false`=warn |
| strictLayout | boolean | no | env default | `true`=strict, `false`=warn. Canvas 1280×720, 15px L/R / 6px bottom margins, 5px gaps |
| includeTypes | boolean | no | false | Return `[{visualId,visualType}]` instead of flat id list |

## VisualSpec (per entry in `visuals[]`)

**Core geometry / type:**

| Field | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| visualType | string | yes | — | e.g. `barChart`, `card`, `slicer`, `tableEx`, `shape`, `textbox`, `image`, `actionButton` |
| x | number | no | 0 | X position |
| y | number | no | 0 | Y position |
| width | number | no | 280 | |
| height | number | no | 280 | |
| title | string | no | — | Auto-fills container title |

**Data bindings:**

| Field | Type | Description |
|-------|------|-------------|
| bindings | `BucketBinding[]` | See sub-table below |
| autoFilters | boolean (default true) | Auto-add categorical filters for bound categorical columns |

**BucketBinding shape:**

| Field | Type | Description |
|-------|------|-------------|
| bucket | string | Data role bucket: `Category` / `Y` / `Series` / `Values` / `Rows` / `Columns` etc per visualType |
| fields | `FieldSpec[]` | Fields to bind to the bucket |

**FieldSpec shape:**

| Field | Type | Description |
|-------|------|-------------|
| field | string | Shorthand `Table[Column]` or `Table[Measure]` (e.g. `Sales[Net Price]`) |
| entity | string | Table name (alternative to `field`) |
| property | string | Column or measure name (alternative to `field`) |
| type | enum `column` \| `measure` \| `aggregation` | required |
| aggregation | string | `Sum` / `Avg` / `Count` / `Min` / `Max` / `CountNonNull` / `Median` / `StandardDeviation` / `Variance` — for `type:aggregation` |

**Slicer-specific:**

| Field | Type | Description |
|-------|------|-------------|
| slicerMode | enum `Basic` \| `Dropdown` | Visual mode for slicer |
| multiSelect | boolean | true=checkbox, false=single-select |

**Shape / line-specific:**

| Field | Type | Description |
|-------|------|-------------|
| shapeType | enum `rectangle` \| `rectangleRounded` \| `line` \| `tabCutCorner` \| `tabCutTopCorners` \| `tabRoundCorner` \| `tabRoundTopCorners` | |
| shapeRotation | number (default 0) | Degrees |
| fillColor | string | Hex (default `#D9D9D9`) |

**Text (shape or textbox):**

| Field | Type | Description |
|-------|------|-------------|
| textContent | string | The text |
| textColor | string | Hex |
| textAlign | enum `left` \| `center` \| `right` | Horizontal alignment |
| textVAlign | enum `top` \| `middle` \| `bottom` | Vertical (shape only) |
| textFont | string | Friendly name (`Segoe UI Bold`, `Arial`, `DIN`...) auto-mapped to PBI font stack; unknown values used verbatim |
| textSize | number | pt |
| textBold | boolean | |
| textItalic | boolean | shape only |
| textUnderline | boolean | shape only |
| textPadding | number | px on all 4 sides of shape text |

**Image:**

| Field | Type | Description |
|-------|------|-------------|
| imageUrl | string | |
| imageScaling | enum `fit` \| `fill` \| `normal` | Default `fit` |

**Action button:**

| Field | Type | Description |
|-------|------|-------------|
| buttonText | string | Label |
| buttonAction | enum `pageNavigation` \| `URL` \| `bookmark` \| `back` | |
| buttonActionTarget | string | pageId / URL / bookmarkId per action |

**Inline formatting (avoids follow-up `pbir_format_visual` calls):**

| Field | Type | Description |
|-------|------|-------------|
| containerFormat | `FormatCategory[]` | `title`/`background`/`border`/`padding`/`dropShadow`/`visualHeader` |
| visualFormat | `FormatCategory[]` | `axes`/`legend`/`labels` etc. |
| dataColors | `{ color: hex, seriesName?: string }[]` | Per-series colors |

## Output

```jsonc
{
  "success": true,
  "pageId": "...",
  "created": ["visualId1", "..."],          // or [{visualId, visualType}] if includeTypes
  "bindingAutoCorrections": [                // if any measures were home-resolved
    { "from": "Sales", "to": "_Measures", "reason": "measure home table" }
  ],
  "bindingValidation": { /* attached when validation ran */ },
  "layoutWarnings": [ /* present only when strictLayout:false and warnings exist */ ]
}
```

## Validation pipeline (in order)

1. **Format typo catcher** — Levenshtein over bundled PBI theme schema. Flags
   `'fontFmaily'` → suggests `'fontFamily'` BEFORE any binding or layout work.
   Returns `error: "format_typo"` with `issues[]`.
2. **Binding validation** — flatten every binding across the batch; check
   each `Table[Field]` against the live `.SemanticModel/` inventory. Strict
   mode fails on unknown; warn mode proceeds with warnings.
3. **Layout validation** — combine existing visuals + new specs into a single
   wireframe, run against margins/gaps/overlap/banner rules. Strict fails;
   warn returns `layoutWarnings` and proceeds.

All three validators are CODE-only — markdown cannot replicate them.

## Behavior

- Mutation: yes (creates one folder per visual)
- Idempotent: no (every call creates new IDs)
- Side effects: full cache invalidate + `page:<id>` scope invalidate
- Z-order: each new visual gets `maxExisting + (i+1) * 1000`

## Gotchas

- **Single-mode removed in v0.8.0** — must pass `visuals: [...]` even for one visual.
- **Measure home-table auto-resolution** — when a measure spec uses the wrong
  entity but exactly one other table defines it, the entity is auto-corrected
  and the change reported in `bindingAutoCorrections`. Columns are never
  auto-corrected.
- **Inline format wins** — `containerFormat` / `visualFormat` / `dataColors`
  override the report theme. Slim by default in success response.
- **Slim by default in response** — the 150-token canvas object only ships on
  layout failures, not on every success.

## See also

- `knowledge/visuals.md` — visualType selection
- `knowledge/slicers.md` — slicer mechanics
- `knowledge/shapes.md` — shape/line specifics
- `knowledge/formatting.md` — format payload format
- `knowledge/themes-per-visual.md` — which format keys per type
- `meta/tools/pbir_lookup_theme_property.md` — schema-walker for valid props
- `bulk/tools/pbir_bulk_bind.md` — rebind many visuals
- `../context.md`
