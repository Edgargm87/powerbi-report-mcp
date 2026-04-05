import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

// Current PBIR schema versions — used when writing reportVersionAtImport
const REPORT_VERSION = { visual: "2.7.0", report: "3.2.0", page: "2.3.0" };

// --- Helper: sanitise a theme name into a safe filename ---
function themeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
  const ts = Date.now();
  return `${safe}${ts}.json`;
}

// --- Helper: upsert customTheme in report.json ---
function applyThemeToReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  report: any,
  filename: string
): void {
  // Set themeCollection.customTheme
  if (!report.themeCollection) report.themeCollection = {};
  report.themeCollection.customTheme = {
    name: filename,
    reportVersionAtImport: REPORT_VERSION,
    type: "RegisteredResources",
  };

  // Ensure resourcePackages array exists
  if (!Array.isArray(report.resourcePackages)) {
    report.resourcePackages = [];
  }

  // Find or create the RegisteredResources package
  let pkg = report.resourcePackages.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.type === "RegisteredResources"
  );
  if (!pkg) {
    pkg = { name: "RegisteredResources", type: "RegisteredResources", items: [] };
    report.resourcePackages.push(pkg);
  }

  // Remove any existing CustomTheme entries, then add the new one
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pkg.items = (pkg.items as any[]).filter((item: any) => item.type !== "CustomTheme");
  pkg.items.push({ name: filename, path: filename, type: "CustomTheme" });
}

export function registerThemeTools(server: McpServer, ctx: ServerContext): void {
  // ============================================================
  // TOOL: set_report_theme
  // ============================================================
  server.tool(
    "set_report_theme",
    `Apply a custom JSON theme to the report. The theme is saved to StaticResources/RegisteredResources/ and wired into report.json. Affects all visuals globally — no individual visual.json files are touched. Supports the full Power BI theme schema: dataColors, background, foreground, tableAccent, visualStyles, and more.`,
    {
      name: z.string().describe("Display name of the theme (e.g. 'Corporate Brand', 'Dark Mode')"),
      dataColors: z
        .array(z.string())
        .optional()
        .describe("Data series colour palette — 6 to 12 hex values recommended (e.g. ['#0078D4', '#00BCF2'])"),
      background: z
        .string()
        .optional()
        .describe("Page background colour (hex). Default #FFFFFF for light, #121212 for dark."),
      foreground: z
        .string()
        .optional()
        .describe("Primary text / title colour (hex)."),
      foregroundNeutralSecondary: z
        .string()
        .optional()
        .describe("Secondary text colour (hex) — used for axis labels, subtitles."),
      backgroundLight: z
        .string()
        .optional()
        .describe("Light background variant (hex) — used for card/panel backgrounds."),
      backgroundNeutral: z
        .string()
        .optional()
        .describe("Neutral background variant (hex)."),
      tableAccent: z
        .string()
        .optional()
        .describe("Table/matrix header accent colour (hex)."),
      visualStyles: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Advanced per-visual-type style overrides. Key is visual type (e.g. 'barChart', '*' for all). " +
          "Value is an object of style property groups. See Power BI theme docs for full schema."
        ),
    },
    async ({ name, dataColors, background, foreground, foregroundNeutralSecondary,
             backgroundLight, backgroundNeutral, tableAccent, visualStyles }) => {
      // Build theme JSON — only include provided properties
      const theme: Record<string, unknown> = { name };
      if (dataColors && dataColors.length > 0) theme.dataColors = dataColors;
      if (background)                           theme.background = background;
      if (foreground)                           theme.foreground = foreground;
      if (foregroundNeutralSecondary)           theme.foregroundNeutralSecondary = foregroundNeutralSecondary;
      if (backgroundLight)                      theme.backgroundLight = backgroundLight;
      if (backgroundNeutral)                    theme.backgroundNeutral = backgroundNeutral;
      if (tableAccent)                          theme.tableAccent = tableAccent;
      if (visualStyles)                         theme.visualStyles = visualStyles;

      const filename = themeFilename(name);

      // Write the theme file
      ctx.project.saveRegisteredResource(filename, theme);

      // Update report.json
      const report = ctx.project.getReport();
      applyThemeToReport(report, filename);
      ctx.project.saveReport(report);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Theme "${name}" applied to report`,
              filename,
              themeKeys: Object.keys(theme),
            }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: get_report_theme
  // ============================================================
  server.tool(
    "get_report_theme",
    "Get the currently applied theme for this report. Returns the base theme name and, if a custom theme is applied, its name and full JSON content.",
    {},
    async () => {
      const report = ctx.project.getReport();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = report.themeCollection as any;
      const baseTheme = tc?.baseTheme?.name ?? null;
      const customThemeName = tc?.customTheme?.name ?? null;

      let customThemeContent: unknown = null;
      if (customThemeName) {
        customThemeContent = ctx.project.readRegisteredResource(customThemeName);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { baseTheme, customTheme: customThemeName, customThemeContent },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: remove_report_theme
  // ============================================================
  server.tool(
    "remove_report_theme",
    "Remove the custom theme from the report, reverting to the default base theme. The theme file is kept in StaticResources but unlinked from report.json.",
    {},
    async () => {
      const report = ctx.project.getReport();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = report.themeCollection as any;

      if (!tc?.customTheme) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: "No custom theme was applied" }) }],
        };
      }

      const removedName = tc.customTheme.name;
      delete tc.customTheme;

      // Remove from resourcePackages
      if (Array.isArray(report.resourcePackages)) {
        for (const pkg of report.resourcePackages as Array<Record<string, unknown>>) {
          if (pkg.type === "RegisteredResources" && Array.isArray(pkg.items)) {
            pkg.items = (pkg.items as Array<Record<string, unknown>>).filter(
              (item) => item.type !== "CustomTheme"
            );
          }
        }
      }

      ctx.project.saveReport(report);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, message: `Custom theme "${removedName}" removed`, removedTheme: removedName }),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: diff_report_theme
  // ============================================================
  server.tool(
    "diff_report_theme",
    "Compare a proposed theme JSON against the currently applied theme and return what would be added, removed, or changed. Useful for previewing theme changes before applying.",
    {
      theme: z
        .record(z.string(), z.unknown())
        .describe("Proposed theme JSON object to compare against the current theme"),
    },
    async ({ theme }) => {
      const report = ctx.project.getReport();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = report.themeCollection as any;
      const customThemeName = tc?.customTheme?.name ?? null;

      const current: Record<string, unknown> = customThemeName
        ? (ctx.project.readRegisteredResource(customThemeName) as Record<string, unknown>) ?? {}
        : {};

      const proposed = theme as Record<string, unknown>;

      const allKeys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
      const added: Record<string, unknown> = {};
      const removed: string[] = [];
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      const unchanged: string[] = [];

      for (const key of allKeys) {
        const inCurrent = Object.prototype.hasOwnProperty.call(current, key);
        const inProposed = Object.prototype.hasOwnProperty.call(proposed, key);

        if (!inCurrent && inProposed) {
          added[key] = proposed[key];
        } else if (inCurrent && !inProposed) {
          removed.push(key);
        } else {
          const fromStr = JSON.stringify(current[key]);
          const toStr = JSON.stringify(proposed[key]);
          if (fromStr !== toStr) {
            changed[key] = { from: current[key], to: proposed[key] };
          } else {
            unchanged.push(key);
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                currentTheme: customThemeName ?? "(none)",
                summary: {
                  added: Object.keys(added).length,
                  removed: removed.length,
                  changed: Object.keys(changed).length,
                  unchanged: unchanged.length,
                },
                added,
                removed,
                changed,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL: list_report_themes
  // ============================================================
  server.tool(
    "list_report_themes",
    "List all theme files stored in the report's StaticResources/RegisteredResources/ folder.",
    {},
    async () => {
      const files = ctx.project.listRegisteredResources();
      const themeFiles = files.filter((f) => f.endsWith(".json"));

      const themes = themeFiles.map((f) => {
        const content = ctx.project.readRegisteredResource(f) as Record<string, unknown> | null;
        return { filename: f, name: content?.name ?? f, keys: content ? Object.keys(content) : [] };
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ themeFiles: themes }, null, 2) }],
      };
    }
  );
}
