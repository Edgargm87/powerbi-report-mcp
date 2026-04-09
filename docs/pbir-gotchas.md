<!-- doc-version: 1.0 | Last updated: 2026-04-09 -->
# PBIR Schema Gotchas and Bug Findings

Reference document for contributors to `powerbi-report-mcp`. Every gotcha listed here was discovered by writing JSON programmatically, opening the report in Power BI Desktop, observing the failure, then applying the operation manually in PBI Desktop, saving, and reading back the exact JSON PBI Desktop wrote.

Bug IDs (B01--B17) map to the CHANGELOG and tests.md entries.

---

## 1. Visual Creation

### 1.1 howCreated: InsertVisualButton (B--)

**Affected types:** `actionButton`, `pageNavigator`, `image`

**What went wrong:** Creating these visuals without the `howCreated` field resulted in PBI Desktop silently dropping them from the canvas -- no error, just invisible.

**What PBI Desktop expects:** A top-level `howCreated` property on the visual container definition:

```json
{
  "name": "abc123",
  "position": { "x": 0, "y": 0, "z": 1000, "width": 280, "height": 280 },
  "visual": {
    "visualType": "actionButton",
    "visualContainerObjects": {},
    "drillFilterOtherVisuals": true
  },
  "howCreated": "InsertVisualButton"
}
```

The set of visual types requiring this is defined in `INSERT_BUTTON_VISUAL_TYPES` in `src/helpers/createVisual.ts`.

---

### 1.2 stackedBarChart is not a valid type (B10)

**What went wrong:** Using `stackedBarChart` as the `visualType` value. PBI Desktop treats this as a missing custom visual and shows an error placeholder.

**What PBI Desktop expects:** The built-in stacked bar chart type is `barChart`. The clustered variant is `clusteredBarChart`. There is no `stackedBarChart` in the Power BI built-in type registry.

**Discovery:** User attempted to create a stacked bar chart; PBI Desktop rendered it as a broken custom visual tile. Checking the type list confirmed no `stackedBarChart` entry exists.

---

### 1.3 Slicer types and slicerMode

**What went wrong:** Applying `slicerMode` (Basic/Dropdown) to all slicer types indiscriminately.

**What PBI Desktop expects:** There are 4 slicer visual types:
- `slicer` -- the classic slicer, supports `slicerMode` in `objects.data`
- `listSlicer` -- list-style slicer, mode is inherent to the type
- `textSlicer` -- text/search slicer
- `advancedSlicerVisual` -- hierarchy/advanced slicer

Only the `slicer` type uses the `objects.data.mode` property. The other three types have their display mode baked into the visual type itself. All four types share the same `isFirst`/`active` projection flag and sort definition behavior.

Defined in `SLICER_VISUAL_TYPES` in `src/helpers/createVisual.ts`.

---

## 2. Filters

### 2.1 Categorical filters -- DAX query format, not REST API (B04-R1)

**What went wrong:** Writing filters in Power BI REST API format:

```json
{
  "Categorical": {
    "Column": { ... },
    "Values": [...]
  }
}
```

This fails PBIR schema validation. The report will not open.

**What PBI Desktop expects:** DAX query format with `From`/`Where`/`In`:

```json
{
  "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
  "Where": [{
    "Condition": {
      "In": {
        "Expressions": [{
          "Column": {
            "Expression": { "SourceRef": { "Source": "f" } },
            "Property": "Year"
          }
        }],
        "Values": [[{ "Literal": { "Value": "'2014'" } }]]
      }
    }
  }]
}
```

Key differences from REST API:
- Uses `From` with source aliases (single-letter, e.g. `"f"` for `"financials"`)
- Uses `SourceRef.Source` (alias reference) not `SourceRef.Entity`
- Values are nested arrays of `Literal` objects, each value single-quoted
- No `Categorical` wrapper

**Discovery:** Wrote REST API format, report failed to open. Read back a manually applied filter to find the correct structure.

---

### 2.2 TopN filters -- subquery pattern, visual-level only (B04-R2, B04-R3, B05)

**What went wrong (Round 1):** Using `Condition.TopN` in the `Where` clause. This is not a valid PBIR condition type.

**What went wrong (Round 2):** Correct subquery structure but missing `howCreated: "User"` at the filter item level. PBI Desktop silently ignored the filter.

**What went wrong (Round 3):** Correct structure and `howCreated`, but applied at page level. TopN is only valid at visual level in Power BI.

**What PBI Desktop expects:** A subquery pattern written to the visual's `filterConfig` (not the page's):

```json
{
  "type": "TopN",
  "filter": {
    "Version": 2,
    "From": [
      {
        "Name": "subquery",
        "Expression": {
          "Subquery": {
            "Query": {
              "Version": 2,
              "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
              "Select": [{
                "Column": {
                  "Expression": { "SourceRef": { "Source": "f" } },
                  "Property": "Product"
                },
                "Name": "field"
              }],
              "OrderBy": [{
                "Direction": 2,
                "Expression": {
                  "Aggregation": {
                    "Expression": {
                      "Column": {
                        "Expression": { "SourceRef": { "Source": "f" } },
                        "Property": "Sales"
                      }
                    },
                    "Function": 0
                  }
                }
              }],
              "Top": 5
            }
          }
        },
        "Type": 2
      },
      { "Name": "f", "Entity": "financials", "Type": 0 }
    ],
    "Where": [{
      "Condition": {
        "In": {
          "Expressions": [{
            "Column": {
              "Expression": { "SourceRef": { "Source": "f" } },
              "Property": "Product"
            }
          }],
          "Table": { "SourceRef": { "Source": "subquery" } }
        }
      }
    }]
  },
  "howCreated": "User"
}
```

Critical requirements:
- `From` array has a `Type: 2` entry named `"subquery"` containing a nested `Subquery.Query`
- The inner query has `Select`, `OrderBy`, and `Top` (the N value)
- `Where` uses `In` with `Table: { SourceRef: { Source: "subquery" } }` -- NOT `Condition.TopN`
- `howCreated: "User"` is required at the filter item level (not inside the filter query)
- `Version: 2` is required on both inner and outer query
- TopN must be written to `visual.filterConfig`, not `page.filterConfig`
- Direction: `2` = Descending (Top), `1` = Ascending (Bottom)

**Discovery:** Three rounds of iteration. Applied a TopN filter manually in PBI Desktop, saved, and read back the JSON to discover the subquery pattern and `howCreated` requirement.

---

### 2.3 RelativeDate filters -- Condition.Between, not Condition.RelativeDate (B07)

**What went wrong:** Using `Condition.RelativeDate` in the `Where` clause. This is not a valid PBIR condition type.

**What PBI Desktop expects:** `Condition.Between` with `DateSpan`/`DateAdd` expressions. For "last N years":

```json
{
  "Version": 2,
  "From": [{ "Name": "f", "Entity": "financials", "Type": 0 }],
  "Where": [{
    "Condition": {
      "Between": {
        "Expression": {
          "Column": {
            "Expression": { "SourceRef": { "Source": "f" } },
            "Property": "Date"
          }
        },
        "LowerBound": {
          "DateSpan": {
            "Expression": {
              "DateAdd": {
                "Expression": {
                  "DateAdd": {
                    "Expression": { "Now": {} },
                    "Amount": 1,
                    "TimeUnit": 0
                  }
                },
                "Amount": -2,
                "TimeUnit": 3
              }
            },
            "TimeUnit": 0
          }
        },
        "UpperBound": {
          "DateSpan": {
            "Expression": { "Now": {} },
            "TimeUnit": 0
          }
        }
      }
    }
  }]
}
```

Key details:
- `DateAdd` `TimeUnit`: `0` = days, `1` = weeks, `2` = months, `3` = years
- Quarters use months with `count * 3` (no native quarter unit in `DateAdd`)
- LowerBound pattern: `DateSpan(DateAdd(DateAdd(Now, +1, day), -N, unit), day)`
- UpperBound pattern: `DateSpan(Now, day)`
- `howCreated: "User"` required at filter item level (same as TopN)
- `Version: 2` required

**Discovery:** Wrote `Condition.RelativeDate`, filter not recognised. Applied a relative date filter manually in PBI Desktop, saved, and read back the Between/DateSpan pattern.

---

## 3. Formatting

### 3.1 fillTransparency, not transparency (B13)

**What went wrong:** Using property name `transparency` when setting data point transparency.

**What PBI Desktop expects:** The property name is `fillTransparency`. It is stored as a separate no-selector entry in the `dataPoint` array (not merged into each color entry):

```json
{
  "properties": {
    "fillTransparency": {
      "expr": { "Literal": { "Value": "50D" } }
    }
  }
}
```

This entry has no `selector` -- PBI treats it as the default transparency for all data points in the visual.

**Discovery:** Set transparency manually in PBI Desktop on a chart, saved, and read back the JSON. Found `fillTransparency` instead of `transparency`.

---

### 3.2 Gradient conditional format -- FillRule in objects.values (B12)

**What went wrong:** Using a `ColorLinear` expression in `visualContainerObjects.background`. PBI Desktop does not recognise this format at all.

**What PBI Desktop expects:** A `FillRule` expression placed in `visual.objects.values` (not `visualContainerObjects`), with a combined `dataViewWildcard` + `metadata` selector:

```json
{
  "properties": {
    "backColor": {
      "solid": {
        "color": {
          "expr": {
            "FillRule": {
              "Input": {
                "Measure": {
                  "Expression": { "SourceRef": { "Entity": "financials" } },
                  "Property": "Sales"
                }
              },
              "FillRule": {
                "linearGradient3": {
                  "min": { "color": { "Literal": { "Value": "'#FF0000'" } } },
                  "mid": { "color": { "Literal": { "Value": "'#FFFF00'" } } },
                  "max": { "color": { "Literal": { "Value": "'#00B050'" } } },
                  "nullColoringStrategy": {
                    "strategy": { "Literal": { "Value": "'asZero'" } }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "selector": {
    "data": [{ "dataViewWildcard": { "matchingOption": 1 } }],
    "metadata": "financials.Sales"
  }
}
```

Key details:
- Use `linearGradient2` for 2-point (min/max) or `linearGradient3` for 3-point (min/mid/max)
- Property name is `backColor` for background, `fontColor` for title
- Selector combines `dataViewWildcard` (matchingOption 1) with `metadata` (the query ref string, e.g. `"financials.Sales"` or `"Sum(financials.Profit)"` for aggregated columns)
- Placed in `visual.objects.values[]`, NOT in `visualContainerObjects`
- Rules-based conditional formatting (non-gradient) still uses `visualContainerObjects` with `Conditional.Cases`

**Discovery:** Applied a gradient color scale manually in PBI Desktop on a table column, saved, and read back the JSON. Found the FillRule/linearGradient pattern in `objects.values`.

---

### 3.3 Data point color selectors -- metadata vs data (B09)

**What went wrong:** Using `selector: { metadata: seriesName }` for all chart types. This only works for series-based charts (charts with a populated Series bucket).

**What PBI Desktop expects:** Two selector modes depending on chart configuration:

**Series-based charts** (Series bucket populated -- e.g., a line chart with multiple series):
```json
{
  "selector": { "metadata": "SeriesFieldName" }
}
```

**Category-based charts** (Category bucket only, no Series -- e.g., a bar chart with one measure colored by category):
```json
{
  "selector": {
    "data": [{
      "scopeId": {
        "Comparison": {
          "ComparisonKind": 0,
          "Left": {
            "Column": {
              "Expression": { "SourceRef": { "Entity": "financials" } },
              "Property": "Segment"
            }
          },
          "Right": { "Literal": { "Value": "'Government'" } }
        }
      }
    }]
  }
}
```

Category-based charts include: `barChart`, `columnChart`, `clusteredColumnChart`, `clusteredBarChart`, `pieChart`, `donutChart`, `treemap`, `funnel`, and any chart with a Category bucket but no Series bucket.

The tool exposes `categoryEntity` and `categoryProperty` parameters. When provided, it builds the `data`/`scopeId`/`Comparison` selector. When omitted, it uses `metadata` selector (series mode).

**Discovery:** Applied custom colors to a bar chart (category mode) in PBI Desktop. Read back the JSON and found the `scopeId.Comparison` selector pattern instead of `metadata`.

---

### 3.4 Aggregation wrapping for non-measure fields in conditional format (B08)

**What went wrong:** Using a raw `Column` expression for `isMeasure: false` fields in conditional format comparisons. In table/matrix visuals, this adds an invalid non-aggregated projection at index 4, breaking the visual.

**What PBI Desktop expects:** Non-measure columns must be wrapped in an `Aggregation` expression (Function 0 = Sum):

```json
{
  "Aggregation": {
    "Expression": {
      "Column": {
        "Expression": { "SourceRef": { "Entity": "financials" } },
        "Property": "Profit"
      }
    },
    "Function": 0
  }
}
```

Measures do not need this wrapping -- they use the `Measure` expression directly:

```json
{
  "Measure": {
    "Expression": { "SourceRef": { "Entity": "financials" } },
    "Property": "Total Sales"
  }
}
```

This applies to both rules-based and gradient conditional formatting.

**Discovery:** Applied rules-based conditional formatting on a Profit column (non-measure) in a table. PBI Desktop showed an error about an invalid projection. Compared with a working measure-based conditional format and found the Aggregation wrapper.

---

## 4. Report Settings

### 4.1 update_report_settings -- allowlisted keys only (B06)

**What went wrong:** Accepting arbitrary keys in the `update_report_settings` tool (e.g., `persistFilters`). Writing unknown keys to `report.json` causes a PBIR schema validation error and the report will not open in PBI Desktop at all.

**What PBI Desktop expects:** Only a fixed set of known keys are valid in the report settings object within `report.json`. The tool now validates against an allowlist and returns an error before writing if an invalid key is provided.

**Discovery:** User passed `persistFilters: true`. Report failed to open. Removed the key manually and report opened again. Confirmed that `report.json` has a strict schema.

---

## 5. Schema Validation Edge Cases

### 5.1 Boolean params serialised as strings (B01)

**What went wrong:** The `hidden` boolean parameter on `set_page_visibility` was rejected when an MCP client serialised `true` as the string `"true"`.

**Fix:** Use `z.coerce.boolean()` instead of `z.boolean()` for all boolean parameters that may come from MCP clients.

---

### 5.2 Array params serialised as JSON strings (B02)

**What went wrong:** Array parameters (`bindings`, `formatting`, `colors`, `visualIds`, `updates`, `pageOrder`) were rejected when MCP clients serialised them as JSON strings (e.g., `"[{\"bucket\":\"Category\",...}]"` instead of an actual array).

**Fix:** Wrap all required array parameters with `z.preprocess`:

```typescript
z.preprocess(
  (v) => typeof v === "string" ? JSON.parse(v) : v,
  z.array(ItemSchema)
)
```

Applied across `bindings.ts`, `bulk.ts`, `format.ts`, `report.ts`.

---

### 5.3 Aggregation FieldRef in list_filters slim mode (B03)

**What went wrong:** The `fieldRefToString` helper only handled `Column` and `Measure` field ref types. Auto-filters on SUM columns use an `Aggregation` wrapper, which fell through to raw JSON output in slim mode.

**Fix:** Added an `Aggregation` branch to `fieldRefToString`:

```typescript
if (f?.Aggregation?.Expression?.Column) {
  const col = f.Aggregation.Expression.Column;
  return `${col.Expression?.SourceRef?.Entity}[${col.Property}]`;
}
```

---

## 6. Parked Features

### 6.1 Visual calculations (B14)

**Status:** Code written, tools disabled (not registered in MCP session).

**What went wrong:** Initial implementation stored calculations in `query.calculations[]`, which is not a valid PBIR schema property. Rewrote to use `NativeVisualCalculation` projections in `queryState.Values.projections[]`, matching the format PBI Desktop writes when you add a visual calculation manually.

**Current state:** The `NativeVisualCalculation` projection format is confirmed correct by reading back PBI Desktop output. However, calculations written programmatically via file edit do not render in the visual. They appear in the JSON but PBI Desktop does not evaluate them. This likely requires internal PBI Desktop state initialization that is not triggered by file edits alone.

**Tools affected:** `add_visual_calculation`, `list_visual_calculations`, `delete_visual_calculation` -- all three are fully disabled (not registered in any tool loading mode).

---

### 6.2 Bookmarks

**Status:** Code written, tools not exposed in MCP session.

Tools (`list_bookmarks`, `add_bookmark`, `rename_bookmark`, `delete_bookmark`) are registered in source code but not loaded into the MCP session. Parked pending further testing.

---

## 7. Report File Structure

### 7.1 Empty reportExtensions.json crashes PBI Desktop (B15)

**What went wrong:** `reportExtensions.json` holds extension measures (report-level DAX). If the file exists but contains `"entities": []` (empty array), Power BI Desktop fails to open the report.

**Fix:** DELETE the file entirely when no extension measures exist. Only create it when there are actual measures to store.

**Discovery:** Documented in data-goblin/power-bi-agentic-development PBIR structure reference.

---

### 7.2 reportVersionAtImport is read-only (B16)

**What went wrong:** The `reportVersionAtImport` property inside `report.json` > `themeCollection` records the schema version at the time a theme was imported. Values vary per theme and are managed by PBI Desktop internally.

**Fix:** Do NOT set or modify this property manually — it can cause schema validation failures.

**Discovery:** data-goblin PBIR structure reference.

---

### 7.3 Auto-generated files must not be edited (B17)

**What went wrong:** Editing files that PBI Desktop auto-generates caused unpredictable behavior or silent overwrites on next save.

**Affected files:**
- `mobileState.json` — generated by PBI Desktop for mobile layout. No external editing.
- `semanticModelDiagramLayout.json` — generated by PBI Desktop for model diagram positions. No external editing.
- `.pbi/localSettings.json` — local editor settings, should be gitignored.

**Fix:** Never edit these files programmatically. PBI Desktop owns them and will overwrite changes on next save.

**Discovery:** data-goblin PBIR structure reference.

---

## Bug ID Quick Reference

| Bug | Category | Summary |
|-----|----------|---------|
| B01 | Schema validation | Boolean params sent as strings -- use `z.coerce.boolean()` |
| B02 | Schema validation | Array params sent as JSON strings -- use `z.preprocess` |
| B03 | Schema validation | `Aggregation` FieldRef not handled in `fieldRefToString` |
| B04 | Filters | Categorical/TopN/RelativeDate used REST API format, not DAX query format |
| B05 | Filters | TopN applied at page level -- must be visual level |
| B06 | Report settings | Arbitrary keys in `report.json` cause schema error |
| B07 | Filters | `Condition.RelativeDate` invalid -- use `Condition.Between` with DateSpan/DateAdd |
| B08 | Formatting | Raw Column in conditional format -- must wrap in Aggregation |
| B09 | Formatting | `metadata` selector for all charts -- category charts need `data`/`scopeId` selector |
| B10 | Visual creation | `stackedBarChart` not a valid type -- use `barChart` |
| B11 | (internal) | Page visibility format |
| B12 | Formatting | Gradient used `ColorLinear` in `visualContainerObjects` -- use `FillRule` in `objects.values` |
| B13 | Formatting | Property name `transparency` wrong -- use `fillTransparency` |
| B14 | Parked | Visual calculations correct format but not rendering programmatically |
| B15 | Report file structure | Empty `reportExtensions.json` crashes PBI Desktop -- delete file when no measures |
| B16 | Report file structure | `reportVersionAtImport` is read-only -- do not set manually |
| B17 | Report file structure | Auto-generated files (`mobileState.json`, `semanticModelDiagramLayout.json`, `.pbi/localSettings.json`) must not be edited |
