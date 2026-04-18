import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
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
export declare function computeGridGeometry(opts: {
    rows: number;
    cols: number;
    gap: number;
    margins: GridMargins;
    reserveBannerRow: boolean;
}): GridGeometry;
/**
 * Resolve a logical (row,col,rowSpan,colSpan) into absolute pixel geometry,
 * given the widths/heights computed by `computeGridGeometry`.
 */
export declare function cellRect(geom: GridGeometry, cell: GridRectInput): GridRect;
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
export declare function validateCellGrid(cells: ReadonlyArray<GridRectInput>, rows: number, cols: number): GridCellError[];
export declare function registerLayoutGridTool(server: McpServer, ctx: ServerContext): void;
