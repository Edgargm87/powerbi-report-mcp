# Skill: Themes — Report-Level Branding & Global Styling

## Overview

Power BI has two layers of theming:

| Layer | What it does | Tool |
|---|---|---|
| **Report theme** (JSON file) | Global defaults — data colours, fonts, backgrounds, per-visual type overrides. Affects ALL visuals without touching individual visual.json files. | `set_report_theme` |
| **Container/visual formatting** | Per-visual overrides written into individual visual.json objects. | `apply_theme`, `format_visual`, inline `containerFormat`/`visualFormat` |

**Always prefer `set_report_theme` for branding** — it's how Power BI is designed to be themed and requires no per-visual edits.

## set_report_theme

Writes the theme JSON to `StaticResources/RegisteredResources/` and updates `report.json`.
Takes effect when the report is opened in Power BI Desktop.

### Minimal theme (data colours only)
```json
{
  "name": "Corporate Blue",
  "dataColors": ["#0078D4", "#00BCF2", "#FFB900", "#D83B01", "#8661C5", "#00B294"]
}
```

### Full light theme
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

### Full dark theme
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

### With visualStyles (advanced — per-visual-type defaults)
```json
{
  "name": "Brand Theme",
  "dataColors": ["#0078D4", "#00BCF2"],
  "background": "#FFFFFF",
  "visualStyles": {
    "*": {
      "*": {
        "fontSize": [{ "value": 9 }],
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

## Theme JSON Properties

| Property | Type | Description |
|---|---|---|
| `name` | string | Display name shown in Power BI |
| `dataColors` | string[] | Series colour palette (6–12 hex values) |
| `background` | hex | Page canvas background |
| `foreground` | hex | Primary text / title colour |
| `foregroundNeutralSecondary` | hex | Secondary text (axis labels, subtitles) |
| `backgroundLight` | hex | Card/panel light background variant |
| `backgroundNeutral` | hex | Neutral background variant |
| `tableAccent` | hex | Table & matrix header accent |
| `visualStyles` | object | Per-visual-type property overrides (advanced) |

## Inspecting the current theme

```
get_report_theme
```

Returns:
- `baseTheme` — built-in theme name (e.g. `"CY26SU02"`)
- `customTheme` — custom theme filename (or null)
- `customThemeContent` — full JSON of the applied custom theme

## Removing a custom theme

```
remove_report_theme
```

Unlinks the theme from `report.json`, reverting to the base theme. The theme file remains in `StaticResources/` and can be re-applied.

## Listing available theme files

```
list_report_themes
```

Shows all `.json` files in `StaticResources/RegisteredResources/`.

## How themes are stored in PBIR

```
{Name}.Report/
├── StaticResources/
│   └── RegisteredResources/
│       └── MyTheme1234567890.json   ← theme data
└── definition/
    └── report.json                  ← themeCollection.customTheme references the file
```

`report.json` additions:
```json
{
  "themeCollection": {
    "baseTheme": { "name": "CY26SU02", "type": "SharedResources" },
    "customTheme": {
      "name": "MyTheme1234567890.json",
      "type": "RegisteredResources",
      "reportVersionAtImport": { "visual": "2.7.0", "report": "3.2.0", "page": "2.3.0" }
    }
  },
  "resourcePackages": [
    {
      "name": "RegisteredResources",
      "type": "RegisteredResources",
      "items": [
        { "name": "MyTheme1234567890.json", "path": "MyTheme1234567890.json", "type": "CustomTheme" }
      ]
    }
  ]
}
```

## Theme vs apply_theme

| | `set_report_theme` | `apply_theme` |
|---|---|---|
| How it works | Writes a JSON theme file; Power BI reads it globally | Edits individual `visual.json` containerFormat entries |
| Scope | ALL visuals, ALL pages | One page at a time |
| Reversible | `remove_report_theme` | Must manually reformat each visual |
| Power BI "correct" way | ✅ Yes | ⚠️ Override layer only |
| Use for | Brand colours, fonts, global style | Page-specific overrides on top of theme |

**Recommended workflow:** `set_report_theme` for brand → `apply_theme` or inline `containerFormat` for page-specific tweaks.

## Workflow: Brand a report from scratch

1. `set_report_theme` with brand colours, background, foreground
2. `reload_report` to see it applied in Power BI Desktop
3. Use `apply_theme` on individual pages for border/background card styling on top
4. Use inline `containerFormat` on specific visuals for exceptions

## Common brand colour palettes

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
