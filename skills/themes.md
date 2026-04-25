<!-- doc-version: 2.0 | Last updated: 2026-04-15 -->
<!-- summary: Report-level theme JSON — dataColors, background, foreground, tableAccent, structuralColors. pbir_set_report_theme / pbir_get_report_theme / pbir_diff_report_theme / pbir_audit_theme_compliance. See themes-per-visual.md for visualStyles block. -->
# Skill: Themes — Report-Level Branding & Global Styling

## When to use
Use these patterns to apply a brand-wide theme to a report — data colors, fonts, backgrounds, per-visual-type overrides — and to inspect, diff, list, or audit existing themes against the current report.

## Tool surface

| Tool | Purpose |
|---|---|
| `pbir_set_report_theme` | Write a custom theme JSON and link it from `report.json` |
| `pbir_get_report_theme` | Inspect the currently applied theme — base + custom + full JSON |
| `pbir_diff_report_theme` | Compare a proposed theme JSON against the current one — shows added/removed/changed |
| `pbir_list_report_themes` | List every theme file in `StaticResources/RegisteredResources/` |
| `pbir_remove_report_theme` | Unlink the custom theme (file is kept on disk) |
| `pbir_audit_theme_compliance` | Find visuals on a page that override theme defaults |
| `pbir_apply_theme` | Apply a built-in preset (`dark`/`light`/`corporate`/`blue-purple`) per page — see `skills/formatting.md` |

## Two layers of theming

| Layer | What it does | Tool |
|---|---|---|
| **Report theme** (JSON file) | Global defaults — data colors, fonts, backgrounds, per-visual-type overrides. Affects every visual without touching individual `visual.json` files. | `pbir_set_report_theme` |
| **Per-visual formatting** | Container/visual format overrides written into individual `visual.json` files. | `pbir_format_visual`, inline `containerFormat`/`visualFormat`, `pbir_apply_theme` |

**Always prefer `pbir_set_report_theme` for branding** — it's the canonical Power BI pattern and requires no per-visual edits. Use per-visual formatting only for exceptions on top of the theme.

---

## `pbir_set_report_theme`

Writes the theme JSON to `StaticResources/RegisteredResources/<sanitised name><timestamp>.json` and updates `report.json` (`themeCollection.customTheme` + the `RegisteredResources` package). Takes effect when the report is reopened in Power BI Desktop.

### Minimal — data colors only
```json
{
  "name": "Corporate Blue",
  "dataColors": ["#0078D4", "#00BCF2", "#FFB900", "#D83B01", "#8661C5", "#00B294"]
}
```

### Light corporate
```json
{
  "name": "Light Corporate",
  "dataColors": ["#1F3864", "#2E75B6", "#4BACC6", "#9BBB59", "#F79646", "#8064A2"],
  "background": "#FFFFFF",
  "foreground": "#252423",
  "foregroundNeutralSecondary": "#605E5C",
  "backgroundLight": "#F3F2F1",
  "backgroundNeutral": "#E1DFDD",
  "tableAccent": "#1F3864"
}
```

### Dark mode
```json
{
  "name": "Dark Mode",
  "dataColors": ["#58A6FF", "#3FB950", "#D29922", "#F85149", "#BC8CFF", "#79C0FF"],
  "background": "#0D1117",
  "foreground": "#E6EDF3",
  "foregroundNeutralSecondary": "#8B949E",
  "backgroundLight": "#161B22",
  "backgroundNeutral": "#21262D",
  "tableAccent": "#58A6FF"
}
```

### Advanced — per-visual-type overrides
```json
{
  "name": "Brand Theme",
  "dataColors": ["#0078D4", "#00BCF2"],
  "background": "#FFFFFF",
  "visualStyles": {
    "*": {
      "*": {
        "fontSize":   [{ "value": 9 }],
        "fontFamily": [{ "value": "Segoe UI" }]
      }
    },
    "columnChart": {
      "*": {
        "dataLabels": [{ "show": true }]
      }
    }
  }
}
```

`visualStyles` keys are visual types (`*` for any) → property categories (`*` for any) → arrays of property objects. Follow Power BI's published theme schema — the tool passes the object through without validating individual style entries.

### Theme JSON properties

| Property | Type | Description |
|---|---|---|
| `name` | string | Display name shown in Power BI |
| `dataColors` | string[] | Series color palette (6–12 hex values) |
| `background` | hex | Page canvas background |
| `foreground` | hex | Primary text / title color |
| `foregroundNeutralSecondary` | hex | Secondary text (axis labels, subtitles) |
| `backgroundLight` | hex | Card / panel light background variant |
| `backgroundNeutral` | hex | Neutral background variant |
| `tableAccent` | hex | Table & matrix header accent |
| `visualStyles` | object | Per-visual-type property overrides (advanced) |

---

## `pbir_get_report_theme`

Inspect what's currently applied:

```json
{}
```

Returns:
```json
{
  "baseTheme": "CY26SU02",
  "customTheme": "Corporate_Brand1712345678901.json",
  "customThemeContent": { "name": "...", "dataColors": [...], ... }
}
```

`baseTheme` is the built-in PBI base; `customTheme` is the filename of the custom theme (or `null`); `customThemeContent` is the full parsed JSON of the applied custom theme (or `null` when none).

---

## `pbir_diff_report_theme`

Preview what would change before applying. Returns four buckets — added, removed, changed, unchanged.

```json
{
  "theme": {
    "name": "Corporate Brand v2",
    "dataColors": ["#0078D4", "#00BCF2", "#FFB900"],
    "background": "#F8F9FA",
    "foreground": "#1A1A1A"
  }
}
```

Returns:
```json
{
  "currentTheme": "Corporate_Brand1712345678901.json",
  "summary": { "added": 1, "removed": 0, "changed": 2, "unchanged": 1 },
  "added":   { "background": "#F8F9FA" },
  "removed": [],
  "changed": {
    "dataColors": { "from": [...], "to": [...] },
    "foreground": { "from": "#252423", "to": "#1A1A1A" }
  }
}
```

Use this before a destructive `pbir_set_report_theme` to confirm the delta — especially handy when you're rebuilding a brand JSON and want to confirm only the bits you changed are in flight.

---

## `pbir_list_report_themes`

```json
{}
```

Returns every `.json` file in `StaticResources/RegisteredResources/` with its filename, declared `name`, and top-level keys. Use this to find the right `customTheme.name` if you want to manually edit `report.json`, or to confirm a theme file actually exists before `pbir_remove_report_theme`.

---

## `pbir_remove_report_theme`

```json
{}
```

Removes `themeCollection.customTheme` and the `CustomTheme` entry from `resourcePackages` — reverts the report to the base theme. The `.json` file stays in `StaticResources` so you can re-apply it later by writing the same theme via `pbir_set_report_theme`.

---

## `pbir_audit_theme_compliance`

Find visuals that override theme defaults via per-visual formatting. Useful after applying a new theme to spot stale overrides that are masking the new brand.

```json
{ "pageId": "<id>", "verbose": false }
```

Returns:
```json
{
  "pageId": "<id>",
  "totalVisuals": 12,
  "compliantVisuals": 8,
  "overrideVisuals": 4,
  "summary": [
    { "visualId": "...", "type": "columnChart", "title": "Sales by Month",
      "overrides": ["dataPoint", "background"] }
  ]
}
```

Detection rules:
- Scans `visual.visual.objects` and `visual.visual.visualContainerObjects` for any category set
- Ignored as expected (not overrides): `objects.data`, `objects.selection`, `objects.general`, `visualContainerObjects.title`
- Anything else counts as a per-visual override

`verbose: true` returns the full per-category list under `details` instead of the slim `summary`. Use it when you want to know exactly which categories are overridden so you can clear them with `pbir_format_visual` or by deleting the per-visual property.

---

## How themes are stored in PBIR

```
{Name}.Report/
├── StaticResources/
│   └── RegisteredResources/
│       └── Corporate_Brand1712345678901.json   ← theme JSON
└── definition/
    └── report.json                              ← references the file
```

`report.json` additions:
```json
{
  "themeCollection": {
    "baseTheme":   { "name": "CY26SU02", "type": "SharedResources" },
    "customTheme": {
      "name": "Corporate_Brand1712345678901.json",
      "type": "RegisteredResources",
      "reportVersionAtImport": { "visual": "2.7.0", "report": "3.2.0", "page": "2.3.0" }
    }
  },
  "resourcePackages": [
    {
      "name": "RegisteredResources",
      "type": "RegisteredResources",
      "items": [
        { "name": "Corporate_Brand1712345678901.json",
          "path": "Corporate_Brand1712345678901.json",
          "type": "CustomTheme" }
      ]
    }
  ]
}
```

---

## `pbir_set_report_theme` vs `pbir_apply_theme`

|  | `pbir_set_report_theme` | `pbir_apply_theme` |
|---|---|---|
| How it works | Writes a JSON theme file; PBI reads it globally | Edits per-visual `containerFormat` entries |
| Scope | Whole report, every page | One page at a time |
| Reversible | `pbir_remove_report_theme` | Must reformat each visual manually |
| PBI canonical pattern | ✅ Yes | ⚠️ Override layer only |
| Use for | Brand colors, fonts, global style | Page-specific tweaks on top of the theme |

**Recommended workflow:** `pbir_set_report_theme` for brand → `pbir_apply_theme` per page for stylized cards → inline `containerFormat` for one-off exceptions.

---

## Workflow: brand a report from scratch

1. `pbir_set_report_theme` with brand colors, background, foreground
2. `pbir_audit_theme_compliance` per page — find existing overrides that would mask the theme
3. `pbir_format_visual target=container` to clear any stale overrides on visuals you want to inherit the theme
4. `pbir_reload_report` to see it in Power BI Desktop
5. Use `pbir_apply_theme` or inline `containerFormat` only for genuine exceptions

## Workflow: refresh an existing brand

1. `pbir_get_report_theme` — read the current JSON
2. Edit it locally
3. `pbir_diff_report_theme` with the proposed new JSON — sanity-check the delta
4. `pbir_set_report_theme` — write the new file
5. `pbir_audit_theme_compliance` — confirm no surprise overrides remain

---

## Common brand color palettes

### Microsoft / Azure
```json
["#0078D4", "#00BCF2", "#FFB900", "#D83B01", "#8661C5", "#00B294", "#004E8C", "#107C10"]
```

### GitHub Dark
```json
["#58A6FF", "#3FB950", "#D29922", "#F85149", "#BC8CFF", "#79C0FF", "#56D364", "#E3B341"]
```

### Corporate Teal
```json
["#006D75", "#00A3A3", "#4DC9C9", "#B5E8E8", "#FF7A45", "#FFA940", "#52C41A", "#1890FF"]
```

### Pastel
```json
["#6FA8DC", "#93C47D", "#F6D28B", "#F4A261", "#E8A2B8", "#B4A7D6", "#76C7C0", "#C9E4A7"]
```
