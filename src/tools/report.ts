import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { generateId } from "../pbir.js";
import type { PageDefinition } from "../pbir.js";
import type { ServerContext } from "../context.js";

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
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
  server.tool("list_pages", "List all pages in the report with their details", {}, async () => {
    const meta = ctx.project.getPagesMetadata();
    const pages = meta.pageOrder.map((id) => {
      const page = ctx.project.getPage(id);
      const visualCount = ctx.project.listVisualIds(id).length;
      return {
        id,
        displayName: page.displayName,
        width: page.width,
        height: page.height,
        displayOption: page.displayOption,
        visualCount,
        isActive: id === meta.activePageName,
        hidden: page.visibility === 1,
      };
    });
    return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
  });

  // ============================================================
  // TOOL: create_page
  // ============================================================
  server.tool(
    "create_page",
    "Create a new page in the report",
    {
      displayName: z.string().describe("Display name for the page"),
      width: z.number().optional().default(1280).describe("Page width (default 1280)"),
      height: z.number().optional().default(720).describe("Page height (default 720)"),
      displayOption: z
        .enum(["FitToPage", "FitToWidth", "ActualSize"])
        .optional()
        .default("FitToPage"),
    },
    async ({ displayName, width, height, displayOption }) => {
      const pageId = generateId();
      const page: PageDefinition = {
        $schema:
          "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
        name: pageId,
        displayName,
        displayOption,
        height,
        width,
      };

      ctx.project.savePage(pageId, page);

      const meta = ctx.project.getPagesMetadata();
      meta.pageOrder.push(pageId);
      ctx.project.savePagesMetadata(meta);

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, pageId, displayName }, null, 2) },
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
      pageOrder: z.array(z.string()).describe("Array of page IDs in desired order"),
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
      hidden: z.boolean().describe("true to hide the page, false to show it"),
    },
    async ({ pageId, hidden }) => {
      const page = ctx.project.getPage(pageId);
      if (hidden) {
        page.visibility = 1;
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
  server.tool(
    "update_report_settings",
    "Update report-level settings (merges with existing settings)",
    {
      settings: z
        .record(z.string(), z.unknown())
        .describe("Settings key-value pairs to merge into report.settings"),
    },
    async ({ settings }) => {
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
  // TOOL: reload_report
  // ============================================================
  server.tool(
    "reload_report",
    "Reload the report in Power BI Desktop by closing and reopening the .pbip file. Use this after making changes to see them in Power BI Desktop.",
    {},
    async () => {
      const reportPath = ctx.getReportPath();
      if (!reportPath) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "No report connected. Use set_report first." }),
            },
          ],
        };
      }

      const parentDir = path.dirname(reportPath);
      const pbipFiles = fs.readdirSync(parentDir).filter((f) => f.endsWith(".pbip"));

      if (pbipFiles.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "No .pbip file found" }) }],
        };
      }

      const pbipPath = path.join(parentDir, pbipFiles[0]);

      try {
        try {
          execSync('taskkill /IM "PBIDesktop.exe" /F', { stdio: "ignore" });
        } catch {
          // PBI Desktop might not be running — that's fine
        }

        execSync("ping -n 3 127.0.0.1 >nul", { stdio: "ignore" });
        execSync(`start "" "${pbipPath}"`, { shell: "cmd.exe", stdio: "ignore" });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Reopening ${pbipFiles[0]} in Power BI Desktop`,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: msg }) }] };
      }
    }
  );
}
