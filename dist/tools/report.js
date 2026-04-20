"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReportTools = registerReportTools;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const pbir_js_1 = require("../pbir.js");
const model_usage_js_1 = require("../model-usage.js");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
const mcpResult_js_1 = require("../helpers/mcpResult.js");
const layoutValidation_js_1 = require("../helpers/layoutValidation.js");
const guide_js_1 = require("./guide.js");
function registerReportTools(server, ctx) {
    // ============================================================
    // TOOL: set_report — switch report at runtime
    // ============================================================
    server.tool("set_report", "Connect to a different Power BI report (.Report folder or parent .pbip project folder). Use this to switch reports mid-session without restarting the server.", {
        path: zod_1.z.string().describe("Absolute path to the .Report folder or the parent folder containing a .pbip project"),
    }, async ({ path: targetPath }) => {
        const result = ctx.connectReport(targetPath);
        // Append the skills-index banner so every new session gets the index +
        // the always-inline wireframes + report-design content at connect time.
        // Clients that ignore the pbir-instructions MCP resource still see it
        // because it rides along in the tool response.
        return {
            content: [
                { type: "text", text: JSON.stringify(result) },
                { type: "text", text: (0, guide_js_1.buildSkillsIndexBanner)() },
            ],
        };
    });
    // ============================================================
    // TOOL: get_report — show currently connected report
    // ============================================================
    server.tool("get_report", "Show the currently connected report path.", {}, async () => {
        return {
            content: [
                { type: "text", text: JSON.stringify({ reportPath: ctx.getReportPath() || "No report connected" }) },
            ],
        };
    });
    // ============================================================
    // TOOL: list_pages
    // ============================================================
    server.tool("list_pages", "List all pages in the report. Slim mode (default) returns id, displayName, visualCount, isActive, hidden. Set slim=false for full details including width, height, displayOption.", {
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode (default true) — omits width/height/displayOption to reduce token usage"),
    }, async ({ slim }) => {
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
            if (slim)
                return base;
            return { ...base, width: page.width, height: page.height, displayOption: page.displayOption };
        });
        // Canvas constants help the LLM place visuals without guessing —
        // cheap to include, enormous payoff on layout accuracy.
        return { content: [{ type: "text", text: JSON.stringify({ pages, canvas: (0, layoutValidation_js_1.getCanvasSummary)() }, null, 2) }] };
    });
    // ============================================================
    // TOOL: create_page
    // ============================================================
    server.tool("create_page", "Create a new page in the report. Supports standard, tooltip, and drillthrough page types.", {
        displayName: zod_1.z.string().describe("Display name for the page"),
        type: zod_1.z.enum(["standard", "tooltip"]).optional().default("standard")
            .describe("Page type — tooltip pages are small overlay pages (320x240) hidden from nav"),
        width: zod_1.z.number().optional().describe("Page width (default 1280, or 320 for tooltip)"),
        height: zod_1.z.number().optional().describe("Page height (default 720, or 240 for tooltip)"),
        displayOption: zod_1.z
            .enum(["FitToPage", "FitToWidth", "ActualSize"])
            .optional()
            .describe("Display option (default FitToPage, or ActualSize for tooltip)"),
        drillthrough: zod_1.z.object({
            entity: zod_1.z.string().describe("Table name for the drillthrough field"),
            property: zod_1.z.string().describe("Column name for the drillthrough field"),
        }).optional().describe("Drillthrough field — makes this a drillthrough page filtered by this field"),
    }, async ({ displayName, type, width, height, displayOption, drillthrough }) => {
        const isTooltip = type === "tooltip";
        // Apply tooltip defaults when not explicitly overridden
        const resolvedWidth = width ?? (isTooltip ? 320 : 1280);
        const resolvedHeight = height ?? (isTooltip ? 240 : 720);
        const resolvedDisplayOption = displayOption ?? (isTooltip ? "ActualSize" : "FitToPage");
        const pageId = (0, pbir_js_1.generateId)();
        const page = {
            $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
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
            const field = (0, pbir_js_1.columnRef)(drillthrough.entity, drillthrough.property);
            page.filterConfig = {
                filters: [{
                        name: (0, pbir_js_1.generateId)(),
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
                        canvas: isTooltip ? null : (0, layoutValidation_js_1.getCanvasSummary)(),
                    }, null, 2) },
            ],
        };
    });
    // ============================================================
    // TOOL: rename_page
    // ============================================================
    server.tool("rename_page", "Rename an existing page", {
        pageId: zod_1.z.string().describe("The page ID to rename"),
        displayName: zod_1.z.string().describe("New display name"),
    }, async ({ pageId, displayName }) => {
        const page = ctx.project.getPage(pageId);
        page.displayName = displayName;
        ctx.project.savePage(pageId, page);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, pageId, displayName }) }],
        };
    });
    // ============================================================
    // TOOL: delete_page
    // ============================================================
    server.tool("delete_page", "Delete a page and all its visuals", {
        pageId: zod_1.z.string().describe("The page ID to delete"),
    }, async ({ pageId }) => {
        const meta = ctx.project.getPagesMetadata();
        meta.pageOrder = meta.pageOrder.filter((id) => id !== pageId);
        if (meta.activePageName === pageId && meta.pageOrder.length > 0) {
            meta.activePageName = meta.pageOrder[0];
        }
        ctx.project.savePagesMetadata(meta);
        ctx.project.deletePage(pageId);
        (0, model_usage_js_1.invalidateCache)();
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, deletedPageId: pageId }) }],
        };
    });
    // ============================================================
    // TOOL: reorder_pages
    // ============================================================
    server.tool("reorder_pages", "Set the page order", {
        pageOrder: zod_1.z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, zod_1.z.array(zod_1.z.string())).describe("Array of page IDs in desired order"),
    }, async ({ pageOrder }) => {
        const meta = ctx.project.getPagesMetadata();
        meta.pageOrder = pageOrder;
        ctx.project.savePagesMetadata(meta);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, pageOrder }) }] };
    });
    // ============================================================
    // TOOL: set_active_page
    // ============================================================
    server.tool("set_active_page", "Set which page is active (shown on open)", {
        pageId: zod_1.z.string().describe("The page ID to set as active"),
    }, async ({ pageId }) => {
        const meta = ctx.project.getPagesMetadata();
        meta.activePageName = pageId;
        ctx.project.savePagesMetadata(meta);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, activePageName: pageId }) }],
        };
    });
    // ============================================================
    // TOOL: set_page_visibility
    // ============================================================
    server.tool("set_page_visibility", "Show or hide a page in the report navigation pane. Hidden pages are not shown to report viewers but can still be used for drillthrough.", {
        pageId: zod_1.z.string().describe("The page ID"),
        hidden: zod_1.z.coerce.boolean().describe("true to hide the page, false to show it"),
    }, async ({ pageId, hidden }) => {
        const page = ctx.project.getPage(pageId);
        if (hidden) {
            page.visibility = "HiddenInViewMode";
        }
        else {
            delete page.visibility;
        }
        ctx.project.savePage(pageId, page);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true, pageId, hidden }) },
            ],
        };
    });
    // ============================================================
    // TOOL: get_report_settings
    // ============================================================
    server.tool("get_report_settings", "Get the report-level settings and theme configuration", {}, async () => {
        const report = ctx.project.getReport();
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    });
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
    server.tool("update_report_settings", "Update report-level settings (merges with existing settings). Valid keys: useStylableVisualContainerHeader (boolean, modern visual headers), useEnhancedTooltips (boolean), exportDataMode (0=summarized, 1=summarized+underlying), persistentFilters (boolean, save filter selections), keyboardNavigationEnabled (boolean), defaultDrillFilterOtherVisuals, allowChangeFilterTypes, useDefaultAggregateDisplayName.", {
        settings: zod_1.z
            .record(zod_1.z.string(), zod_1.z.unknown())
            .describe("Settings key-value pairs to merge into report.settings"),
    }, async ({ settings }) => {
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
    });
    // ============================================================
    // TOOL: update_page_size
    // ============================================================
    server.tool("update_page_size", "Update the page dimensions", {
        pageId: zod_1.z.string().describe("The page ID"),
        width: zod_1.z.number().optional().describe("New width"),
        height: zod_1.z.number().optional().describe("New height"),
        displayOption: zod_1.z.enum(["FitToPage", "FitToWidth", "ActualSize"]).optional(),
    }, async ({ pageId, width, height, displayOption }) => {
        const page = ctx.project.getPage(pageId);
        if (width !== undefined)
            page.width = width;
        if (height !== undefined)
            page.height = height;
        if (displayOption !== undefined)
            page.displayOption = displayOption;
        ctx.project.savePage(pageId, page);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, pageId, width: page.width, height: page.height }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: auto_layout
    // ============================================================
    server.tool("auto_layout", "Automatically arrange all visuals on a page in a grid layout", {
        pageId: zod_1.z.string().describe("The page ID"),
        columns: zod_1.z.number().optional().default(3).describe("Number of columns in the grid"),
        padding: zod_1.z.number().optional().default(10).describe("Padding between visuals"),
        marginTop: zod_1.z.number().optional().default(10).describe("Top margin"),
        marginLeft: zod_1.z.number().optional().default(10).describe("Left margin"),
    }, async ({ pageId, columns, padding, marginTop, marginLeft }) => {
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
    });
    // ============================================================
    // TOOL: duplicate_page
    // ============================================================
    server.tool("duplicate_page", "Duplicate an entire page with all its visuals to a new page", {
        pageId: zod_1.z.string().describe("The source page ID to duplicate"),
        displayName: zod_1.z
            .string()
            .optional()
            .describe("Display name for the new page (defaults to 'Copy of <original>')"),
    }, async ({ pageId, displayName }) => {
        const sourcePage = ctx.project.getPage(pageId);
        const newPageId = (0, pbir_js_1.generateId)();
        const newPage = {
            ...JSON.parse(JSON.stringify(sourcePage)),
            name: newPageId,
            displayName: displayName || `Copy of ${sourcePage.displayName}`,
        };
        ctx.project.savePage(newPageId, newPage);
        const meta = ctx.project.getPagesMetadata();
        meta.pageOrder.push(newPageId);
        ctx.project.savePagesMetadata(meta);
        const visualIds = ctx.project.listVisualIds(pageId);
        const newVisualIds = [];
        for (const vid of visualIds) {
            const original = ctx.project.getVisual(pageId, vid);
            const newVid = (0, pbir_js_1.generateId)();
            const duplicate = JSON.parse(JSON.stringify(original));
            duplicate.name = newVid;
            if (duplicate.filterConfig?.filters) {
                for (const f of duplicate.filterConfig.filters) {
                    f.name = (0, pbir_js_1.generateId)();
                }
            }
            ctx.project.saveVisual(newPageId, newVid, duplicate);
            newVisualIds.push(newVid);
        }
        (0, model_usage_js_1.invalidateCache)();
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
    });
    // ============================================================
    // TOOL: get_page_summary
    // ============================================================
    server.tool("get_page_summary", "Get pages with their visuals in one call — replaces list_pages + list_visuals. Returns slim visual list per page. Provide pageId to scope to one page.", {
        pageId: zod_1.z.string().optional().describe("Scope to a single page. Omit for all pages."),
    }, async ({ pageId }) => {
        const meta = ctx.project.getPagesMetadata();
        const ids = pageId ? [pageId] : meta.pageOrder;
        const pages = ids.map((id) => {
            const page = ctx.project.getPage(id);
            const visualIds = ctx.project.listVisualIds(id);
            const visuals = visualIds.map((vid) => {
                const v = ctx.project.getVisual(id, vid);
                const titleValue = (0, extractTitle_js_1.extractVisualTitle)(v.visual.visualContainerObjects);
                const entry = {
                    id: vid,
                    type: v.visual.visualType,
                    x: v.position.x,
                    y: v.position.y,
                    w: v.position.width,
                    h: v.position.height,
                };
                if (titleValue)
                    entry.title = titleValue;
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
            content: [{ type: "text", text: JSON.stringify({ pageCount: pages.length, pages, canvas: (0, layoutValidation_js_1.getCanvasSummary)() }, null, 2) }],
        };
    });
    // ============================================================
    // TOOL: reload_report
    // ============================================================
    server.tool("reload_report", "Reload the report in Power BI Desktop by closing and reopening the .pbip file. Use this after making changes to see them in Power BI Desktop.", {}, async () => {
        const reportPath = ctx.getReportPath();
        if (!reportPath) {
            return (0, mcpResult_js_1.fail)("No report connected. Use set_report first.");
        }
        const parentDir = path.dirname(reportPath);
        const pbipFiles = fs.readdirSync(parentDir).filter((f) => f.endsWith(".pbip"));
        if (pbipFiles.length === 0) {
            return (0, mcpResult_js_1.fail)("No .pbip file found");
        }
        // Defense in depth: reject pbip filenames containing shell metacharacters
        // before we go anywhere near the launcher. parentDir came from
        // path.dirname() on a validated .Report folder path, so it's safe; the
        // filename is the only attacker-controlled part.
        const pbipName = pbipFiles[0];
        if (!/^[\w\-. ()]+\.pbip$/i.test(pbipName)) {
            return (0, mcpResult_js_1.fail)(`Refusing to launch file with suspicious name: ${pbipName}`);
        }
        const pbipPath = path.join(parentDir, pbipName);
        try {
            try {
                // execFileSync with argv — no shell interpolation. taskkill args
                // are fully static.
                (0, child_process_1.execFileSync)("taskkill", ["/IM", "PBIDesktop.exe", "/F"], { stdio: "ignore" });
            }
            catch {
                // PBI Desktop might not be running — that's fine
            }
            // Brief pause so PBI Desktop finishes tearing down file locks before
            // we relaunch. Using setTimeout inside the async handler — no shell.
            await new Promise((r) => setTimeout(r, 3000));
            // Launch via spawn with argv. shell:false means pbipPath is passed as
            // a single argv element — no command injection possible. cmd.exe /c
            // start is the canonical Windows "open with default app" incantation
            // ("" is the required empty window title).
            const child = (0, child_process_1.spawn)("cmd.exe", ["/c", "start", "", pbipPath], {
                stdio: "ignore",
                detached: true,
                windowsVerbatimArguments: false,
            });
            child.unref();
            return (0, mcpResult_js_1.ok)({ message: `Reopening ${pbipName} in Power BI Desktop` });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return (0, mcpResult_js_1.fail)(msg);
        }
    });
    // ============================================================
    // TOOL: set_filter_pane
    // ============================================================
    server.tool("set_filter_pane", "Show or hide the filter pane in the report. Controls whether the filter pane is visible and/or expanded when users view the report.", {
        visible: zod_1.z.boolean().describe("Whether the filter pane is visible"),
        expanded: zod_1.z.boolean().optional().default(true).describe("Whether the filter pane is expanded (default true)"),
    }, async ({ visible, expanded }) => {
        const report = ctx.project.getReport();
        if (!report.objects)
            report.objects = {};
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
    });
    // ============================================================
    // TOOL: manage_extension_measures
    // ============================================================
    server.tool("manage_extension_measures", "Add, list, or remove extension measures (report-level DAX). Extension measures allow thin reports to define DAX calculations without modifying the semantic model. WARNING: empty reportExtensions.json crashes PBI Desktop — this tool auto-deletes the file when empty.", {
        operation: zod_1.z.enum(["list", "add", "remove"]).describe("Operation to perform"),
        // For add
        tableName: zod_1.z.string().optional().default("_Measures").describe("Extension table name (default '_Measures')"),
        measureName: zod_1.z.string().optional().describe("add/remove: measure name"),
        expression: zod_1.z.string().optional().describe("add: DAX expression"),
        dataType: zod_1.z.string().optional().default("Text").describe("add: data type (Text, Double, Int64, Boolean, DateTime)"),
        // For remove
    }, async ({ operation, tableName, measureName, expression, dataType }) => {
        if (operation === "list") {
            const ext = ctx.project.getReportExtensions();
            if (!ext?.entities?.length) {
                return { content: [{ type: "text", text: JSON.stringify({ success: true, measures: [], count: 0 }) }] };
            }
            const measures = ext.entities.flatMap((e) => (e.measures || []).map((m) => ({ table: e.name, name: m.name, expression: m.expression, dataType: m.dataType })));
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
            let entity = ext.entities.find((e) => e.name === tableName);
            if (!entity) {
                entity = { name: tableName, measures: [] };
                ext.entities.push(entity);
            }
            if (!entity.measures)
                entity.measures = [];
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
                    if (entity.measures.length < before)
                        removed = true;
                }
            }
            // Clean up empty entities
            ext.entities = ext.entities.filter((e) => e.measures?.length > 0);
            // Save (auto-deletes file if empty)
            ctx.project.saveReportExtensions(ext);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, operation: "remove", measure: measureName, removed }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Unknown operation" }) }] };
    });
    // ============================================================
    // TOOL: set_page_background
    // ============================================================
    server.tool("set_page_background", "Set the page canvas background color and/or wallpaper (area behind the canvas). Pass color as hex (#0D1117). Set transparency 0-100 (0=opaque, 100=fully transparent).", {
        pageId: zod_1.z.string().describe("The page ID"),
        color: zod_1.z.string().optional().describe("Canvas background color (hex, e.g. '#0D1117')"),
        transparency: zod_1.z.number().min(0).max(100).optional().default(0).describe("Canvas background transparency 0-100 (default 0 = opaque)"),
        wallpaperColor: zod_1.z.string().optional().describe("Wallpaper color — the area behind the page canvas (hex)"),
        wallpaperTransparency: zod_1.z.number().min(0).max(100).optional().default(0).describe("Wallpaper transparency 0-100"),
        clear: zod_1.z.boolean().optional().describe("Remove all background/wallpaper settings from the page"),
    }, async ({ pageId, color, transparency, wallpaperColor, wallpaperTransparency, clear }) => {
        const page = ctx.project.getPage(pageId);
        if (!page.objects)
            page.objects = {};
        if (clear) {
            delete page.objects.background;
            delete page.objects.wallpaper;
            if (Object.keys(page.objects).length === 0)
                delete page.objects;
            ctx.project.savePage(pageId, page);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, pageId, cleared: true }) }] };
        }
        // Helper to build a color property in PBIR format
        const colorProp = (hex) => ({
            solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } },
        });
        const intProp = (val) => ({
            expr: { Literal: { Value: `${val}D` } },
        });
        // Canvas background
        if (color) {
            page.objects.background = [{
                    properties: {
                        show: { expr: { Literal: { Value: "true" } } },
                        color: colorProp(color),
                        transparency: intProp(transparency ?? 0),
                    },
                }];
        }
        // Wallpaper (area behind canvas)
        if (wallpaperColor) {
            page.objects.wallpaper = [{
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
    });
    // ============================================================
    // TOOL: set_visual_interaction
    // ============================================================
    server.tool("set_visual_interaction", "Set cross-filter interaction between visuals on a page. Controls whether selecting data in one visual filters, highlights, or has no effect on another visual.", {
        pageId: zod_1.z.string().describe("The page ID"),
        source: zod_1.z.string().describe("Source visual ID (the one being clicked/selected)"),
        target: zod_1.z.string().describe("Target visual ID (the one being affected)"),
        type: zod_1.z.enum(["Filter", "Highlight", "NoFilter"]).describe("Interaction type: Filter (cross-filter), Highlight (cross-highlight), NoFilter (no interaction)"),
    }, async ({ pageId, source, target, type }) => {
        const page = ctx.project.getPage(pageId);
        // Initialize visualInteractions array if not present
        if (!page.visualInteractions) {
            page.visualInteractions = [];
        }
        // Find existing interaction between this source and target
        const existingIdx = page.visualInteractions.findIndex((vi) => vi.source === source && vi.target === target);
        const interaction = { source, target, type };
        if (existingIdx >= 0) {
            // Update existing
            page.visualInteractions[existingIdx] = interaction;
        }
        else {
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
    });
}
