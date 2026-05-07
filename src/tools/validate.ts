// ═══════════════════════════════════════════════════════════════════════════════
// pbir_validate_wireframe — expose the layout validator over MCP
//
// Thin wrapper around `validateWireframe()` from src/wireframe-validator.ts.
// Reads visuals off-disk for the requested page (or every page when
// scope:"report") and returns the structured WireframeReport per page.
//
// Same checks the unit tests in scripts/test-wireframe-validator.js run —
// margins, gaps, overlaps, banner geometry, off-canvas, column alignment.
// Read-only.
// ═══════════════════════════════════════════════════════════════════════════════

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  validateWireframe,
  type WireframeVisual,
  type WireframeReport,
} from "../wireframe-validator.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { ok, fail } from "../helpers/mcpResult.js";

/**
 * Build the WireframeVisual[] list for a page by walking visual.json files
 * on disk through the project helpers. Exported so other tools (and unit
 * tests) can reuse the same path.
 */
export function buildPageWireframe(
  project: { listVisualIds: (p: string) => string[]; getVisual: (p: string, v: string) => { visual: { visualType: string }; position: { x: number; y: number; width: number; height: number } } },
  pageId: string
): WireframeVisual[] {
  const ids = project.listVisualIds(pageId);
  return ids.map((vid) => {
    const v = project.getVisual(pageId, vid);
    return {
      id: vid,
      visualType: v.visual.visualType,
      x: v.position.x,
      y: v.position.y,
      width: v.position.width,
      height: v.position.height,
    };
  });
}

function pageDisplayName(project: { getPage: (p: string) => { displayName?: string } }, pageId: string): string {
  try {
    return project.getPage(pageId).displayName || pageId;
  } catch {
    return pageId;
  }
}

/** Public response shape for one page. */
export interface PageValidationEntry {
  pageId: string;
  displayName: string;
  report: WireframeReport;
}

export function registerValidateTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "pbir_validate_wireframe",
    "Validate a page's (or the whole report's) layout against the wireframe rules — margins, gaps, overlap, off-canvas, banner geometry. Returns errors + warnings per visual plus stats (visual count, coverage, bottom edge). Read-only. Pair with pbir_audit_theme_compliance for full project verification.",
    {
      pageId: z.string().optional().describe("Auto-resolved when scope:'page' and only one page exists. Ignored when scope:'report'."),
      scope: z.enum(["page", "report"]).optional().default("page").describe("'page' validates a single page; 'report' validates every page."),
    },
    { readOnlyHint: true, openWorldHint: false } as Record<string, unknown>,
    async (params: { pageId?: string; scope?: "page" | "report" }) => {
      const guard = requireProject(ctx);
      if (guard) return guard;

      const scope = params.scope ?? "page";

      if (scope === "report") {
        const pageIds = ctx.project.listPageIds();
        const pages: PageValidationEntry[] = pageIds.map((pid) => {
          const visuals = buildPageWireframe(ctx.project, pid);
          const report = validateWireframe(visuals);
          return { pageId: pid, displayName: pageDisplayName(ctx.project, pid), report };
        });
        const totalErrors = pages.reduce((s, p) => s + p.report.stats.errors, 0);
        const totalWarnings = pages.reduce((s, p) => s + p.report.stats.warnings, 0);
        const pagesWithErrors = pages.filter((p) => p.report.stats.errors > 0).length;
        return ok({
          scope: "report",
          pages,
          reportSummary: { totalErrors, totalWarnings, pagesWithErrors, pageCount: pages.length },
        });
      }

      // scope === "page"
      // Validate pageId — if explicitly passed but missing, return a clean fail
      // envelope listing available ids (NOT a -32602).
      if (params.pageId) {
        const known = ctx.project.listPageIds();
        if (!known.includes(params.pageId)) {
          return fail(`page_not_found: ${params.pageId}`, {
            availableIds: known,
            hint: "Pass a pageId from availableIds, or omit pageId to auto-resolve.",
          });
        }
      }

      const rp = resolvePageId(ctx.project, params.pageId);
      if (!rp.resolved) return rp.errorResponse;
      const pageId = rp.pageId;

      const visuals = buildPageWireframe(ctx.project, pageId);
      const report = validateWireframe(visuals);

      return ok({
        scope: "page",
        pageId,
        displayName: pageDisplayName(ctx.project, pageId),
        report,
      });
    }
  );
}
