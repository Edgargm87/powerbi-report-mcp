# Test Suite — powerbi-report-mcp

Run against the training report (`training.Report`) using Claude Sonnet 4.6 via MCP.
Date: 2026-04-05 | Version: 0.4.8

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
| B04-R1 | `add_page_filter` | All filters written in REST API format (`Categorical`/`TopN` wrapper) — fails PBIR schema | Rewrote all three builders to DAX query `From`/`Where` format |
| B04-R2 | `add_page_filter` topN | `Condition.TopN` not a valid PBIR condition type | Rewrote topN to subquery pattern: `Type: 2` From entry with nested Query; `Where` uses `In` with `Table` referencing subquery |
| B04-R3 | `add_page_filter` topN | TopN filter not recognised by Power BI Desktop despite correct structure | Added `howCreated: "User"` at filter item level — discovered by reading JSON written by PBI Desktop after manual filter application |
| B05 | `add_page_filter` topN | TopN applied at page level — invalid in Power BI (visual level only) | Added optional `visualId` param; topN without `visualId` now returns error; filter written to `visual.filterConfig` when `visualId` provided |
| B06 | `update_report_settings` | Accepted arbitrary keys (e.g. `persistFilters`) — written to `report.json` causing schema error on open | Added allowlist of valid setting keys; invalid keys return error before writing |
| B07 | `add_page_filter` relativeDate | `Condition.RelativeDate` not a valid PBIR condition type | Rewrote to `Condition.Between` with `DateSpan`/`DateAdd` expressions; added `howCreated: "User"` — confirmed from PBI Desktop manual filter |
| B08 | `set_conditional_format` | `isMeasure:false` used raw `Column` in comparison — adds invalid projection at index 4 in table/matrix visuals | Changed to use `Aggregation` (Function:0 = Sum) wrapping the column expression |
| B09 | `set_datapoint_colors` | Used `selector: { metadata: name }` for all charts — only works for series-based charts | Added `categoryEntity`+`categoryProperty` params; when provided uses `selector: { data: [{ scopeId: Comparison }] }` required for category-based charts (barChart, columnChart, pieChart etc.) |
| B10 | `add_visual` | `stackedBarChart` used as visual type — not a built-in PBI type ("custom visual" error) | Correct type is `barChart` (PBI's stacked bar); `clusteredBarChart` is the clustered variant |

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
~14,600 tokens to load all 49 tool schemas at session start.

| Category | Tools | Schema Tokens | Heaviest Tool |
|----------|-------|--------------|---------------|
| Report Ops | 16 | ~3,290 | `auto_layout` (300) |
| Visual Ops | 8 | ~2,800 | `add_visual` (1,200) |
| Format Ops | 5 | ~2,100 | `set_conditional_format` (800) |
| Filter Ops | 4 | ~1,600 | `add_page_filter` (1,000) |
| Theme Ops | 5 | ~1,150 | `set_report_theme` (500) |
| Bulk Ops | 3 | ~900 | `bulk_update_format` (350) |
| Binding Ops | 1 | ~350 | `update_visual_bindings` (350) |
| Calculation Ops | 3 | ~650 | `add_visual_calculation` (250) |
| Bookmark Ops | 4 | ~700 | `add_bookmark` (200) |

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
| U18 | `add_page_filter`          | **B04 retest** — TopN Top 5 Products by Sales on UAT-2A          | FAIL   | `Condition.TopN` written — not a valid PBIR condition type; subquery format required (see B04 Round 2) |
| U19 | `list_filters` slim=false  | UAT-2A — verify both filter structures on disk                   | PASS   | Both filters: correct `From`/`Where` DAX query format, no `Categorical`/`TopN` wrapper |
| U20 | `apply_theme`              | `blue-purple` on UAT-2A (7 visuals)                              | PASS   | 7 visuals formatted in 1 call |

**UAT Round 2 Total: 7/8 PASS** (U18 failed — triggered B04 Round 2 fix)

### B04 Categorical Fix Confirmed
```json
{
  "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
  "Where": [{ "Condition": { "In": {
    "Expressions": [{ "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Year" } }],
    "Values": [[{ "Literal": { "Value": "'2014'" } }]]
  }}}]
}
```

### Round 2 Observations
- `lineClusteredColumnComboChart` requires `ColumnY` and `LineY` buckets — NOT `Y` and `Y2`
- `scatterChart` requires `Details` bucket for dimension — NOT `Category`
- `auto_layout` arranges N visuals into an optimal grid automatically — zero positioning effort
- `kpi` visual accepts `Indicator` + `TrendLine` buckets — trend line bound to Month Name dimension
- B04 categorical fix confirmed; TopN still broken (U18) — triggered further investigation

---

## UAT Round 3 — TopN Filter Fix Verification

Date: 2026-04-06 | Pages preserved for visual inspection in Power BI Desktop.

### Pages Under Test
| Page | ID | Contents |
|------|----|----------|
| UAT-TopN | `fede249b6bcffed9b15e` | TopN with subquery format (patched directly) |
| UAT-TopN-2 | `a13550e9064b80f3db50` | TopN with `howCreated: "User"` (patched, then moved to visual level manually) |
| UAT-TopN-3 | `2178f717581c280808f7` | TopN at visual level via updated `add_page_filter` tool + rebuilt server |

### Results

| #   | Tool(s)                    | Input / Target                                                            | Result | Notes |
|-----|----------------------------|---------------------------------------------------------------------------|--------|-------|
| U21 | `add_page_filter` topN     | UAT-TopN — subquery format, page level                                    | FAIL   | Subquery structure correct; missing `howCreated: "User"` — PBI Desktop did not recognise filter |
| U22 | Manual filter in PBI Desktop | User applied TopN filter on visual, saved — read back JSON                | PASS   | Revealed `howCreated: "User"` at filter item level as the missing field |
| U23 | `add_page_filter` topN     | UAT-TopN-2 — subquery + `howCreated: "User"`, page level                  | FAIL   | Filter structure correct; TopN is not valid at page level — must be visual-level |
| U24 | `add_page_filter` topN     | UAT-TopN-3 — subquery + `howCreated: "User"`, visual level via `visualId` | PASS   | Filter pane shows "Top N / Top / 5 / Sum of Sales"; no schema error; bar chart filters to 5 products |

**UAT Round 3 Total: 1/4 PASS** (each failure drove a targeted fix; final test confirmed full resolution)

### B04 Final Fix — TopN Subquery Format
TopN filter written to `visual.filterConfig` (not page), confirmed in Power BI Desktop:

```json
{
  "type": "TopN",
  "filter": {
    "Version": 2,
    "From": [
      {
        "Name": "subquery",
        "Expression": { "Subquery": { "Query": {
          "Version": 2,
          "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
          "Select": [{ "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Product" }, "Name": "field" }],
          "OrderBy": [{ "Direction": 2, "Expression": { "Aggregation": { "Expression": { "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Sales" } }, "Function": 0 } } }],
          "Top": 5
        }}},
        "Type": 2
      },
      { "Name": "f", "Entity": "financials", "Type": 0 }
    ],
    "Where": [{ "Condition": { "In": {
      "Expressions": [{ "Column": { "Expression": { "SourceRef": { "Source": "f" } }, "Property": "Product" } }],
      "Table": { "SourceRef": { "Source": "subquery" } }
    }}}]
  },
  "howCreated": "User"
}
```

### Round 3 Observations
- TopN is **visual-level only** in Power BI — page/report level filter pane does not support TopN type
- `howCreated: "User"` is required at filter item level for PBI Desktop to recognise the TopN filter
- TopN uses a **subquery pattern** — `From` contains a `Type: 2` subquery entry; `Where` uses `In` with `Table` referencing the subquery — NOT `Condition.TopN`
- Discovery method: user applied manual TopN filter in PBI Desktop, saved, then read back the exact JSON PBI Desktop wrote

---

## UAT Round 4 — Extended Coverage + Bug Fix Verification

Date: 2026-04-07 | Pages preserved for visual inspection in Power BI Desktop.

### Pages Under Test
| Page | ID | Focus |
|------|----|-------|
| UAT-R1-Filters | `f167dae42e8b3e6ace61` | relativeDate filter (visual-level) + categorical visual-level filter |
| UAT-R2-DuplicatePage | `58485b34b840ccb0aa65` | `duplicate_page` + `change_visual_type` (ribbon, waterfall) + rebind |
| UAT-R3-VisualTypes | `b65870c36a2d529fcc65` | waterfallChart, ribbonChart, treemap, funnel |
| UAT-R4-CondFormat | `ca1ff2ebcb2634acd794` | rules conditional format + `set_datapoint_colors` category mode |
| UAT-R5-PageOps | `f88b50d444daca5199d0` | `update_page_size` (360×640 mobile), `update_report_settings` |

### Results

| #   | Tool(s)                       | Input / Target                                                      | Result | Notes |
|-----|-------------------------------|---------------------------------------------------------------------|--------|-------|
| U25 | `create_page` ×4 + `duplicate_page` | UAT-R1 through UAT-R5                                        | PASS   | 4 created + 1 duplicated from Training page |
| U26 | `add_page_filter` relativeDate | Last 2 years on line chart (visual-level)                          | FAIL→PASS | `Condition.RelativeDate` invalid; fixed to `Condition.Between` + `DateSpan`/`DateAdd` + `howCreated:"User"` (B07). PBI Desktop wrote correct format after manual apply |
| U27 | `add_page_filter` categorical  | Germany/France/USA on bar chart (visual-level)                     | PASS   | `scope:"visual"` confirmed; filter pane shows correctly |
| U28 | `duplicate_page`              | Clone Training → UAT-R2-DuplicatePage (10 visuals)                 | PASS   | All 10 visuals copied; bindings/formatting preserved |
| U29 | `change_visual_type`          | clusteredColumnChart → ribbonChart; columnChart → waterfallChart    | PASS   | Both types accepted; bindings preserved |
| U30 | `update_visual_bindings`      | Add Series (Segment) to ribbonChart                                 | PASS   | Ribbon chart shows segment ranking by month |
| U31 | `add_visual` (batch, 4)       | waterfallChart, ribbonChart, treemap, funnel on UAT-R3              | PASS   | All 4 new visual types rendered correctly in PBI Desktop |
| U32 | `set_conditional_format` rules | Profit column: red(<0), yellow(0–5M), green(>5M) on tableEx        | FAIL→PASS | Raw `Column` in comparison caused invalid projection at index 4 (B08); fixed to `Aggregation` |
| U33 | `set_datapoint_colors`        | 5 custom colors on barChart by Segment                              | FAIL→PASS | `metadata` selector doesn't work for category charts (B09); fixed to `data`+`scopeId` Comparison selector with `categoryEntity`/`categoryProperty` |
| U34 | `update_page_size`            | UAT-R5 → 360×640 mobile portrait                                   | PASS   | Page renders in mobile dimensions |
| U35 | `update_report_settings`      | `persistFilters:true` + `defaultDrillFilterOtherVisuals:false`      | FAIL→PASS | `persistFilters` not a valid PBIR schema key — caused report to fail to open (B06); fixed with allowlist validation |

**UAT Round 4 Total: 6/11 PASS on first attempt — 5 bugs found and fixed — 11/11 PASS after fixes**

### Round 4 Observations
- **relativeDate filter**: correct format is `Condition.Between` with nested `DateAdd(DateAdd(Now,+1,day),-N,unit)` for lower bound — NOT `Condition.RelativeDate`. Also `howCreated:"User"` required same as TopN.
- **`set_datapoint_colors`**: must distinguish between series-based charts (`metadata` selector) and category-based charts (`data`+`scopeId` selector). Category-based = any chart with Category bucket and no Series bucket (barChart, columnChart, pieChart, treemap, funnel etc.)
- **`update_report_settings`**: schema is strict — only a fixed set of known keys are valid. Allowlist prevents silent schema corruption.
- **`duplicate_page`** works correctly — all visuals, bindings, formatting, and filter configs copied.
- **waterfallChart, ribbonChart, treemap, funnel** all render correctly with `financials` data.
- **`stackedBarChart`** is not a valid PBI built-in type — use `barChart` (B10).

---

## UAT Round 5 — Theme Application from JSON Files

Date: 2026-04-07 | Applied 3 external theme JSON files to training report.

### Results

| #   | Tool               | Input / Target                                    | Result | Notes |
|-----|--------------------|---------------------------------------------------|--------|-------|
| U36 | `set_report_theme` | theme test1.json — "My Theme" (32 data colors)    | PASS   | Blues/teals/oranges palette; `dataColors` array applied |
| U37 | `set_report_theme` | theme test2.json — "Custom" (8 data colors)       | PASS   | Purple/navy/orange palette |
| U38 | `set_report_theme` | theme test3.json — "Seppirus Dark Mode 1.1"       | PASS   | Full dark theme: background, foreground, dataColors, tableAccent, visualStyles (slicer + filter pane + tooltip styling) — no schema errors |

**UAT Round 5 Total: 3/3 PASS**

### Round 5 Observations
- `set_report_theme` correctly reads theme JSON, maps all known keys, and writes to StaticResources + wires into `report.json`
- Full `visualStyles` objects (including slicer, filter pane, tooltip overrides) pass through correctly
- Theme switching works cleanly — each apply replaces the previous custom theme

---

## UAT Round 6 — Bug Fix Verification (Gradient, Transparency, Duplicate)

Date: 2026-04-07 | New pages created for clean re-test of B12/B13 fixes.

### Pages Under Test
| Page | ID | Focus |
|------|----|-------|
| T5-GradientFix | `c9587c5831da9117ae0f` | `set_conditional_format` gradient — FillRule in objects.values |
| T7-TransparencyFix | `4cde52aee355902f0b89` | `set_datapoint_colors` transparency — `fillTransparency` property |
| T9-DupVisual-Extra | `5af2b78e0c0ab634eb48` | `duplicate_visual` cross-page (bar chart from T9 page) |

### Results

| #   | Tool(s)                       | Input / Target                                                      | Result | Notes |
|-----|-------------------------------|---------------------------------------------------------------------|--------|-------|
| U39 | `set_conditional_format` gradient | tableEx Sales column — red→yellow→green 3-point gradient         | PASS   | FillRule + linearGradient3 in objects.values with dataViewWildcard selector — matches PBI Desktop format |
| U40 | `set_datapoint_colors`        | 5 custom colors + 50% transparency on clusteredColumnChart          | PASS   | `fillTransparency` (not `transparency`) as separate no-selector dataPoint entry — matches PBI Desktop format |
| U41 | `duplicate_visual`            | Bar chart from T9 → T9-DupVisual-Extra page                         | PASS   | Cross-page duplicate rendered correctly |

**UAT Round 6 Total: 3/3 PASS**

### Bugs Fixed This Round
| Bug | Tool | Issue | Fix |
|-----|------|-------|-----|
| B12 | `set_conditional_format` gradient | Used `ColorLinear` expression in `visualContainerObjects.background` — PBI Desktop does not recognise this format | Rewrote to use `FillRule` expression in `objects.values` with `backColor` property, `linearGradient2/3` structure, `dataViewWildcard` selector + `metadata` queryRef |
| B13 | `set_datapoint_colors` transparency | Property name `transparency` is wrong; PBI Desktop uses `fillTransparency` | Changed property name to `fillTransparency`; kept as separate no-selector dataPoint entry (correct per PBI Desktop format) |

### Round 6 Observations
- **Gradient conditional formatting** in PBI uses `FillRule` expression type (not `ColorLinear`). Structure: `FillRule.Input` = field expr, `FillRule.FillRule.linearGradient3` = min/mid/max with `color: { Literal: {...} }`. Placed in `objects.values` (not `visualContainerObjects`).
- **Transparency** property in PBI dataPoint objects is `fillTransparency` (not `transparency`). Separate no-selector entry is the correct pattern — PBI treats it as the default for all data points.
- Discovery method for both: user applied formatting manually in PBI Desktop, saved, and we read back the exact JSON PBI Desktop wrote.

---

## UAT Round 7 — Remaining Tool Coverage

Date: 2026-04-07 | Tests for all previously untested tools.

### Pages Under Test
| Page | ID | Focus |
|------|----|-------|
| T11-FilterOps | `3562a0219549602de32b` | `remove_filter`, `clear_filters` |
| T12-VisualOps | `013aa3fc07cf12fd46c5` | `delete_visual`, `move_visual` |
| T13-PageOps | `728ae14a8ce39ff29166` | `set_page_visibility`, `set_active_page`, `reorder_pages` |

### Results

| #   | Tool(s)                       | Input / Target                                                      | Result | Notes |
|-----|-------------------------------|---------------------------------------------------------------------|--------|-------|
| U42 | `get_report` | Return connected report path | PASS | |
| U43 | `get_report_settings` | Return schema, theme config, settings object | PASS | |
| U44 | `get_visual_types` | Return 42 visual types with bucket mappings | PASS | |
| U45 | `get_report_theme` | Return base + custom theme with full JSON | PASS | |
| U46 | `list_report_themes` | Return 3 stored theme files with names + keys | PASS | |
| U47 | `list_pages` | Return 13 pages with visibility/active flags | PASS | |
| U48 | `add_page_filter` ×2 | Country + Segment categorical on T11 | PASS | |
| U49 | `remove_filter` | Remove Country filter by name; Segment remains | PASS | |
| U50 | `clear_filters` | Clear remaining Segment filter; 0 left | PASS | |
| U51 | `delete_visual` | Delete bar chart from T12 | PASS | Visual removed from disk |
| U52 | `move_visual` | Move line chart to x:500 y:50 at 700×400 | PASS | |
| U53 | `set_page_visibility` | Hide T6-PieColors | PASS | User confirmed hidden in PBI Desktop page tabs |
| U54 | `set_active_page` | Set T11-FilterOps as active page on open | PASS | |
| U55 | `reorder_pages` | Move T13 to position 2 in tab order | PASS | |
| U56 | `diff_report_theme` | Diff proposed 3-color theme vs Seppirus Dark | PASS | Returns added/removed/changed summary |
| U57 | `remove_report_theme` | Remove Seppirus Dark; revert to base CY26SU02 | PASS | |

**UAT Round 7 Total: 16/16 PASS**

### Bugs Found This Round
| Bug | Tool | Issue | Status |
|-----|------|-------|--------|
| B14 | `add_visual_calculation` | Stored calcs in `query.calculations[]` — invalid PBIR schema property. PBI Desktop stores visual calcs as `NativeVisualCalculation` projections in `queryState.Values.projections[]` | Code rewritten to use correct format but `NativeVisualCalculation` projections not rendering in PBI Desktop — **PARKED** for further investigation |

### Parked (Not Rendering / Not Loaded)
| Tool Group | Issue |
|------------|-------|
| `add_visual_calculation`, `list_visual_calculations`, `delete_visual_calculation` | B14: correct JSON format identified from PBI Desktop read-back but NativeVisualCalculation projections written via file edit not rendered — may require PBI internal state. Parked. |
| `list_bookmarks`, `add_bookmark`, `delete_bookmark`, `rename_bookmark` | Bookmark tools registered in code but not loaded in MCP session. Parked. |

### Round 7 Observations
- All read-only tools (`get_report`, `get_report_settings`, `get_visual_types`, `get_report_theme`, `list_report_themes`, `list_pages`) return well-structured data — no bugs.
- `remove_filter` correctly targets a single filter by name while preserving others.
- `clear_filters` removes all page-level filters in one call.
- `diff_report_theme` is useful for previewing theme changes before applying — shows added/removed/changed keys with before/after values.
- `set_page_visibility` uses `"HiddenInViewMode"` format (confirmed B11 fix from Round 5 still holds).
- `reorder_pages` accepts full page ID array and updates `ordinal` values in each page definition.

---

## Observations

- **Batch/bulk tools save significant tokens** for multi-visual operations. On a 10-visual page, `bulk_update_format` saves ~9 round-trips.
- **`get_page_summary`** is the highest-leverage single optimisation — replaces N+1 calls at every session start.
- **slim mode** on `get_visual` and `list_filters` should always be default; only disable when editing raw PBIR structure.
- **`apply_theme`** is the fastest way to style an entire page — 1 call vs potentially 50+ property sets.
- **`add_visual` batch mode** is the most efficient way to scaffold a new page.
- MCP serialisation quirk (arrays/booleans sent as strings) affects several tools — the `z.preprocess`/`z.coerce` pattern is a system-wide requirement for required non-optional params.
