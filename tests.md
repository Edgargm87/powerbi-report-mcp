# Test Suite — powerbi-report-mcp

Run against the training report (`training.Report`) using Claude Sonnet 4.6 via MCP.
Date: 2026-04-05 | Version: 0.4.5

---

## Setup

- Report: `C:\Users\jonathan\OneDrive\PowerBI\PowerBI\mcp\training.Report`
- Test page created: `test-suite-renamed` (pageId: `8c02e95645e9cbd11286`)
- Page deleted at end of suite as final cleanup test

---

## Results

| #   | Tool(s)                               | Input                                                   | Result | Notes                                                          |
|-----|---------------------------------------|---------------------------------------------------------|--------|----------------------------------------------------------------|
| T01 | `set_report`                          | training.Report path                                    | PASS   |                                                                |
| T02 | `get_page_summary`                    | all pages                                               | PASS   | Returns pages+visuals in one call; replaces list_pages+N×list_visuals |
| T03 | `create_page`                         | displayName="Test Suite"                                | PASS   |                                                                |
| T04 | `rename_page`                         | "test-suite-renamed"                                    | PASS   |                                                                |
| T05 | `add_visual` (batch)                  | shape, card×2, clusteredColumnChart, slicer, tableEx    | PASS   | Batch mode creates 6 visuals in 1 call                         |
| T06 | `get_visual` slim                     | card visual                                             | PASS   | ~50 tokens vs ~700 for full JSON                               |
| T07 | `get_visual` full                     | card visual                                             | PASS   | Full PBIR JSON returned                                        |
| T08 | `set_visual_title`                    | card visual                                             | PASS   |                                                                |
| T09 | `format_visual`                       | clusteredColumnChart axes/labels                        | PASS   | `z.preprocess` fix required for formatting array               |
| T10 | `update_visual_bindings`              | tableEx — Country + Sales                               | PASS   | `z.preprocess` fix required for bindings array                 |
| T11 | `move_visual`                         | reposition card                                         | PASS   |                                                                |
| T12 | `set_page_visibility`                 | hidden=true                                             | PASS   | `z.coerce.boolean()` fix required (B01)                        |
| T13 | `list_visuals`                        | slim mode                                               | PASS   |                                                                |
| T14 | `duplicate_visual`                    | card visual                                             | PASS   |                                                                |
| T15 | `bulk_update_format`                  | 2 cards — background #1E1E2E                            | PASS   | Both updated in 1 call                                         |
| T16 | `bulk_bind`                           | swap measure bindings on 2 cards                        | PASS   | Both rebound in 1 call                                         |
| T17 | `bulk_delete_visuals`                 | 2 throwaway cards                                       | PASS   | Both deleted in 1 call                                         |
| T18 | `add_visual` image                    | imageUrl + imageScaling=fit                             | PASS   | `objects.general` with imageUrl/scaling, `howCreated: InsertVisualButton` |
| T19 | `add_visual` actionButton             | buttonText="Go Back", buttonAction=back                 | PASS   | `objects.text` + `objects.action`, `howCreated: InsertVisualButton` |
| T20 | `add_visual_calculation`              | RUNNINGSUM([Sales]) on tableEx                          | PASS   |                                                                |
| T21 | `list_visual_calculations`            | tableEx                                                 | PASS   | Returns name, displayName, expression                          |
| T22 | `delete_visual_calculation`           | remove running total                                    | PASS   | remaining=0 confirmed                                          |
| T23 | `apply_theme`                         | dark theme on page                                      | PASS   | 5 visuals formatted; image/actionButton skipped (non-data)     |
| T24 | `add_page_filter` + `list_filters` + `remove_filter` | categorical (Country), topN (Product by Sales) | PASS | slim list returns `Geography[Country]`, `Products[Product]` |
| T25 | `add_bookmark` + `list_bookmarks` + `delete_bookmark` | "Test Bookmark"                            | PASS   |                                                                |
| T26 | `delete_page`                         | delete test page                                        | PASS   | Page + all visuals removed                                     |

**Total: 26/26 PASS**

---

## Bugs Found and Fixed

| ID  | Tool                  | Symptom                                            | Fix                                        |
|-----|-----------------------|----------------------------------------------------|--------------------------------------------|
| B01 | `set_page_visibility` | `hidden` boolean rejected when sent as string      | `z.coerce.boolean()` on `hidden` param     |
| B02 | Array params (multiple tools) | Array params rejected when MCP serialises as JSON string | `z.preprocess` wrapper on all required array params |
| B03 | `list_filters` slim   | Aggregation FieldRef returned raw JSON instead of `Table[Field]` | Added Aggregation branch to `fieldRefToString` |

---

## Token Usage Estimates

Measured by approximate output token counts per call. Input tokens vary by prompt.

| Operation                         | Approach                        | Est. Output Tokens |
|-----------------------------------|---------------------------------|--------------------|
| Session start (pages + visuals)   | `get_page_summary` (1 call)     | ~300               |
| Session start (old)               | `list_pages` + N×`list_visuals` | ~600–1200          |
| `get_visual` slim                 | slim=true (default)             | ~50                |
| `get_visual` full                 | slim=false                      | ~600–800           |
| `list_filters` slim               | slim=true (default)             | ~80                |
| `list_filters` full               | slim=false                      | ~300+              |
| `bulk_update_format` (N visuals)  | 1 call                          | ~60                |
| N × `format_visual`               | N calls                         | ~60×N              |
| `bulk_bind` (N visuals)           | 1 call                          | ~60                |
| `apply_theme` (page)              | 1 call                          | ~80                |
| N × `format_visual` (theme equiv) | N calls                         | ~60×N              |
| `add_visual` batch (6 visuals)    | 1 call                          | ~200               |
| 6 × `add_visual`                  | 6 calls                         | ~360               |

### MCP Schema overhead (one-time per session)
~11,200 tokens to load all tool schemas at session start.

---

---

## UAT Round 1 — Visual Inspection Tests

Run against `Training` and `Training 2` pages with real `financials` data.
Date: 2026-04-05 | Pages preserved for visual inspection in Power BI Desktop.

### Pages Under Test
| Page | ID | Wireframe | Visuals |
|------|----|-----------|---------|
| Training | `11b1f35a6bd0ddba217b` | Layout 2 — Classic Dashboard | 10 (header + 4 cards + 5 charts) |
| Training 2 | `6c5a8d5bf5197ec214ad` | Layout 8 — KPI Banner + Body | 11 (header + 5 cards + 5 charts) |
| train | `f43991a29338abe4ddb8` | — (empty, used for slicer test) | 3 slicers |

### Results

| #   | Tool(s)                          | Input / Target                                              | Result | Notes |
|-----|----------------------------------|-------------------------------------------------------------|--------|-------|
| U01 | `get_page_summary`               | All pages                                                   | PASS   | Confirmed 3 pages, Training=10, Training 2=11 visuals |
| U02 | `apply_theme`                    | `corporate` on Training page (9 visuals)                    | PASS   | 9 visuals formatted in 1 call |
| U03 | `bulk_update_format` ×2          | Card backgrounds (#F7F9FC) + border (#1F3864) on both pages | PASS   | 4 cards on Training, 5 on Training 2 — 2 calls total |
| U04 | `format_visual`                  | Data labels + axis fontSize on clusteredColumnChart         | PASS   | categoryAxis, valueAxis, labels all applied |
| U05 | `set_datapoint_colors` ×2        | 6-colour palette on pieChart + donutChart                   | PASS   | Both charts coloured in parallel |
| U06 | `set_conditional_format`         | Gradient red→green on tableEx Profit column                 | PASS   | Required `formatType: "gradient"` not `"colorScale"` — see schema note below |
| U07 | `change_visual_type`             | `barChart` → `columnChart` on Training page                 | PASS   | Bindings preserved; required `visualType` param (not `newVisualType`) — see schema note |
| U08 | `add_visual` (slicers)           | Segment, Country, Year dropdowns on `train` page            | PASS   | 3 slicers created in 1 batch call |
| U09 | `add_page_filter`                | Categorical Year=2014 on Training 2                         | PASS   | Page-level filter applied |
| U10 | `format_visual`                  | lineStyles strokeWidth + axes + labels on line chart        | PASS   | All 4 categories formatted |
| U11 | `set_visual_title` ×3            | "Total Sales $", "Net Profit $", "Total Sales $ (2014)"     | PASS   | All 3 updated in parallel |
| U12 | `duplicate_visual`               | Clone `Sales by Country` chart → Training 2 page            | PASS   | New visual `556cccc96dd18dde7b8f` created on target page |

**UAT Total: 12/12 PASS**

### Schema Knowledge Notes (not bugs — correct usage)

| # | Tool | Wrong usage | Correct usage |
|---|------|-------------|---------------|
| S01 | `set_conditional_format` | `formatType: "colorScale"` | `formatType: "gradient"` — valid values: `rules`, `gradient`, `clear` |
| S02 | `change_visual_type` | `newVisualType: "..."` | `visualType: "..."` — param name matches `add_visual` |

### UAT Observations
- `apply_theme` + `bulk_update_format` together give a fully styled page in 2 calls — highly efficient
- `duplicate_visual` with `targetPageId` cross-page copy works correctly; visual lands at same coordinates as original
- Slicers created with `slicerMode: "Dropdown"` render as compact dropdown — preferred for space-constrained layouts
- `add_page_filter` categorical accepts string values even for integer Year column — Power BI coerces correctly
- `change_visual_type` preserves bindings — `barChart` → `columnChart` kept Segment/Sales binding intact
- `set_conditional_format` gradient applied to table background cells — red (low profit) → green (high profit) visible per row

---

## UAT Round 2 — Bug Fix Verification & Extended Visual Types

Date: 2026-04-05 | Pages preserved for visual inspection in Power BI Desktop.

### Pages Under Test
| Page | ID | Contents |
|------|----|----------|
| UAT-2A | `277f56a6d0e8145806a7` | Hero Layout — combo chart, kpi, scatter, 3 slicers, 2 page filters |
| UAT-2B | `7a845edfdc9bfd830bcc` | auto_layout test — 6 visuals added at x:0 y:0, then auto-arranged |

### Results

| #   | Tool(s)                    | Input / Target                                                   | Result | Notes |
|-----|----------------------------|------------------------------------------------------------------|--------|-------|
| U13 | `create_page` ×2           | UAT-2A, UAT-2B                                                   | PASS   | Both pages created in parallel |
| U14 | `add_visual` (batch, 8)    | Hero layout: shape, comboChart, kpi, card, scatter, 3 slicers    | PASS   | `lineClusteredColumnComboChart` with ColumnY/LineY buckets — correct naming |
| U15 | `add_visual` (batch, 6)    | UAT-2B: 6 overlapping visuals at x:0 y:0                         | PASS   | Deliberate overlap for auto_layout test |
| U16 | `auto_layout`              | UAT-2B — 6 visuals arranged into 3×2 grid                        | PASS   | 3 cols × 2 rows, cellWidth=413, cellHeight=345 |
| U17 | `add_page_filter`          | **B04 retest** — Categorical Year=2014 on UAT-2A                 | PASS   | `From`/`Where`/`In` format confirmed in page.json — no schema error |
| U18 | `add_page_filter`          | **B04 retest** — TopN Top 5 Products by Sales on UAT-2A          | PASS   | `From`/`Where`/`TopN` format confirmed in page.json |
| U19 | `list_filters` slim=false  | UAT-2A — verify both filter structures on disk                   | PASS   | Both filters: correct `From`/`Where` DAX query format, no `Categorical`/`TopN` wrapper |
| U20 | `apply_theme`              | `blue-purple` on UAT-2A (7 visuals)                              | PASS   | 7 visuals formatted in 1 call |

**UAT Round 2 Total: 8/8 PASS**

### B04 Fix Confirmed
Filter `page.json` structure verified on disk:

```json
// Categorical (Year=2014) — CORRECT
{
  "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
  "Where": [{ "Condition": { "In": {
    "Expressions": [{ "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Year" } }],
    "Values": [[{ "Literal": { "Value": "'2014'" } }]]
  }}}]
}

// TopN (Top 5 Products by Sales) — CORRECT
{
  "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
  "Where": [{ "Condition": { "TopN": {
    "Expression": { "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Product" } },
    "ItemCount": 5,
    "OrderBy": [{ "Direction": 2, "Expression": { "Column": { ... "Property": "Sales" } } }]
  }}}]
}
```

### Round 2 Observations
- `lineClusteredColumnComboChart` requires `ColumnY` and `LineY` buckets — NOT `Y` and `Y2`
- `scatterChart` requires `Details` bucket for dimension — NOT `Category`
- `auto_layout` arranges N visuals into an optimal grid automatically — zero positioning effort
- `kpi` visual accepts `Indicator` + `TrendLine` buckets — trend line bound to Month Name dimension
- B04 filter fix confirmed working — Power BI Desktop schema error resolved

---

## Observations

- **Batch/bulk tools save significant tokens** for multi-visual operations. On a 10-visual page, `bulk_update_format` saves ~9 round-trips.
- **`get_page_summary`** is the highest-leverage single optimisation — replaces N+1 calls at every session start.
- **slim mode** on `get_visual` and `list_filters` should always be default; only disable when editing raw PBIR structure.
- **`apply_theme`** is the fastest way to style an entire page — 1 call vs potentially 50+ property sets.
- **`add_visual` batch mode** is the most efficient way to scaffold a new page.
- MCP serialisation quirk (arrays/booleans sent as strings) affects several tools — the `z.preprocess`/`z.coerce` pattern is a system-wide requirement for required non-optional params.
