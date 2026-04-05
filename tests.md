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

## Observations

- **Batch/bulk tools save significant tokens** for multi-visual operations. On a 10-visual page, `bulk_update_format` saves ~9 round-trips.
- **`get_page_summary`** is the highest-leverage single optimisation — replaces N+1 calls at every session start.
- **slim mode** on `get_visual` and `list_filters` should always be default; only disable when editing raw PBIR structure.
- **`apply_theme`** is the fastest way to style an entire page — 1 call vs potentially 50+ property sets.
- **`add_visual` batch mode** is the most efficient way to scaffold a new page.
- MCP serialisation quirk (arrays/booleans sent as strings) affects several tools — the `z.preprocess`/`z.coerce` pattern is a system-wide requirement for required non-optional params.
