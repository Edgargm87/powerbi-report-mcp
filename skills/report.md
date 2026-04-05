# Skill: Report — Connection, Settings & Structure

## Report-Level Tools

| Tool | Purpose |
|---|---|
| `set_report` | Connect to a .Report folder or .pbip project |
| `get_report` | Show the currently connected report path |
| `get_report_settings` | Get report.json (theme config, settings) |
| `update_report_settings` | Merge key-value pairs into report.settings |
| `reload_report` | Reload the report in Power BI Desktop |

---

## set_report

```json
{ "path": "C:/Projects/MyReport.Report" }
```

Also accepts the parent `.pbip` folder:
```json
{ "path": "C:/Projects/MyProject" }
```

Auto-discovers the `.Report` subfolder. Call this at the start of every session, or to switch between reports.

---

## get_report

```json
{}
```

Returns: `{ "reportPath": "C:/Projects/MyReport.Report" }`

---

## get_report_settings

```json
{}
```

Returns the full `report.json` content — includes `themeCollection`, `resourcePackages`, and `settings`.

---

## update_report_settings

```json
{
  "settings": {
    "useStylableVisualContainerHeader": true,
    "exportDataMode": 1
  }
}
```

Merges into `report.json → settings`. Does not overwrite keys not specified.

Common settings:
- `useStylableVisualContainerHeader`: `true` — enables styled visual headers
- `exportDataMode`: `1` = summarized data, `2` = underlying data
- `isPrintAllPages`: `true` — print all pages by default

---

## reload_report

```json
{}
```

Kills Power BI Desktop and reopens the `.pbip` file. Use after making changes to see them reflected. Requires a `.pbip` file next to the `.Report` folder.

---

## PBIR Folder Structure

```
{Name}.Report/
├── definition/
│   ├── report.json          ← theme, settings, resourcePackages
│   ├── version.json         ← format version
│   ├── pages/
│   │   ├── pages.json       ← page order, active page
│   │   └── {pageId}/
│   │       ├── page.json    ← display name, size, visibility, filters
│   │       └── visuals/
│   │           └── {visualId}/
│   │               └── visual.json  ← type, position, bindings, formatting, filters
│   └── bookmarks/
│       ├── bookmarks.json   ← bookmark order
│       └── {bookmarkId}/
│           └── bookmark.json
├── definition.pbir          ← semantic model reference
└── StaticResources/
    └── RegisteredResources/ ← custom theme JSON files
```

---

## Common Workflows

### Start a new session
```
1. set_report: path=<report path>
2. list_pages → get page IDs
3. list_visuals: pageId=<first page> → get visual IDs
```

### Check what theme is applied
```
1. get_report_settings → check themeCollection.customTheme
   OR
2. get_report_theme → returns base + custom theme with full JSON
```

### Build a report from scratch
```
1. set_report: connect to empty .Report
2. create_page: "Overview" (1280×720)
3. add_visual: header shape/textbox
4. add_visual: KPI cards, charts
5. set_report_theme: apply brand colors
6. reload_report: open in Desktop to review
```

### Export / inspect report state
```
1. get_report → confirm connected
2. list_pages → see all pages
3. For each page: list_visuals → see all visual IDs and types
4. get_visual: inspect specific visual's bindings and formatting
```

---

## report.json key sections

```json
{
  "$schema": "...",
  "settings": { ... },
  "themeCollection": {
    "baseTheme": { "name": "CY24SU10" },
    "customTheme": {
      "name": "MyTheme1234567890.json",
      "type": "RegisteredResources"
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

---

## version.json

The MCP manages this automatically. Current schema version: `{ "version": "4.0" }`.

---

## Related skills
- `skills/pages.md` — page management, bookmarks
- `skills/visuals.md` — adding and configuring visuals
- `skills/themes.md` — applying and managing themes
- `skills/filters.md` — page and visual filters
- `skills/formatting.md` — formatting visuals
