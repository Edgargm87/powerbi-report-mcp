import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { execFileSync, spawn } from "child_process";
import { generateId, columnRef } from "../pbir.js";
import type { PageDefinition, ExtensionEntity } from "../pbir.js";
import type { ServerContext } from "../context.js";
import { invalidateCache } from "../model-usage.js";
import { extractVisualTitle } from "../helpers/extractTitle.js";
import { ok, fail } from "../helpers/mcpResult.js";
import { getCanvasSummary } from "../helpers/layoutValidation.js";
import { buildSkillsIndexBanner } from "./guide.js";

export function registerReportTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: set_report — switch report at runtime
  // ============================================================
  server.tool(
    "set_report",
    "Connect to a different Power BI report (.Report folder or parent .pbip project folder). Use this to switch reports mid-session without restarting the server.",
    {
      path: z.string().describe("Absolute path to the .Report folder or the parent folder containing a .pbip project"),
    },
    async ({ path: targetPath }) => {
      const result = ctx.connectReport(targetPath);
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
  // TOOL: get_report — show currently connected report
  // ============================================================
  server.tool(
    "get_report",
    "Show the currently connected report path.",
    {},
    async () => {
      return {
        content: [
          { type: "text", text: JSON.stringify({ reportPath: ctx.getReportPath() || "No report connected" }) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: list_pages
  // ============================================================
  server.tool(
    "list_pages",
    "List all pages in the report. Slim mode (default) returns id, displayName, visualCount, isActive, hidden. Set slim=false for full details including width, height, displayOption.",
    {
      slim: z.boolean().optional().default(true).describe("Slim mode (default true) — omits width/height/displayOption to reduce token usage"),
    },
    async ({ slim }) => {
      const meta = ctx.project.getPagesMetadata();
      const pages = meta.pageOrder.map((id) => {
        const page = ctx.project.getPage(id);
        const visualCount = ctx.project.listVisualIds(id).length;
        const base = {
          id,
          displayName: page.displayName,
          visualCount,
          isActive: id === meta.activePageName,
          hidden: page.visibility === "HiddenInViewMode",
        };
        if (slim) return base;
        return { ...base, width: page.width, height: page.height, displayOption: page.displayOption };
      });
      // Canvas constants help the LLM place visuals without guessing —
      // cheap to include, enormous payoff on layout accuracy.
      return { content: [{ type: "text", text: JSON.stringify({ pages, canvas: getCanvasSummary() }, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: create_page
  // ============================================================
  server.tool(
    "create_page",
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
    async ({ displayName, type, width, height, displayOption, drillthrough }) => {
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
  // TOOL: rename_page
  // ============================================================
  server.tool(
    "rename_page",
    "Rename an existing page",
    {
      pageId: z.string().describe("The page ID to rename"),
      displayName: z.string().describe("New display name"),
    },
    async ({ pageId, displayName }) => {
      const page = ctx.project.getPage(pageId);
      page.displayName = displayName;
      ctx.project.savePage(pageId, page);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, pageId, displayName }) }],
      };
    }
  );

  // ============================================================
  // TOOL: delete_page
  // ============================================================
  server.tool(
    "delete_page",
    "Delete a page and all its visuals",
    {
      pageId: z.string().describe("The page ID to delete"),
    },
    async ({ pageId }) => {
      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder = meta.pageOrder.filter((id) => id !== pageId);
      if (meta.activePageName === pageId && meta.pageOrder.length > 0) {
        meta.activePageName = meta.pageOrder[0];
      }
      ctx.project.savePagesMetadata(meta);
      ctx.project.deletePage(pageId);
      invalidateCache();
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, deletedPageId: pageId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: reorder_pages
  // ============================================================
  server.tool(
    "reorder_pages",
    "Set the page order",
    {
      pageOrder: z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, z.array(z.string())).describe("Array of page IDs in desired order"),
    },
    async ({ pageOrder }) => {
      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder = pageOrder;
      ctx.project.savePagesMetadata(meta);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, pageOrder }) }] };
    }
  );

  // ============================================================
  // TOOL: set_active_page
  // ============================================================
  server.tool(
    "set_active_page",
    "Set which page is active (shown on open)",
    {
      pageId: z.string().describe("The page ID to set as active"),
    },
    async ({ pageId }) => {
      const meta = ctx.project.getPagesMetadata();
      meta.activePageName = pageId;
      ctx.project.savePagesMetadata(meta);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, activePageName: pageId }) }],
      };
    }
  );

  // ============================================================
  // TOOL: set_page_visibility
  // ============================================================
  server.tool(
    "set_page_visibility",
    "Show or hide a page in the report navigation pane. Hidden pages are not shown to report viewers but can still be used for drillthrough.",
    {
      pageId: z.string().describe("The page ID"),
      hidden: z.coerce.boolean().describe("true to hide the page, false to show it"),
    },
    async ({ pageId, hidden }) => {
      const page = ctx.project.getPage(pageId);
      if (hidden) {
        page.visibility = "HiddenInViewMode";
      } else {
        delete page.visibility;
      }
      ctx.project.savePage(pageId, page);
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, pageId, hidden }) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: get_report_settings
  // ============================================================
  server.tool(
    "get_report_settings",
    "Get the report-level settings and theme configuration",
    {},
    async () => {
      const report = ctx.project.getReport();
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    }
  );

  // ============================================================
  // TOOL: update_report_settings
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
    "update_report_settings",
    "Update report-level settings (merges with existing settings). Valid keys: useStylableVisualContainerHeader (boolean, modern visual headers), useEnhancedTooltips (boolean), exportDataMode (0=summarized, 1=summarized+underlying), persistentFilters (boolean, save filter selections), keyboardNavigationEnabled (boolean), defaultDrillFilterOtherVisuals, allowChangeFilterTypes, useDefaultAggregateDisplayName.",
    {
      settings: z
        .record(z.string(), z.unknown())
        .describe("Settings key-value pairs to merge into report.settings"),
    },
    async ({ settings }) => {
      const invalid = Object.keys(settings).filter((k) => !VALID_REPORT_SETTINGS.has(k));
      if (invalid.length > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Invalid setting keys: ${invalid.join(", ")}. Valid keys: ${[...VALID_REPORT_SETTINGS].join(", ")}` }) }],
        };
      }
      const report = ctx.project.getReport();
      report.settings = { ...report.settings, ...settings };
      ctx.project.saveReport(report);
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, settings: report.settings }) },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: update_page_size
  // ============================================================
  server.tool(
    "update_page_size",
    "Update the page dimensions",
    {
      pageId: z.string().describe("The page ID"),
      width: z.number().optional().describe("New width"),
      height: z.number().optional().describe("New height"),
      displayOption: z.enum(["FitToPage", "FitToWidth", "ActualSize"]).optional(),
    },
    async ({ pageId, width, height, displayOption }) => {
      const page = ctx.project.getPage(pageId);
      if (width !== undefined) page.width = width;
      if (height !== undefined) page.height = height;
      if (displayOption !== undefined) page.displayOption = displayOption;
      ctx.project.savePage(pageId, page);
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
  // TOOL: auto_layout
  // ============================================================
  server.tool(
    "auto_layout",
    "Automatically arrange all visuals on a page in a grid layout",
    {
      pageId: z.string().describe("The page ID"),
      columns: z.number().optional().default(3).describe("Number of columns in the grid"),
      padding: z.number().optional().default(10).describe("Padding between visuals"),
      marginTop: z.number().optional().default(10).describe("Top margin"),
      marginLeft: z.number().optional().default(10).describe("Left margin"),
    },
    async ({ pageId, columns, padding, marginTop, marginLeft }) => {
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
  // TOOL: duplicate_page
  // ============================================================
  server.tool(
    "duplicate_page",
    "Duplicate an entire page with all its visuals to a new page",
    {
      pageId: z.string().describe("The source page ID to duplicate"),
      displayName: z
        .string()
        .optional()
        .describe("Display name for the new page (defaults to 'Copy of <original>')"),
    },
    async ({ pageId, displayName }) => {
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
  // TOOL: get_page_summary
  // ============================================================
  server.tool(
    "get_page_summary",
    "Get pages with their visuals in one call — replaces list_pages + list_visuals. Returns slim visual list per page. Provide pageId to scope to one page.",
    {
      pageId: z.string().optional().describe("Scope to a single page. Omit for all pages."),
    },
    async ({ pageId }) => {
      const meta = ctx.project.getPagesMetadata();
      const ids = pageId ? [pageId] : meta.pageOrder;

      const pages = ids.map((id) => {
        const page = ctx.project.getPage(id);
        const visualIds = ctx.project.listVisualIds(id);
        const visuals = visualIds.map((vid) => {
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
        return {
          id,
          displayName: page.displayName,
          isActive: id === meta.activePageName,
          hidden: page.visibility === "HiddenInViewMode",
          visualCount: visualIds.length,
          visuals,
        };
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ pageCount: pages.length, pages, canvas: getCanvasSummary() }, null, 2) }],
      };
    }
  );

  // ============================================================
  // TOOL: reload_report
  // ============================================================
  server.tool(
    "reload_report",
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
    async ({ confirm }) => {
      const reportPath = ctx.getReportPath();
      if (!reportPath) {
        return fail("No report connected. Use set_report first.");
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
                  "To skip this prompt, call reload_report with confirm: true.\n\n" +
                  "After reload, run model_usage to verify modeling changes survived before binding new visuals to them.",
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
  // TOOL: set_filter_pane
  // ============================================================
  server.tool(
    "set_filter_pane",
    "Show or hide the filter pane in the report. Controls whether the filter pane is visible and/or expanded when users view the report.",
    {
      visible: z.boolean().describe("Whether the filter pane is visible"),
      expanded: z.boolean().optional().default(true).describe("Whether the filter pane is expanded (default true)"),
    },
    async ({ visible, expanded }) => {
      const report = ctx.project.getReport();

      if (!report.objects) report.objects = {};
      report.objects.outspacePane = [{
        properties: {
          visible: { expr: { Literal: { Value: visible ? "true" : "false" } } },
          expanded: { expr: { Literal: { Value: expanded ? "true" : "false" } } },
        },
      }];

      ctx.project.saveReport(report);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, filterPane: { visible, expanded } }),
        }],
      };
    }
  );

  // ============================================================
  // TOOL: manage_extension_measures
  // ============================================================
  server.tool(
    "manage_extension_measures",
    "Add, list, or remove extension measures (report-level DAX). Extension measures allow thin reports to define DAX calculations without modifying the semantic model. WARNING: empty reportExtensions.json crashes PBI Desktop — this tool auto-deletes the file when empty.",
    {
      operation: z.enum(["list", "add", "remove"]).describe("Operation to perform"),
      // For add
      tableName: z.string().optional().default("_Measures").describe("Extension table name (default '_Measures')"),
      measureName: z.string().optional().describe("add/remove: measure name"),
      expression: z.string().optional().describe("add: DAX expression"),
      dataType: z.string().optional().default("Text").describe("add: data type (Text, Double, Int64, Boolean, DateTime)"),
      // For remove
    },
    async ({ operation, tableName, measureName, expression, dataType }) => {
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
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "add requires: measureName, expression" }) }] };
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
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "remove requires: measureName" }) }] };
        }

        const ext = ctx.project.getReportExtensions();
        if (!ext?.entities?.length) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "No extension measures exist" }) }] };
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

      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Unknown operation" }) }] };
    }
  );

  // ============================================================
  // TOOL: set_page_background
  // ============================================================
  server.tool(
    "set_page_background",
    "Set the page canvas background color and/or wallpaper (area behind the canvas). Pass color as hex (#0D1117). Set transparency 0-100 (0=opaque, 100=fully transparent).",
    {
      pageId: z.string().describe("The page ID"),
      color: z.string().optional().describe("Canvas background color (hex, e.g. '#0D1117')"),
      transparency: z.number().min(0).max(100).optional().default(0).describe("Canvas background transparency 0-100 (default 0 = opaque)"),
      wallpaperColor: z.string().optional().describe("Wallpaper color — the area behind the page canvas (hex)"),
      wallpaperTransparency: z.number().min(0).max(100).optional().default(0).describe("Wallpaper transparency 0-100"),
      clear: z.boolean().optional().describe("Remove all background/wallpaper settings from the page"),
    },
    async ({ pageId, color, transparency, wallpaperColor, wallpaperTransparency, clear }) => {
      const page = ctx.project.getPage(pageId);
      if (!page.objects) page.objects = {};

      if (clear) {
        delete (page.objects as Record<string, unknown>).background;
        delete (page.objects as Record<string, unknown>).wallpaper;
        if (Object.keys(page.objects).length === 0) delete page.objects;
        ctx.project.savePage(pageId, page);
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
  // TOOL: set_visual_interaction
  // ============================================================
  server.tool(
    "set_visual_interaction",
    "Set cross-filter interaction between visuals on a page. Controls whether selecting data in one visual filters, highlights, or has no effect on another visual.",
    {
      pageId: z.string().describe("The page ID"),
      source: z.string().describe("Source visual ID (the one being clicked/selected)"),
      target: z.string().describe("Target visual ID (the one being affected)"),
      type: z.enum(["Filter", "Highlight", "NoFilter"]).describe("Interaction type: Filter (cross-filter), Highlight (cross-highlight), NoFilter (no interaction)"),
    },
    async ({ pageId, source, target, type }) => {
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
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, pageId, source, target, interactionType: type }),
        }],
      };
    }
  );
}
