<!-- doc-version: 1.0 | Last updated: 2026-04-25 -->
<!-- summary: Stable error code legend — codes returned by pbir_add_visual / pbir_format_visual / bulk / layout / binding validators with one-line meaning + recovery hint. Read once, the codes recur. -->
# Skill: Error Code Legend

Validators ship a stable `code` field plus a structured payload (`actual`, `limits`, `suggestion`). The verbose prose (`rule`, `pbir_guide`, `rawMessage`) was dropped to save ~30-80 tokens per error — the LLM learns the codes from this skill instead.

Read this once. The codes don't change between calls. When you see one, look it up here, fix per the recovery hint, retry.

---

## Layout codes (`wireframe-validator` via `pbir_add_visual` / `pbir_layout_grid`)

| Code | Meaning | Recovery |
|---|---|---|
| `out_of_bounds_right` | x + width exceeds canvas right edge minus margin | Reduce width OR shift x left. `limits.maxRightEdge` is the cap. |
| `out_of_bounds_bottom` | y + height exceeds canvas bottom minus margin | Reduce height OR shift y up. `limits.maxBottomEdge` is the cap. |
| `out_of_bounds_negative` | x or y < 0 | Set both ≥ 0. Non-banner content starts at x≥20, y≥57. |
| `overlap` | Two visual rects intersect | Move one. Maintain a 5px gap between adjacent visuals. |
| `wrong_left_margin` | Leftmost visual in a row doesn't sit at x=20 | Set x=20 on the leftmost visual. |
| `wrong_right_margin` | Rightmost visual doesn't end at x+width=1260 | Adjust width so x+width=1260. |
| `wrong_bottom_margin` | Bottom row ends past y+height=714 | Bring the bottom row up; max y+height=714. |
| `wrong_horizontal_gap` | Gap between adjacent visuals in a row ≠ 5px | Space them so right-edge of A → left-edge of B = 5px. |
| `wrong_vertical_gap` | Gap between rows ≠ 5px | Same rule, vertical. |
| `silent_default_position` | Non-banner visual at (0,0) — likely a missing x/y | Set explicit x/y. Banner is the only thing allowed at (0,0). |
| `rounding_overflow` | Sum of widths + gaps ≠ canvas usable width | Distribute the 1-2px remainder to the first cells (or use `pbir_layout_grid` and let the server do it). |
| `banner_position` | Banner shape not at (0, 0, w=1280) | Pin banner to x=0, y=0, height=52. |
| `banner_width` | Banner width ≠ canvas width | Set width=1280. |
| `negative_dimension` | width or height ≤ 0 | Use positive integers. Min ~80×60 for readability. |
| `column_misalign` | Columns across rows have mismatched x — warning only | Align columns OR ignore if the drift is intentional (column-spans). |
| `row_misalign` | Rows across columns have mismatched y — warning only | Align rows OR ignore if a visual spans multiple rows. |

---

## Binding codes (`bindingValidation` via `pbir_add_visual` / `pbir_update_visual_bindings` / `pbir_bulk_bind`)

Each binding error carries `reason`, `entity`, `property`, `kind`, and up to 3 `suggestions` (already formatted as `Table[Field]`).

| `reason` | Meaning | Recovery |
|---|---|---|
| `table_not_found` | Table name doesn't exist in the model | Use a name from `suggestions[0]` or call `pbir_model_usage`. |
| `column_not_found` | Column missing in the named table | Use `suggestions[0]` or check casing. |
| `measure_not_found` | Measure missing in the named table | Likely a typo or stored in a different `_Measures` table. |
| `type_mismatch_column_is_measure` | Spec said `column`, the field is a DAX measure | Change `type` to `measure`. |
| `type_mismatch_measure_is_column` | Spec said `measure`, the field is a column | Change `type` to `column` or `aggregation`. |
| `parse_error` | Field spec malformed — not `Table[Column]` and not `entity`+`property` | Use the shorthand: `"field": "Sales[Net Price]"`. |

---

## Format-typo codes (`themeIndex` via `pbir_add_visual` / `pbir_format_visual`)

Single error type — `error: "format_typo"`, `issues: [{cat, prop?, didYouMean}]`.

- Category-level miss → `{cat: "labls", didYouMean: "labels"}`. Rename the category.
- Property-level miss → `{cat: "labels", prop: "txtSize", didYouMean: "textSize"}`. Rename the property.
- Empty `issues` = clean. Unknown `visualType` is a no-op (we don't gate writes on schema lag).

---

## Custom-visual codes (`customVisualValidation` via `pbir_add_visual` / `pbir_change_visual_type` / `pbir_layout_grid`)

Single error type — `error: "custom_visual_not_registered"`, payload carries `unregistered: string[]` and `registered: string[]`.

- A visualType matching the custom-visual naming convention (`<name><32-hex-guid>`, e.g. `htmlContent443BE3AD55E043BF878BED274D3A6855`) that isn't in the report's `publicCustomVisuals` will load as valid JSON but render broken in Desktop.
- Recovery: check `pbir_list_custom_visuals` for what's actually installed, use one of those, or install the visual in Desktop first. Set `strictCustomVisual:false` to proceed anyway (warn mode) if you know the visual will be installed before the next Desktop reload.
- Native visual types are never flagged by this check.

---

## Bulk safety codes (`bulk_*` tools)

| Field | Meaning | Recovery |
|---|---|---|
| `confirmBulkRequired: true` | Operation crosses the 5-visual soft gate | Re-call with `confirmBulk: true` once you're sure. |
| `bulk_size_limit_exceeded` | More than 1000 visuals — hard cap, not bypassable | Split into batches of ≤1000. |

---

## Page-resolution codes (auto-pageId)

| Code | Meaning | Recovery |
|---|---|---|
| `no_pages` | Tool needed a pageId but the report has no pages | Call `pbir_create_page` first. |
| `ambiguous_pageId` | Multiple pages, pageId omitted — `availableIds` lists the candidates | Pass `pageId` explicitly from the list. |

---

## Live-connect / `powerbi-modeling-mcp` handoff errors

These surface from **`powerbi-modeling-mcp`**, not from this MCP — they happen when you take `pbir_get_report`'s `liveConnection` (see `skills/report.md`) and call `connection_operations` with `operation: "ConnectFabric"`.

| Error text contains | Meaning | Recovery |
|---|---|---|
| `"...user does not have permission to call the Discover method"` | The calling account lacks **Build** permission on that semantic model in Power BI Service — this is a Fabric/PBI Service ACL issue, not a bug in `liveConnection` parsing or the handoff itself. `workspaceName`/`semanticModelName` resolved correctly and the request reached Microsoft's TOM server; it was rejected there. | Ask the dataset owner to grant the account **Build** (or Contributor/Member) on that semantic model, or re-run the connection under an account that already has it (e.g. the report's actual owner). |
| `"No databases found on the server"` (when connecting to a **local** port from `ListLocalInstances`) | Power BI Desktop's embedded local Analysis Services instance does not proxy/host a remote model for live-connected reports — there is nothing to read locally. | Use `ConnectFabric` with `liveConnection.workspace` / `liveConnection.dataset` instead of trying to reach the local AS port. |
