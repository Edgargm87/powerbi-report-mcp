"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// layout_grid — Slice 2 (plan-only)
//
// Grid-primitive layout tool. The LLM declares `rows × cols` plus a list of
// cells (each with `row`, `col`, optional `rowSpan`/`colSpan`, and the visual
// content) — the server computes the x/y/w/h for every cell deterministically,
// runs the wireframe validator, and returns the plan.
//
// Two design goals:
//   1. Take arithmetic away from the LLM. The server owns margin/gap/remainder
//      math — no chance of "sum of widths ≠ 1250" or a silent 1-pixel overflow.
//   2. Surface the numbers. Every plan entry echoes back x/y/w/h so the LLM
//      *sees* the grid and can learn the canonical split over a few sessions.
//
// Slice 2 ships PLAN MODE only (`planOnly:true`, the default). Commit mode
// (`planOnly:false`, writes via add_visual) lands in Slice 3.
//
// Math is documented in docs/design-layout-accuracy.md §6d and unit-tested in
// scripts/test-layout-grid.js.
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeGridGeometry = computeGridGeometry;
exports.cellRect = cellRect;
exports.validateCellGrid = validateCellGrid;
exports.registerLayoutGridTool = registerLayoutGridTool;
const zod_1 = require("zod");
const wireframe_validator_js_1 = require("../wireframe-validator.js");
const layoutValidation_js_1 = require("../helpers/layoutValidation.js");
/**
 * Compute widths[], heights[], and the origin (top-left of cell (0,0)) for a
 * grid of `rows × cols` on the canonical 1280×720 canvas.
 *
 * - Uses CANVAS constants (docs/wireframes.md).
 * - Floors raw cell size, distributes the remainder 1px at a time to the first
 *   N cells so `sum(widths) + (cols-1)*gap === available_w` EXACTLY.
 * - If `reserveBannerRow` is true, the first 57px (banner 52 + gap 5) are
 *   carved out of the available height and the grid starts at y=57.
 */
function computeGridGeometry(opts) {
    const { rows, cols, gap, margins, reserveBannerRow } = opts;
    if (rows < 1 || cols < 1) {
        throw new Error(`Grid must have rows≥1 and cols≥1 (got ${rows}×${cols})`);
    }
    const bannerOffset = reserveBannerRow ? wireframe_validator_js_1.CANVAS.bannerHeight + gap : 0;
    const availableW = wireframe_validator_js_1.CANVAS.width - margins.left - margins.right;
    const availableH = wireframe_validator_js_1.CANVAS.height - margins.top - margins.bottom - bannerOffset;
    if (availableW <= 0 || availableH <= 0) {
        throw new Error(`Margins/banner consume the entire canvas — no room for a grid (availableW=${availableW}, availableH=${availableH})`);
    }
    const rawCW = (availableW - (cols - 1) * gap) / cols;
    const rawCH = (availableH - (rows - 1) * gap) / rows;
    const cellWidth = Math.floor(rawCW);
    const cellHeight = Math.floor(rawCH);
    if (cellWidth <= 0 || cellHeight <= 0) {
        throw new Error(`Grid dimensions too small — cellWidth=${cellWidth}, cellHeight=${cellHeight}. Reduce rows/cols or margins.`);
    }
    const remainderW = availableW - (cols - 1) * gap - cellWidth * cols;
    const remainderH = availableH - (rows - 1) * gap - cellHeight * rows;
    const widths = Array.from({ length: cols }, (_, i) => cellWidth + (i < remainderW ? 1 : 0));
    const heights = Array.from({ length: rows }, (_, i) => cellHeight + (i < remainderH ? 1 : 0));
    return {
        widths,
        heights,
        cellWidth,
        cellHeight,
        remainderW,
        remainderH,
        originX: margins.left,
        originY: margins.top + bannerOffset,
        gap,
    };
}
/**
 * Resolve a logical (row,col,rowSpan,colSpan) into absolute pixel geometry,
 * given the widths/heights computed by `computeGridGeometry`.
 */
function cellRect(geom, cell) {
    const { widths, heights, originX, originY, gap } = geom;
    const { row, col, rowSpan, colSpan } = cell;
    let x = originX;
    for (let i = 0; i < col; i++)
        x += widths[i] + gap;
    let y = originY;
    for (let i = 0; i < row; i++)
        y += heights[i] + gap;
    let width = 0;
    for (let i = col; i < col + colSpan; i++)
        width += widths[i];
    width += (colSpan - 1) * gap;
    let height = 0;
    for (let i = row; i < row + rowSpan; i++)
        height += heights[i];
    height += (rowSpan - 1) * gap;
    return { x, y, width, height };
}
/**
 * Check that every cell fits inside the rows×cols grid, every span is ≥1, and
 * no two cells share the same logical cell. Returns the error list *before*
 * geometry is computed — geometry-invalid grids never get to the validator.
 */
function validateCellGrid(cells, rows, cols) {
    const errors = [];
    // Occupancy grid for collision detection (rows × cols bits)
    const occupied = new Map(); // key "r,c" → cellIndex of first occupant
    cells.forEach((cell, idx) => {
        const { row, col, rowSpan, colSpan } = cell;
        if (rowSpan < 1 || colSpan < 1) {
            errors.push({
                code: "invalid_span",
                cellIndex: idx,
                message: `Cell #${idx}: rowSpan and colSpan must be ≥ 1 (got ${rowSpan}×${colSpan}).`,
            });
            return;
        }
        if (row < 0 || row >= rows || col < 0 || col >= cols) {
            errors.push({
                code: "cell_out_of_grid",
                cellIndex: idx,
                message: `Cell #${idx} at (row=${row}, col=${col}) is outside the ${rows}×${cols} grid.`,
            });
            return;
        }
        if (row + rowSpan > rows || col + colSpan > cols) {
            errors.push({
                code: "span_overflow_grid",
                cellIndex: idx,
                message: `Cell #${idx} at (${row},${col}) with span ${rowSpan}×${colSpan} extends past the ${rows}×${cols} grid.`,
            });
            return;
        }
        // Collision check — mark every occupied (r,c)
        for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
                const key = `${r},${c}`;
                const other = occupied.get(key);
                if (other !== undefined) {
                    errors.push({
                        code: "cell_collision",
                        cellIndex: idx,
                        message: `Cell #${idx} and cell #${other} both occupy grid position (${r},${c}).`,
                    });
                }
                else {
                    occupied.set(key, idx);
                }
            }
        }
    });
    return errors;
}
// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
const CellSchema = zod_1.z
    .object({
    row: zod_1.z.number().int().min(0).describe("0-indexed row position"),
    col: zod_1.z.number().int().min(0).describe("0-indexed column position"),
    rowSpan: zod_1.z.number().int().min(1).optional().default(1),
    colSpan: zod_1.z.number().int().min(1).optional().default(1),
    visualType: zod_1.z.string().describe("Visual type (e.g. card, columnChart)"),
    title: zod_1.z.string().optional(),
    // Pass-through content — validated downstream in Slice 3 by add_visual.
    // We do NOT validate bindings here because plan mode never writes.
    bindings: zod_1.z.array(zod_1.z.unknown()).optional(),
})
    .passthrough();
const MarginsSchema = zod_1.z
    .object({
    left: zod_1.z.number().int().min(0).optional(),
    right: zod_1.z.number().int().min(0).optional(),
    top: zod_1.z.number().int().min(0).optional(),
    bottom: zod_1.z.number().int().min(0).optional(),
})
    .optional();
function registerLayoutGridTool(server, ctx) {
    server.tool("layout_grid", "Compute a deterministic rows×cols grid layout for a page. Returns a plan with exact x/y/w/h per cell — the server owns the margin/gap/remainder math, so the LLM can't overflow or leave mismatched gaps. Slice 2: plan-only (planOnly:true). Slice 3 will add commit mode. Use this INSTEAD of calling add_visual N times when building a page from scratch. See guide('wireframes') for when each grid shape is appropriate.", {
        pageId: zod_1.z.string().describe("Page ID the grid belongs to"),
        rows: zod_1.z.number().int().min(1).describe("Grid rows (≥1)"),
        cols: zod_1.z.number().int().min(1).describe("Grid columns (≥1)"),
        gaps: zod_1.z
            .number()
            .int()
            .min(0)
            .optional()
            .default(wireframe_validator_js_1.CANVAS.gap)
            .describe(`Gap in px between cells, both directions (default ${wireframe_validator_js_1.CANVAS.gap})`),
        margins: MarginsSchema.describe(`Custom page margins. Default is canonical (L=${wireframe_validator_js_1.CANVAS.marginLeft}, R=${wireframe_validator_js_1.CANVAS.marginRight}, T=${wireframe_validator_js_1.CANVAS.marginTop}, B=${wireframe_validator_js_1.CANVAS.marginBottom}).`),
        reserveBannerRow: zod_1.z
            .boolean()
            .optional()
            .default(false)
            .describe(`If true, grid starts at y=${wireframe_validator_js_1.CANVAS.firstContentRowY} leaving the top ${wireframe_validator_js_1.CANVAS.bannerHeight}px free for a banner shape (caller adds the banner separately via add_visual).`),
        cells: zod_1.z
            .array(CellSchema)
            .min(1)
            .describe("Cells to place in the grid. Empty cells allowed — don't need to fill every slot."),
        planOnly: zod_1.z
            .boolean()
            .optional()
            .default(true)
            .describe("Slice 2: must be true. When false, returns a 'not yet implemented' notice pointing to Slice 3."),
        strictLayout: zod_1.z
            .boolean()
            .optional()
            .describe("Layout validation: true=strict (default), false=warn. Same semantics as add_visual. Omit for env default (MCP_LAYOUT_VALIDATION)."),
    }, async (params) => {
        const { pageId, rows, cols, gaps, reserveBannerRow, cells, planOnly, strictLayout, } = params;
        // Slice 2 gate — commit mode lives in Slice 3.
        if (planOnly === false) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "commit_mode_not_implemented",
                            message: "layout_grid commit mode (planOnly:false) ships in Slice 3. For now, call with planOnly:true and then feed each plan entry to add_visual.",
                            hint: "Set planOnly:true to get the computed geometry.",
                        }, null, 2),
                    },
                ],
            };
        }
        // Resolve margins
        const m = {
            left: params.margins?.left ?? wireframe_validator_js_1.CANVAS.marginLeft,
            right: params.margins?.right ?? wireframe_validator_js_1.CANVAS.marginRight,
            top: params.margins?.top ?? wireframe_validator_js_1.CANVAS.marginTop,
            bottom: params.margins?.bottom ?? wireframe_validator_js_1.CANVAS.marginBottom,
        };
        // Pre-geometry cell-grid check (catches out-of-grid / collisions up front)
        const gridErrors = validateCellGrid(cells, rows, cols);
        if (gridErrors.length > 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "grid_validation_failed",
                            canvas: (0, layoutValidation_js_1.getCanvasSummary)(),
                            grid: { rows, cols, gaps, margins: m, reserveBannerRow },
                            gridErrors,
                            hint: "Fix cell row/col/spans so every cell fits inside the grid and no two cells overlap the same slot.",
                        }, null, 2),
                    },
                ],
            };
        }
        // Compute geometry
        let geom;
        try {
            geom = computeGridGeometry({ rows, cols, gap: gaps, margins: m, reserveBannerRow });
        }
        catch (err) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "grid_geometry_failed",
                            message: err instanceof Error ? err.message : String(err),
                            canvas: (0, layoutValidation_js_1.getCanvasSummary)(),
                        }, null, 2),
                    },
                ],
            };
        }
        // Build plan entries
        const plan = cells.map((cell, idx) => {
            const rs = cell.rowSpan ?? 1;
            const cs = cell.colSpan ?? 1;
            const rect = cellRect(geom, {
                row: cell.row,
                col: cell.col,
                rowSpan: rs,
                colSpan: cs,
            });
            return {
                slotRef: `r${cell.row}c${cell.col}${rs > 1 || cs > 1 ? `s${rs}x${cs}` : ""}`,
                cellIndex: idx,
                row: cell.row,
                col: cell.col,
                rowSpan: rs,
                colSpan: cs,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                visualType: cell.visualType,
                title: cell.title,
                bindings: cell.bindings,
                // Pass through any other keys the LLM included (format, dataColors, etc.)
                // so the plan is commit-ready for Slice 3 without re-specifying.
                extras: Object.fromEntries(Object.entries(cell).filter(([k]) => ![
                    "row",
                    "col",
                    "rowSpan",
                    "colSpan",
                    "visualType",
                    "title",
                    "bindings",
                ].includes(k))),
            };
        });
        // Validate the planned layout against existing page visuals
        const existingIds = ctx.project.listVisualIds(pageId);
        const existingWireframe = existingIds.map((vid) => {
            const v = ctx.project.getVisual(pageId, vid);
            return {
                id: vid,
                visualType: v.visual.visualType,
                x: v.position.x,
                y: v.position.y,
                width: v.position.width,
                height: v.position.height,
            };
        });
        const plannedWireframe = plan.map((p) => ({
            id: p.slotRef,
            visualType: p.visualType,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            title: p.title,
        }));
        const outcome = (0, layoutValidation_js_1.runLayoutValidation)([...existingWireframe, ...plannedWireframe], strictLayout);
        // Sum-check: widths should add up exactly (defence-in-depth).
        const sumW = geom.widths.reduce((a, b) => a + b, 0) + (cols - 1) * gaps;
        const sumH = geom.heights.reduce((a, b) => a + b, 0) + (rows - 1) * gaps;
        const expectedW = wireframe_validator_js_1.CANVAS.width - m.left - m.right;
        const expectedH = wireframe_validator_js_1.CANVAS.height - m.top - m.bottom - (reserveBannerRow ? wireframe_validator_js_1.CANVAS.bannerHeight + gaps : 0);
        const response = {
            success: outcome.proceed,
            mode: "plan",
            planOnly: true,
            pageId,
            canvas: (0, layoutValidation_js_1.getCanvasSummary)(),
            grid: {
                rows,
                cols,
                gaps,
                margins: m,
                reserveBannerRow,
            },
            cellGeometry: {
                cellWidth: geom.cellWidth,
                cellHeight: geom.cellHeight,
                widths: geom.widths,
                heights: geom.heights,
                remainderW: geom.remainderW,
                remainderH: geom.remainderH,
                origin: { x: geom.originX, y: geom.originY },
                roundingStrategy: "distribute-1px-remainders-to-first-N-cells",
                sumCheck: {
                    computedWidthSpan: sumW,
                    expectedWidthSpan: expectedW,
                    computedHeightSpan: sumH,
                    expectedHeightSpan: expectedH,
                    widthExact: sumW === expectedW,
                    heightExact: sumH === expectedH,
                },
            },
            plan,
            validated: {
                ok: outcome.proceed,
                mode: outcome.mode,
                errors: outcome.errors.length,
                warnings: outcome.warnings.length,
            },
            layoutErrors: outcome.errors,
            layoutWarnings: outcome.warnings,
            nextStep: outcome.proceed
                ? "Call add_visual for each plan entry (Slice 3 will add commit mode to layout_grid directly)."
                : "Fix the layoutErrors above and call layout_grid again.",
        };
        return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
    });
}
