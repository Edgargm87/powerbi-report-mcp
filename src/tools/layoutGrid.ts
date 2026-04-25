// ═══════════════════════════════════════════════════════════════════════════════
// layout_grid — grid-primitive layout tool (plan + commit modes)
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
// Two modes:
//   planOnly:true  (default) — compute + validate geometry, return the plan,
//                               write nothing. Safe for iteration.
//   planOnly:false           — compute + validate, then write each cell via
//                               the same `createAndSaveVisual` path `add_visual`
//                               uses. Fails atomically before any writes if
//                               binding or layout validation trips.
//
// Math is documented in docs/design-layout-accuracy.md §6d and unit-tested in
// scripts/test-layout-grid.js.
// ═══════════════════════════════════════════════════════════════════════════════

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CANVAS } from "../wireframe-validator.js";
import type { WireframeVisual } from "../wireframe-validator.js";
import { runLayoutValidation, getCanvasSummary } from "../helpers/layoutValidation.js";
import { runBindingValidation, isNoteworthySkip } from "../helpers/bindingValidation.js";
import { createAndSaveVisual } from "../helpers/createVisual.js";
import type { VisualSpec, FieldSpecInput } from "../helpers/createVisual.js";
import { invalidateCache } from "../model-usage.js";
import type { ServerContext } from "../context.js";

// ---------------------------------------------------------------------------
// Pure grid math — exported for the unit tests
// ---------------------------------------------------------------------------

export interface GridMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GridGeometry {
  /** Per-column widths after remainder distribution. Length = cols. */
  widths: number[];
  /** Per-row heights after remainder distribution. Length = rows. */
  heights: number[];
  /** Base cell width (floor of raw). Remainder is distributed to first N cells. */
  cellWidth: number;
  cellHeight: number;
  /** Pixels left after floor(raw * n). 0..cols-1 for width, 0..rows-1 for height. */
  remainderW: number;
  remainderH: number;
  /** Origin (top-left of cell (0,0)). marginTop includes the banner offset when reserveBannerRow=true. */
  originX: number;
  originY: number;
  gap: number;
}

export interface GridRectInput {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
export function computeGridGeometry(opts: {
  rows: number;
  cols: number;
  gap: number;
  margins: GridMargins;
  reserveBannerRow: boolean;
}): GridGeometry {
  const { rows, cols, gap, margins, reserveBannerRow } = opts;
  if (rows < 1 || cols < 1) {
    throw new Error(`Grid must have rows≥1 and cols≥1 (got ${rows}×${cols})`);
  }

  const bannerOffset = reserveBannerRow ? CANVAS.bannerHeight + gap : 0;
  const availableW = CANVAS.width - margins.left - margins.right;
  const availableH = CANVAS.height - margins.top - margins.bottom - bannerOffset;

  if (availableW <= 0 || availableH <= 0) {
    throw new Error(
      `Margins/banner consume the entire canvas — no room for a grid (availableW=${availableW}, availableH=${availableH})`
    );
  }

  const rawCW = (availableW - (cols - 1) * gap) / cols;
  const rawCH = (availableH - (rows - 1) * gap) / rows;
  const cellWidth = Math.floor(rawCW);
  const cellHeight = Math.floor(rawCH);

  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error(
      `Grid dimensions too small — cellWidth=${cellWidth}, cellHeight=${cellHeight}. Reduce rows/cols or margins.`
    );
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
export function cellRect(geom: GridGeometry, cell: GridRectInput): GridRect {
  const { widths, heights, originX, originY, gap } = geom;
  const { row, col, rowSpan, colSpan } = cell;

  let x = originX;
  for (let i = 0; i < col; i++) x += widths[i] + gap;

  let y = originY;
  for (let i = 0; i < row; i++) y += heights[i] + gap;

  let width = 0;
  for (let i = col; i < col + colSpan; i++) width += widths[i];
  width += (colSpan - 1) * gap;

  let height = 0;
  for (let i = row; i < row + rowSpan; i++) height += heights[i];
  height += (rowSpan - 1) * gap;

  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Cell-grid validation (pre-geometry)
// ---------------------------------------------------------------------------

export interface GridCellError {
  code: "cell_out_of_grid" | "span_overflow_grid" | "cell_collision" | "invalid_span";
  cellIndex: number;
  message: string;
}

/**
 * Check that every cell fits inside the rows×cols grid, every span is ≥1, and
 * no two cells share the same logical cell. Returns the error list *before*
 * geometry is computed — geometry-invalid grids never get to the validator.
 */
export function validateCellGrid(
  cells: ReadonlyArray<GridRectInput>,
  rows: number,
  cols: number
): GridCellError[] {
  const errors: GridCellError[] = [];

  // Occupancy grid for collision detection (rows × cols bits)
  const occupied = new Map<string, number>(); // key "r,c" → cellIndex of first occupant

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
        } else {
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

const CellSchema = z
  .object({
    row: z.number().int().min(0).describe("0-indexed row position"),
    col: z.number().int().min(0).describe("0-indexed column position"),
    rowSpan: z.number().int().min(1).optional().default(1),
    colSpan: z.number().int().min(1).optional().default(1),
    visualType: z.string().describe("Visual type (e.g. card, columnChart)"),
    title: z.string().optional(),
    // Pass-through content — validated downstream in Slice 3 by add_visual.
    // We do NOT validate bindings here because plan mode never writes.
    bindings: z.array(z.unknown()).optional(),
  })
  .passthrough();

const MarginsSchema = z
  .object({
    left: z.number().int().min(0).optional(),
    right: z.number().int().min(0).optional(),
    top: z.number().int().min(0).optional(),
    bottom: z.number().int().min(0).optional(),
  })
  .optional();

export function registerLayoutGridTool(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "layout_grid",
    "Compute a deterministic rows×cols grid layout for a page, optionally writing the visuals. Server owns the margin/gap/remainder math — the LLM can't overflow or leave mismatched gaps. planOnly:true (default) returns the computed plan without writing. planOnly:false validates bindings + layout then writes every cell as a visual in one call. Use this INSTEAD of calling add_visual N times when building a page from scratch. See guide('wireframes') for when each grid shape is appropriate.",
    {
      pageId: z.string().describe("Page ID the grid belongs to"),
      rows: z.number().int().min(1).describe("Grid rows (≥1)"),
      cols: z.number().int().min(1).describe("Grid columns (≥1)"),
      gaps: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(CANVAS.gap)
        .describe(`Gap in px between cells, both directions (default ${CANVAS.gap})`),
      margins: MarginsSchema.describe(
        `Custom page margins. Default is canonical (L=${CANVAS.marginLeft}, R=${CANVAS.marginRight}, T=${CANVAS.marginTop}, B=${CANVAS.marginBottom}).`
      ),
      reserveBannerRow: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          `If true, grid starts at y=${CANVAS.firstContentRowY} leaving the top ${CANVAS.bannerHeight}px free for a banner shape (caller adds the banner separately via add_visual).`
        ),
      cells: z
        .array(CellSchema)
        .min(1)
        .describe("Cells to place in the grid. Empty cells allowed — don't need to fill every slot."),
      planOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "true (default) = return computed plan only; false = validate + write visuals in one call."
        ),
      strictLayout: z
        .boolean()
        .optional()
        .describe(
          "Layout validation: true=strict (default), false=warn. Same semantics as add_visual. Omit for env default (MCP_LAYOUT_VALIDATION)."
        ),
      strictBindings: z
        .boolean()
        .optional()
        .describe(
          "Binding validation for commit mode: true=strict (default), false=warn. Ignored when planOnly:true. Omit for env default (MCP_BINDING_VALIDATION)."
        ),
      includeTypes: z
        .boolean()
        .optional()
        .describe("Return full {visualId,visualType,slotRef,x,y,width,height} per cell instead of slim ids."),
    },
    async (params) => {
      const {
        pageId,
        rows,
        cols,
        gaps,
        reserveBannerRow,
        cells,
        planOnly,
        strictLayout,
      } = params;

      // Resolve margins
      const m: GridMargins = {
        left: params.margins?.left ?? CANVAS.marginLeft,
        right: params.margins?.right ?? CANVAS.marginRight,
        top: params.margins?.top ?? CANVAS.marginTop,
        bottom: params.margins?.bottom ?? CANVAS.marginBottom,
      };

      // Pre-geometry cell-grid check (catches out-of-grid / collisions up front)
      const gridErrors = validateCellGrid(cells, rows, cols);
      if (gridErrors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "grid_validation_failed",
                  canvas: getCanvasSummary(),
                  grid: { rows, cols, gaps, margins: m, reserveBannerRow },
                  gridErrors,
                  hint:
                    "Fix cell row/col/spans so every cell fits inside the grid and no two cells overlap the same slot.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Compute geometry
      let geom: GridGeometry;
      try {
        geom = computeGridGeometry({ rows, cols, gap: gaps, margins: m, reserveBannerRow });
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "grid_geometry_failed",
                  message: err instanceof Error ? err.message : String(err),
                  canvas: getCanvasSummary(),
                },
                null,
                2
              ),
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
          extras: Object.fromEntries(
            Object.entries(cell).filter(
              ([k]) =>
                ![
                  "row",
                  "col",
                  "rowSpan",
                  "colSpan",
                  "visualType",
                  "title",
                  "bindings",
                ].includes(k)
            )
          ),
        };
      });

      // Validate the planned layout against existing page visuals
      const existingIds = ctx.project.listVisualIds(pageId);
      const existingWireframe: WireframeVisual[] = existingIds.map((vid) => {
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

      const plannedWireframe: WireframeVisual[] = plan.map((p) => ({
        id: p.slotRef,
        visualType: p.visualType,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        title: p.title,
      }));

      const outcome = runLayoutValidation(
        [...existingWireframe, ...plannedWireframe],
        strictLayout
      );

      // Sum-check: widths should add up exactly (defence-in-depth).
      const sumW = geom.widths.reduce((a, b) => a + b, 0) + (cols - 1) * gaps;
      const sumH = geom.heights.reduce((a, b) => a + b, 0) + (rows - 1) * gaps;
      const expectedW = CANVAS.width - m.left - m.right;
      const expectedH =
        CANVAS.height - m.top - m.bottom - (reserveBannerRow ? CANVAS.bannerHeight + gaps : 0);

      // Shared response prelude — identical for plan + commit paths.
      const prelude = {
        pageId,
        canvas: getCanvasSummary(),
        grid: { rows, cols, gaps, margins: m, reserveBannerRow },
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
      };

      // -------- PLAN MODE --------
      if (planOnly !== false) {
        const response = {
          success: outcome.proceed,
          mode: "plan" as const,
          planOnly: true,
          ...prelude,
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
            ? "Plan validated. Call layout_grid again with planOnly:false to write the visuals in one call."
            : "Fix the layoutErrors above and call layout_grid again.",
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        };
      }

      // -------- COMMIT MODE (planOnly: false) --------

      // Layout validation gates commit. Strict mode rejects on any error;
      // warn mode proceeds with warnings attached.
      if (!outcome.proceed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  mode: "commit" as const,
                  planOnly: false,
                  error: "layout_validation_failed",
                  hint:
                    "Set strictLayout:false to proceed with warnings, or fix the positions per `suggestion`.",
                  ...prelude,
                  plan,
                  layoutErrors: outcome.errors,
                  layoutWarnings: outcome.warnings,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Binding validation — flatten bindings across every cell.
      const allBindings: Array<{ bucket: string; fields: FieldSpecInput[] }> = [];
      for (const cell of cells) {
        if (!cell.bindings) continue;
        for (const b of cell.bindings) {
          // Cells hold opaque bindings (typed as unknown[] in the schema).
          // runBindingValidation accepts the same shape add_visual uses;
          // we trust-but-verify here and let it emit structured errors.
          const bb = b as { bucket?: string; fields?: FieldSpecInput[] };
          if (bb.bucket && Array.isArray(bb.fields)) {
            allBindings.push({ bucket: bb.bucket, fields: bb.fields });
          }
        }
      }
      const bv = runBindingValidation(ctx.project, allBindings, params.strictBindings);
      if (!bv.proceed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  mode: "commit" as const,
                  planOnly: false,
                  error: bv.message,
                  bindingErrors: bv.errors,
                  bindingMode: bv.mode,
                  ...prelude,
                  plan,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Write each cell as a visual. Reuse createAndSaveVisual — same path
      // add_visual uses, so formatting/bindings/slicer semantics match 1:1.
      // z-order: grow by 1000 per visual starting above the existing max.
      let maxZ = 0;
      for (const vid of existingIds) {
        const v = ctx.project.getVisual(pageId, vid);
        if (v.position.z > maxZ) maxZ = v.position.z;
      }

      const written: Array<{
        visualId: string;
        visualType: string;
        slotRef: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        const spec: VisualSpec = {
          ...(p.extras as Partial<VisualSpec>),
          visualType: p.visualType,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          title: p.title,
          bindings: (p.bindings ?? undefined) as VisualSpec["bindings"],
        };
        const result = createAndSaveVisual(ctx.project, pageId, spec, maxZ + (i + 1) * 1000);
        written.push({
          visualId: result.visualId,
          visualType: result.visualType,
          slotRef: p.slotRef,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        });
      }

      invalidateCache();

      const commitResponse: Record<string, unknown> = {
        success: true,
        mode: "commit" as const,
        planOnly: false,
        ...prelude,
        created: params.includeTypes ? written : written.map((w) => w.visualId),
        validated: {
          ok: true,
          mode: outcome.mode,
          errors: 0,
          warnings: outcome.warnings.length,
        },
      };
      if (outcome.warnings.length > 0) commitResponse.layoutWarnings = outcome.warnings;
      if (bv.errors.length > 0) {
        commitResponse.bindingWarnings = bv.errors;
        commitResponse.bindingWarningMessage = bv.message;
      }
      if (isNoteworthySkip(bv.skipReason)) {
        commitResponse.bindingValidation = {
          skipped: bv.skipReason,
          note: "Bindings were NOT checked against the semantic model. Double-check field names — a typo will load silently and render nothing.",
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(commitResponse, null, 2) }],
      };
    }
  );
}
