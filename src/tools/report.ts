import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { execFileSync, spawn } from "child_process";
import { generateId, columnRef } from "../pbir.js";
import type { PageDefinition, ExtensionEntity } from "../pbir.js";
import type { ServerContext } from "../context.js";
import { requireProject } from "../context.js";
import { invalidateCache, findSemanticModelPath } from "../model-usage.js";
import { extractVisualTitle } from "../helpers/extractTitle.js";
import { ok, fail } from "../helpers/mcpResult.js";
import { getCanvasSummary } from "../helpers/layoutValidation.js";
import { buildSkillsIndexBanner } from "./guide.js";
import { resolvePageId } from "../helpers/resolvePage.js";
import { cachedRead, invalidateScope, invalidateAll } from "../helpers/readCache.js";

export function registerReportTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: pbir_set_report — switch report at runtime
  // ============================================================
  server.tool(
    "pbir_set_report",
    "Connect to a different Power BI report (.Report folder or parent .pbip project folder). Use this to switch reports mid-session without restarting the server.",
    {
      path: z.string().describe("Absolute path to the .Report folder or the parent folder containing a .pbip project"),
    },
    {"openWorldHint":false},
    async ({ path: targetPath }) => {
      const result = ctx.connectReport(targetPath);
      if (result.success === false) {
        return fail(result.error ?? "Failed to connect to report", { path: targetPath });
      }
      invalidateAll();
      // Append the skills-index banner so every new session gets the index +
      // the always-inline wireframes + report-design content at connect time.
      // Clients that ignore the pbir-instructions MCP resource still see it
      // because it rides along in the tool response.
      return {
        content: [
          { type: "text", text: JSON.stringify(result) },
          { type: "text", text: buildSkillsIndexBanner() },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_get_report — show currently connected report
  // ============================================================
  server.tool(
    "pbir_get_report",
    "Show the currently connected report path. Includes `hasSemanticModel: boolean` — true when a sibling `.SemanticModel/` folder exists. Check this before calling `pbir_model_usage`.",
    {},
    {"readOnlyHint":true,"openWorldHint":false},
    async () =>
      cachedRead("pbir_get_report", {}, ["report"], () => {
        const reportPath = ctx.getReportPath();
        let hasSemanticModel = false;
        if (reportPath) {
          try {
            // findSemanticModelPath throws when no .SemanticModel sibling
            // exists or when the definition.pbir pointer is broken. Both
            // paths converge on hasSemanticModel=false — agents should call
            // this before pbir_model_usage to avoid the noisy throw.
            const modelPath = findSemanticModelPath(reportPath);
            hasSemanticModel = !!modelPath && fs.existsSync(modelPath);
          } catch {
            hasSemanticModel = false;
          }
        }
        return {
          reportPath: reportPath || "No report connected",
          hasSemanticModel,
        };
      })
  );

  // ============================================================
  // TOOL: pbir_list_pages
  // ============================================================
  server.tool(
    "pbir_list_pages",
    "List pages (paginated). Slim default returns id/displayName/width/height/visualCount/isActive/hidden; slim:false adds displayOption. includeVisuals:true (or pageId) embeds per-visual summaries. Top-level `totalVisualCount` sums the FULL set, not just the visible slice. For cross-page sweeps prefer one `includeVisuals:true` call over fanning out per-page pbir_list_visuals.",
    {
      slim: z.boolean().optional().default(true),
      includeVisuals: z.boolean().optional().default(false).describe("Embed slim per-visual entries on each page."),
      pageId: z.string().optional().describe("Scope to a single page (implies includeVisuals; limit/offset ignored)."),
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    },
    {"readOnlyHint":true,"openWorldHint":false},
    async ({ slim, includeVisuals, pageId, limit, offset }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const scopes: string[] = ["report"];
      if (pageId) scopes.push(`page:${pageId}`);
      else scopes.push("pages");
      const finalLimit = limit ?? 100;
      const finalOffset = offset ?? 0;
      return cachedRead("pbir_list_pages", { slim, includeVisuals, pageId, limit: finalLimit, offset: finalOffset }, scopes, () => {
      const meta = ctx.project.getPagesMetadata();
      const ids = pageId ? [pageId] : meta.pageOrder;
      const withVisuals = includeVisuals || !!pageId;

      const allPages = ids.map((id) => {
        const page = ctx.project.getPage(id);
        const visualIds = ctx.project.listVisualIds(id);
        const base: Record<string, unknown> = {
          id,
          displayName: page.displayName,
          width: page.width,
          height: page.height,
          visualCount: visualIds.length,
          isActive: id === meta.activePageName,
          hidden: page.visibility === "HiddenInViewMode",
        };
        if (!slim) {
          base.displayOption = page.displayOption;
        }
        if (withVisuals) {
          base.visuals = visualIds.map((vid) => {
            const v = ctx.project.getVisual(id, vid);
            const titleValue = extractVisualTitle(v.visual.visualContainerObjects);
            const entry: Record<string, unknown> = {
              id: vid,
              type: v.visual.visualType,
              x: v.position.x,
              y: v.position.y,
              w: v.position.width,
              h: v.position.height,
            };
            if (titleValue) entry.title = titleValue;
            return entry;
          });
        }
        return base;
      });

      // totalVisualCount is summed across the FULL page set (not the
      // visible slice when paginated) so the agent can make
      // cross-report decisions without paging through every page.
      const totalVisualCount = allPages.reduce(
        (acc, p) => acc + (typeof p.visualCount === "number" ? p.visualCount : 0),
        0
      );

      // Single-page lookup — pagination is irrelevant. Return that one page
      // regardless of limit/offset.
      if (pageId) {
        return {
          pageCount: allPages.length,
          pages: allPages,
          total: 1,
          total_count: 1,
          totalVisualCount,
          truncated: false,
          has_more: false,
          nextOffset: null,
          next_offset: null,
          canvas: getCanvasSummary(),
        };
      }

      const total = allPages.length;
      const sliced = allPages.slice(finalOffset, finalOffset + finalLimit);
      const truncated = total > finalOffset + sliced.length;
      const nextOffset = truncated ? finalOffset + sliced.length : null;
      // Canvas constants help the LLM place visuals without guessing —
      // cheap to include, enormous payoff on layout accuracy.
      // Canonical aliases (has_more/next_offset/total_count) ship alongside
      // the legacy fields per MCP best-practices doc.
      return {
        pages: sliced,
        total,
        total_count: total,
        totalVisualCount,
        truncated,
        has_more: truncated,
        nextOffset,
        next_offset: nextOffset,
        canvas: getCanvasSummary(),
      };
      });
    }
  );

  // ============================================================
  // TOOL: pbir_create_page
  // ============================================================
  server.tool(
    "pbir_create_page",
    "Create a new page in the report. Supports standard, tooltip, and drillthrough page types.",
    {
      displayName: z.string().describe("Display name for the page"),
      type: z.enum(["standard", "tooltip"]).optional().default("standard")
        .describe("Page type — tooltip pages are small overlay pages (320x240) hidden from nav"),
      width: z.number().optional().describe("Page width (default 1280, or 320 for tooltip)"),
      height: z.number().optional().describe("Page height (default 720, or 240 for tooltip)"),
      displayOption: z
        .enum(["FitToPage", "FitToWidth", "ActualSize"])
        .optional()
        .describe("Display option (default FitToPage, or ActualSize for tooltip)"),
      drillthrough: z.object({
        entity: z.string().describe("Table name for the drillthrough field"),
        property: z.string().describe("Column name for the drillthrough field"),
      }).optional().describe("Drillthrough field — makes this a drillthrough page filtered by this field"),
    },
    {"openWorldHint":false},
    async ({ displayName, type, width, height, displayOption, drillthrough }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const isTooltip = type === "tooltip";

      // Apply tooltip defaults when not explicitly overridden
      const resolvedWidth = width ?? (isTooltip ? 320 : 1280);
      const resolvedHeight = height ?? (isTooltip ? 240 : 720);
      const resolvedDisplayOption = displayOption ?? (isTooltip ? "ActualSize" : "FitToPage");

      const pageId = generateId();
      const page: PageDefinition = {
        $schema:
          "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
        name: pageId,
        displayName,
        displayOption: resolvedDisplayOption,
        height: resolvedHeight,
        width: resolvedWidth,
      };

      // Tooltip page: set type and config for hidden tooltip behavior
      if (isTooltip) {
        page.type = "Tooltip";
        page.config = { visibility: "HiddenInViewMode" };
      }

      // Drillthrough: add a categorical filter with isAllFilter
      if (drillthrough) {
        const field = columnRef(drillthrough.entity, drillthrough.property);
        page.filterConfig = {
          filters: [{
            name: generateId(),
            field,
            type: "Categorical",
            isAllFilter: true,
          }],
        };
      }

      ctx.project.savePage(pageId, page);

      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder.push(pageId);
      ctx.project.savePagesMetadata(meta);

      invalidateScope("pages");
      invalidateScope("report");

      return {
        content: [
          { type: "text", text: JSON.stringify({
            success: true,
            pageId,
            displayName,
            type: isTooltip ? "tooltip" : "standard",
            drillthrough: !!drillthrough,
            // Echo canvas constants on create — LLM now knows exactly what
            // usable area it has for placing visuals on the new page.
            canvas: isTooltip ? null : getCanvasSummary(),
          }, null, 2) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_rename_page
  // ============================================================
  server.tool(
    "pbir_rename_page",
    "Rename an existing page's display name. Does not change its internal page ID, or any bookmarks/navigation targets that reference it by ID.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      displayName: z.string().describe("New display name"),
    },
    {"openWorldHint":false},
    async ({ pageId, displayName }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const page = ctx.project.getPage(pageId);
      page.displayName = displayName;
      ctx.project.savePage(pageId, page);
      invalidateScope("pages");
      invalidateScope(`page:${pageId}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, pageId, displayName }) }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_delete_page
  // ============================================================
  server.tool(
    "pbir_delete_page",
    "Permanently delete a page and every visual on it. Irreversible once written to disk — there's no undo.",
    {
      pageId: z.string().describe("The page ID to delete"),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ pageId }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder = meta.pageOrder.filter((id) => id !== pageId);
      if (meta.activePageName === pageId && meta.pageOrder.length > 0) {
        meta.activePageName = meta.pageOrder[0];
      }
      ctx.project.savePagesMetadata(meta);
      ctx.project.deletePage(pageId);
      invalidateCache();
      invalidateScope("pages");
      invalidateScope(`page:${pageId}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, deletedPageId: pageId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_reorder_pages
  // ============================================================
  server.tool(
    "pbir_reorder_pages",
    "Set the page order. `pageOrder` must list EVERY existing page ID exactly once (a full permutation) — partial lists are rejected.",
    {
      pageOrder: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(z.string())).describe("Array of page IDs in desired order"),
    },
    {"openWorldHint":false},
    async ({ pageOrder }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const meta = ctx.project.getPagesMetadata();
      // Validate: supplied order must be a permutation of existing page IDs.
      // Same length + same set (no duplicates, no extras, no missing).
      const existing = meta.pageOrder;
      const sameLength = pageOrder.length === existing.length;
      const suppliedSet = new Set(pageOrder);
      const noDuplicates = suppliedSet.size === pageOrder.length;
      const sameSet = noDuplicates && existing.every((id) => suppliedSet.has(id));
      if (!sameLength || !sameSet) {
        return fail("pageOrder must be a permutation of existing page ids", { existing, supplied: pageOrder });
      }
      meta.pageOrder = pageOrder;
      ctx.project.savePagesMetadata(meta);
      invalidateScope("pages");
      return { content: [{ type: "text", text: JSON.stringify({ success: true, pageOrder }) }] };
    }
  );

  // ============================================================
  // TOOL: pbir_set_active_page
  // ============================================================
  server.tool(
    "pbir_set_active_page",
    "Set which page opens by default when the report is first loaded in Power BI Desktop or the Service.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ pageId }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const meta = ctx.project.getPagesMetadata();
      meta.activePageName = pageId;
      ctx.project.savePagesMetadata(meta);
      invalidateScope("pages");
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, activePageName: pageId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_set_page_visibility
  // ============================================================
  server.tool(
    "pbir_set_page_visibility",
    "Show or hide a page in the navigation pane. Hidden pages still work for drillthrough.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      hidden: z.coerce.boolean(),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ pageId, hidden }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const page = ctx.project.getPage(pageId);
      if (hidden) {
        page.visibility = "HiddenInViewMode";
      } else {
        delete page.visibility;
      }
      ctx.project.savePage(pageId, page);
      invalidateScope("pages");
      invalidateScope(`page:${pageId}`);
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, pageId, hidden }) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_get_report_settings
  // ============================================================
  server.tool(
    "pbir_get_report_settings",
    "Get the report-level settings and theme configuration",
    {},
    {"readOnlyHint":true,"openWorldHint":false},
    async () => {
      const _g = requireProject(ctx); if (_g) return _g;
      const report = ctx.project.getReport();
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: pbir_update_report_settings
  // ============================================================
  const VALID_REPORT_SETTINGS = new Set([
    "useStylableVisualContainerHeader",
    "exportDataMode",
    "defaultDrillFilterOtherVisuals",
    "allowChangeFilterTypes",
    "useEnhancedTooltips",
    "useDefaultAggregateDisplayName",
    "isPaginatedReportMode",
    "hideVisualContainerHeader",
    "useNewFilterPaneExperience",
    "optOutNewFilterPaneExperience",
    "persistentFilters",
    "keyboardNavigationEnabled",
  ]);

  server.tool(
    "pbir_update_report_settings",
    "Merge report-level settings. Keys: useStylableVisualContainerHeader, useEnhancedTooltips, exportDataMode (0|1), persistentFilters, keyboardNavigationEnabled, defaultDrillFilterOtherVisuals, allowChangeFilterTypes, useDefaultAggregateDisplayName.",
    {
      settings: z.record(z.string(), z.unknown()),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ settings }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const invalid = Object.keys(settings).filter((k) => !VALID_REPORT_SETTINGS.has(k));
      if (invalid.length > 0) {
        return fail(`Invalid setting keys: ${invalid.join(", ")}. Valid keys: ${[...VALID_REPORT_SETTINGS].join(", ")}`);
      }
      const report = ctx.project.getReport();
      report.settings = { ...report.settings, ...settings };
      ctx.project.saveReport(report);
      invalidateScope("report");
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, settings: report.settings }) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_update_page_size
  // ============================================================
  server.tool(
    "pbir_update_page_size",
    "Update the page's width/height and/or displayOption. Does NOT reposition or resize the visuals already on it — they keep their x/y/width/height, so shrinking the page can push them outside the new canvas.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      width: z.number().optional(),
      height: z.number().optional(),
      displayOption: z.enum(["FitToPage", "FitToWidth", "ActualSize"]).optional(),
    },
    {"openWorldHint":false},
    async ({ pageId, width, height, displayOption }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const page = ctx.project.getPage(pageId);
      if (width !== undefined) page.width = width;
      if (height !== undefined) page.height = height;
      if (displayOption !== undefined) page.displayOption = displayOption;
      ctx.project.savePage(pageId, page);
      invalidateScope("pages");
      invalidateScope(`page:${pageId}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, pageId, width: page.width, height: page.height }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_auto_layout
  // ============================================================
  server.tool(
    "pbir_auto_layout",
    "Auto-arrange EXISTING visuals already on a page into a simple equal-size grid (evenly split by rows/cols/padding). Use this to tidy up visuals that are already placed. To PLAN AND CREATE new visuals in a precise grid (per-cell spans, bindings, validated margins/gaps) use `pbir_layout_grid` instead.",
    {
      pageId: z.string().describe("The page ID"),
      columns: z.number().optional().default(3),
      padding: z.number().optional().default(10),
      marginTop: z.number().optional().default(10),
      marginLeft: z.number().optional().default(10),
    },
    {"openWorldHint":false},
    async ({ pageId, columns, padding, marginTop, marginLeft }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const page = ctx.project.getPage(pageId);
      const visualIds = ctx.project.listVisualIds(pageId);

      if (visualIds.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: "No visuals to layout" }) }],
        };
      }

      const availableWidth = page.width - marginLeft * 2;
      const availableHeight = page.height - marginTop * 2;
      const rows = Math.ceil(visualIds.length / columns);
      const cellWidth = (availableWidth - padding * (columns - 1)) / columns;
      const cellHeight = (availableHeight - padding * (rows - 1)) / rows;

      let zOrder = 0;
      visualIds.forEach((vid, i) => {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const visual = ctx.project.getVisual(pageId, vid);
        visual.position.x = marginLeft + col * (cellWidth + padding);
        visual.position.y = marginTop + row * (cellHeight + padding);
        visual.position.width = cellWidth;
        visual.position.height = cellHeight;
        visual.position.z = zOrder;
        visual.position.tabOrder = zOrder;
        zOrder += 1000;
        ctx.project.saveVisual(pageId, vid, visual);
      });

      invalidateScope(`page:${pageId}`);
      invalidateScope("pages");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              layout: { columns, rows, cellWidth, cellHeight, visualCount: visualIds.length },
            }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_duplicate_page
  // ============================================================
  server.tool(
    "pbir_duplicate_page",
    "Duplicate an entire page with all its visuals to a new page",
    {
      pageId: z.string().describe("The source page ID to duplicate"),
      displayName: z
        .string()
        .optional()
        .describe("Display name for the new page (defaults to 'Copy of <original>')"),
    },
    {"openWorldHint":false},
    async ({ pageId, displayName }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const sourcePage = ctx.project.getPage(pageId);
      const newPageId = generateId();

      const newPage: PageDefinition = {
        ...JSON.parse(JSON.stringify(sourcePage)),
        name: newPageId,
        displayName: displayName || `Copy of ${sourcePage.displayName}`,
      };
      ctx.project.savePage(newPageId, newPage);

      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder.push(newPageId);
      ctx.project.savePagesMetadata(meta);

      const visualIds = ctx.project.listVisualIds(pageId);
      const newVisualIds: string[] = [];
      for (const vid of visualIds) {
        const original = ctx.project.getVisual(pageId, vid);
        const newVid = generateId();
        const duplicate = JSON.parse(JSON.stringify(original));
        duplicate.name = newVid;
        if (duplicate.filterConfig?.filters) {
          for (const f of duplicate.filterConfig.filters) {
            f.name = generateId();
          }
        }
        ctx.project.saveVisual(newPageId, newVid, duplicate);
        newVisualIds.push(newVid);
      }

      invalidateCache();
      invalidateScope("pages");
      invalidateScope(`page:${newPageId}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              newPageId,
              displayName: newPage.displayName,
              visualCount: newVisualIds.length,
            }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_reload_report
  // ============================================================
  server.tool(
    "pbir_reload_report",
    "Reload the report in Power BI Desktop by closing and reopening the .pbip file. SAFETY: closes PBIDesktop.exe, so any unsaved work in Desktop (including modeling-MCP measures/relationships not yet flushed by Desktop autosave) is LOST. Requires confirm:true to proceed — otherwise returns a save-first warning for the agent to relay to the user.",
    {
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Must be true to actually reload. When false/omitted, the tool returns a save-first warning instead of killing PBI Desktop. The agent should relay the warning, wait for user confirmation, then retry with confirm:true."
        ),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ confirm }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const reportPath = ctx.getReportPath();
      if (!reportPath) {
        return fail("No report connected. Use pbir_set_report first.");
      }

      // Save-first gate. Unsaved modeling work in PBI Desktop is invisible
      // to this MCP — the only safe default is to make the agent ask the
      // user to Ctrl+S before we force-close the editor.
      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                requiresConfirmation: true,
                warning:
                  "About to close PBI Desktop. Unsaved work will be lost, including:\n" +
                  "  • Measures / relationships / columns created this session via the modeling MCP\n" +
                  "    (they're on disk, but PBI Desktop may have newer in-memory edits on top)\n" +
                  "  • Any manual edits in PBI Desktop not yet Ctrl+S'd\n\n" +
                  "Save first: focus PBI Desktop → Ctrl+S → reply \"reload\" to proceed.\n" +
                  "To skip this prompt, call pbir_reload_report with confirm: true.\n\n" +
                  "After reload, run pbir_model_usage to verify modeling changes survived before binding new visuals to them.",
                nextAction: "Retry with confirm: true once the user has saved PBI Desktop.",
              }),
            },
          ],
        };
      }

      const parentDir = path.dirname(reportPath);
      const pbipFiles = fs.readdirSync(parentDir).filter((f) => f.endsWith(".pbip"));

      if (pbipFiles.length === 0) {
        return fail("No .pbip file found");
      }

      // Defense in depth: reject pbip filenames containing shell metacharacters
      // before we go anywhere near the launcher. parentDir came from
      // path.dirname() on a validated .Report folder path, so it's safe; the
      // filename is the only attacker-controlled part.
      const pbipName = pbipFiles[0];
      if (!/^[\w\-. ()]+\.pbip$/i.test(pbipName)) {
        return fail(`Refusing to launch file with suspicious name: ${pbipName}`);
      }
      const pbipPath = path.join(parentDir, pbipName);

      try {
        try {
          // execFileSync with argv — no shell interpolation. taskkill args
          // are fully static.
          execFileSync("taskkill", ["/IM", "PBIDesktop.exe", "/F"], { stdio: "ignore" });
        } catch {
          // PBI Desktop might not be running — that's fine
        }

        // Brief pause so PBI Desktop finishes tearing down file locks before
        // we relaunch. Using setTimeout inside the async handler — no shell.
        await new Promise((r) => setTimeout(r, 3000));

        // Launch via spawn with argv. shell:false means pbipPath is passed as
        // a single argv element — no command injection possible. cmd.exe /c
        // start is the canonical Windows "open with default app" incantation
        // ("" is the required empty window title).
        const child = spawn("cmd.exe", ["/c", "start", "", pbipPath], {
          stdio: "ignore",
          detached: true,
          windowsVerbatimArguments: false,
        });
        child.unref();

        return ok({ message: `Reopening ${pbipName} in Power BI Desktop` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(msg);
      }
    }
  );

  // ============================================================
  // TOOL: pbir_set_filter_pane
  // ============================================================
  server.tool(
    "pbir_set_filter_pane",
    "Show or hide the filter pane.",
    {
      visible: z.boolean(),
      expanded: z.boolean().optional().default(true),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ visible, expanded }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const report = ctx.project.getReport();

      if (!report.objects) report.objects = {};
      report.objects.outspacePane = [{
        properties: {
          visible: { expr: { Literal: { Value: visible ? "true" : "false" } } },
          expanded: { expr: { Literal: { Value: expanded ? "true" : "false" } } },
        },
      }];

      ctx.project.saveReport(report);
      invalidateScope("report");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, filterPane: { visible, expanded } }),
        }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_manage_extension_measures
  // ============================================================
  server.tool(
    "pbir_manage_extension_measures",
    "Manage extension measures (report-level DAX in reportExtensions.json). Empty file crashes PBI Desktop — tool auto-deletes when empty.",
    {
      operation: z.enum(["list", "add", "remove"]),
      tableName: z.string().optional().default("_Measures"),
      measureName: z.string().optional(),
      expression: z.string().optional().describe("DAX (for add)"),
      dataType: z.string().optional().default("Text").describe("Text/Double/Int64/Boolean/DateTime"),
    },
    {"destructiveHint":true,"openWorldHint":false},
    async ({ operation, tableName, measureName, expression, dataType }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      if (operation === "list") {
        const ext = ctx.project.getReportExtensions();
        if (!ext?.entities?.length) {
          return { content: [{ type: "text", text: JSON.stringify({ success: true, measures: [], count: 0 }) }] };
        }
        const measures = ext.entities.flatMap((e) =>
          (e.measures || []).map((m) => ({ table: e.name, name: m.name, expression: m.expression, dataType: m.dataType }))
        );
        return { content: [{ type: "text", text: JSON.stringify({ success: true, measures, count: measures.length }) }] };
      }

      if (operation === "add") {
        if (!measureName || !expression) {
          return fail("add requires: measureName, expression");
        }

        let ext = ctx.project.getReportExtensions();
        if (!ext) {
          ext = {
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportExtension/1.0.0/schema.json",
            name: "extension",
            entities: [],
          };
        }

        // Find or create the entity (table)
        let entity: ExtensionEntity | undefined = ext.entities.find((e) => e.name === tableName);
        if (!entity) {
          entity = { name: tableName, measures: [] };
          ext.entities.push(entity);
        }
        if (!entity.measures) entity.measures = [];

        // Remove existing measure with same name (update)
        entity.measures = entity.measures.filter((m) => m.name !== measureName);

        entity.measures.push({
          name: measureName,
          expression,
          dataType: dataType || "Text",
        });

        ctx.project.saveReportExtensions(ext);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, operation: "add", table: tableName, measure: measureName }) }] };
      }

      if (operation === "remove") {
        if (!measureName) {
          return fail("remove requires: measureName");
        }

        const ext = ctx.project.getReportExtensions();
        if (!ext?.entities?.length) {
          return fail("No extension measures exist");
        }

        let removed = false;
        for (const entity of ext.entities) {
          const before = entity.measures?.length ?? 0;
          if (entity.measures) {
            entity.measures = entity.measures.filter((m) => m.name !== measureName);
            if (entity.measures.length < before) removed = true;
          }
        }

        // Clean up empty entities
        ext.entities = ext.entities.filter((e) => (e.measures?.length ?? 0) > 0);

        // Save (auto-deletes file if empty)
        ctx.project.saveReportExtensions(ext);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, operation: "remove", measure: measureName, removed }) }] };
      }

      return fail("Unknown operation");
    }
  );

  // ============================================================
  // TOOL: pbir_set_page_background
  // ============================================================
  server.tool(
    "pbir_set_page_background",
    "Set the page canvas background and/or wallpaper. Hex color (#0D1117). Transparency 0-100.",
    {
      pageId: z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
      color: z.string().optional().describe("Canvas background color (hex)"),
      transparency: z.number().min(0).max(100).optional().default(0),
      wallpaperColor: z.string().optional().describe("Color behind the canvas"),
      wallpaperTransparency: z.number().min(0).max(100).optional().default(0),
      clear: z.boolean().optional().describe("Remove all background/wallpaper settings"),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ pageId, color, transparency, wallpaperColor, wallpaperTransparency, clear }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const r = resolvePageId(ctx.project, pageId);
      if (!r.resolved) return r.errorResponse;
      pageId = r.pageId;
      const page = ctx.project.getPage(pageId);
      if (!page.objects) page.objects = {};

      if (clear) {
        delete (page.objects as Record<string, unknown>).background;
        delete (page.objects as Record<string, unknown>).wallpaper;
        if (Object.keys(page.objects).length === 0) delete page.objects;
        ctx.project.savePage(pageId, page);
        invalidateScope(`page:${pageId}`);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, pageId, cleared: true }) }] };
      }

      // Helper to build a color property in PBIR format
      const colorProp = (hex: string) => ({
        solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } },
      });
      const intProp = (val: number) => ({
        expr: { Literal: { Value: `${val}D` } },
      });

      // Canvas background
      if (color) {
        (page.objects as Record<string, unknown>).background = [{
          properties: {
            show: { expr: { Literal: { Value: "true" } } },
            color: colorProp(color),
            transparency: intProp(transparency ?? 0),
          },
        }];
      }

      // Wallpaper (area behind canvas)
      if (wallpaperColor) {
        (page.objects as Record<string, unknown>).wallpaper = [{
          properties: {
            show: { expr: { Literal: { Value: "true" } } },
            color: colorProp(wallpaperColor),
            transparency: intProp(wallpaperTransparency ?? 0),
          },
        }];
      }

      ctx.project.savePage(pageId, page);
      invalidateScope(`page:${pageId}`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            pageId,
            background: color || undefined,
            wallpaper: wallpaperColor || undefined,
          }),
        }],
      };
    }
  );

  // ============================================================
  // TOOL: pbir_set_visual_interaction
  // ============================================================
  server.tool(
    "pbir_set_visual_interaction",
    "Set cross-filter interaction (Filter/Highlight/NoFilter) from source visual to target visual.",
    {
      pageId: z.string().describe("The page ID"),
      source: z.string(),
      target: z.string(),
      type: z.enum(["Filter", "Highlight", "NoFilter"]),
    },
    {"idempotentHint":true,"openWorldHint":false},
    async ({ pageId, source, target, type }) => {
      const _g = requireProject(ctx); if (_g) return _g;
      const page = ctx.project.getPage(pageId);

      // Initialize visualInteractions array if not present
      if (!page.visualInteractions) {
        page.visualInteractions = [];
      }

      // Find existing interaction between this source and target
      const existingIdx = page.visualInteractions.findIndex(
        (vi) => vi.source === source && vi.target === target
      );

      const interaction = { source, target, type };

      if (existingIdx >= 0) {
        // Update existing
        page.visualInteractions[existingIdx] = interaction;
      } else {
        // Add new
        page.visualInteractions.push(interaction);
      }

      ctx.project.savePage(pageId, page);
      invalidateScope(`page:${pageId}`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, pageId, source, target, interactionType: type }),
        }],
      };
    }
  );
}
