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
const context_js_1 = require("../context.js");
const model_usage_js_1 = require("../model-usage.js");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
const mcpResult_js_1 = require("../helpers/mcpResult.js");
const layoutValidation_js_1 = require("../helpers/layoutValidation.js");
const guide_js_1 = require("./guide.js");
const resolvePage_js_1 = require("../helpers/resolvePage.js");
const readCache_js_1 = require("../helpers/readCache.js");
function registerReportTools(server, ctx) {
    // ============================================================
    // TOOL: set_report — switch report at runtime
    // ============================================================
    server.tool("set_report", "Connect to a different Power BI report (.Report folder or parent .pbip project folder). Use this to switch reports mid-session without restarting the server.", {
        path: zod_1.z.string().describe("Absolute path to the .Report folder or the parent folder containing a .pbip project"),
    }, { "openWorldHint": false }, async ({ path: targetPath }) => {
        const result = ctx.connectReport(targetPath);
        if (result.success === false) {
            return (0, mcpResult_js_1.fail)(result.error ?? "Failed to connect to report", { path: targetPath });
        }
        (0, readCache_js_1.invalidateAll)();
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
    server.tool("get_report", "Show the currently connected report path.", {}, { "readOnlyHint": true, "openWorldHint": false }, async () => (0, readCache_js_1.cachedRead)("get_report", {}, ["report"], () => ({
        reportPath: ctx.getReportPath() || "No report connected",
    })));
    // ============================================================
    // TOOL: list_pages
    // ============================================================
    server.tool("list_pages", "List all pages in the report. Slim mode (default) returns id, displayName, visualCount, isActive, hidden. Set slim=false for width/height/displayOption. Set includeVisuals=true (or pass pageId) to include a per-visual summary (id, type, x, y, w, h, title) — replaces the old get_page_summary tool.", {
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode (default true) — omits width/height/displayOption to reduce token usage"),
        includeVisuals: zod_1.z.boolean().optional().default(false).describe("When true, each page also includes a `visuals` array with slim per-visual entries."),
        pageId: zod_1.z.string().optional().describe("Scope to a single page (implies includeVisuals)."),
    }, { "readOnlyHint": true, "openWorldHint": false }, async ({ slim, includeVisuals, pageId }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const scopes = ["report"];
        if (pageId)
            scopes.push(`page:${pageId}`);
        else
            scopes.push("pages");
        return (0, readCache_js_1.cachedRead)("list_pages", { slim, includeVisuals, pageId }, scopes, () => {
            const meta = ctx.project.getPagesMetadata();
            const ids = pageId ? [pageId] : meta.pageOrder;
            const withVisuals = includeVisuals || !!pageId;
            const pages = ids.map((id) => {
                const page = ctx.project.getPage(id);
                const visualIds = ctx.project.listVisualIds(id);
                const base = {
                    id,
                    displayName: page.displayName,
                    visualCount: visualIds.length,
                    isActive: id === meta.activePageName,
                    hidden: page.visibility === "HiddenInViewMode",
                };
                if (!slim) {
                    base.width = page.width;
                    base.height = page.height;
                    base.displayOption = page.displayOption;
                }
                if (withVisuals) {
                    base.visuals = visualIds.map((vid) => {
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
                }
                return base;
            });
            // Canvas constants help the LLM place visuals without guessing —
            // cheap to include, enormous payoff on layout accuracy.
            return pageId
                ? { pageCount: pages.length, pages, canvas: (0, layoutValidation_js_1.getCanvasSummary)() }
                : { pages, canvas: (0, layoutValidation_js_1.getCanvasSummary)() };
        });
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
    }, { "openWorldHint": false }, async ({ displayName, type, width, height, displayOption, drillthrough }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)("report");
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
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        displayName: zod_1.z.string().describe("New display name"),
    }, { "openWorldHint": false }, async ({ pageId, displayName }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const page = ctx.project.getPage(pageId);
        page.displayName = displayName;
        ctx.project.savePage(pageId, page);
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, pageId, displayName }) }],
        };
    });
    // ============================================================
    // TOOL: delete_page
    // ============================================================
    server.tool("delete_page", "Delete a page and all its visuals", {
        pageId: zod_1.z.string().describe("The page ID to delete"),
    }, { "destructiveHint": true, "openWorldHint": false }, async ({ pageId }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const meta = ctx.project.getPagesMetadata();
        meta.pageOrder = meta.pageOrder.filter((id) => id !== pageId);
        if (meta.activePageName === pageId && meta.pageOrder.length > 0) {
            meta.activePageName = meta.pageOrder[0];
        }
        ctx.project.savePagesMetadata(meta);
        ctx.project.deletePage(pageId);
        (0, model_usage_js_1.invalidateCache)();
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, deletedPageId: pageId }) }],
        };
    });
    // ============================================================
    // TOOL: reorder_pages
    // ============================================================
    server.tool("reorder_pages", "Set the page order", {
        pageOrder: zod_1.z.preprocess((v) => typeof v === "string" ? JSON.parse(v) : v, zod_1.z.array(zod_1.z.string())).describe("Array of page IDs in desired order"),
    }, { "openWorldHint": false }, async ({ pageOrder }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const meta = ctx.project.getPagesMetadata();
        // Validate: supplied order must be a permutation of existing page IDs.
        // Same length + same set (no duplicates, no extras, no missing).
        const existing = meta.pageOrder;
        const sameLength = pageOrder.length === existing.length;
        const suppliedSet = new Set(pageOrder);
        const noDuplicates = suppliedSet.size === pageOrder.length;
        const sameSet = noDuplicates && existing.every((id) => suppliedSet.has(id));
        if (!sameLength || !sameSet) {
            return (0, mcpResult_js_1.fail)("pageOrder must be a permutation of existing page ids", { existing, supplied: pageOrder });
        }
        meta.pageOrder = pageOrder;
        ctx.project.savePagesMetadata(meta);
        (0, readCache_js_1.invalidateScope)("pages");
        return { content: [{ type: "text", text: JSON.stringify({ success: true, pageOrder }) }] };
    });
    // ============================================================
    // TOOL: set_active_page
    // ============================================================
    server.tool("set_active_page", "Set which page is active (shown on open)", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ pageId }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const meta = ctx.project.getPagesMetadata();
        meta.activePageName = pageId;
        ctx.project.savePagesMetadata(meta);
        (0, readCache_js_1.invalidateScope)("pages");
        return {
            content: [{ type: "text", text: JSON.stringify({ success: true, activePageName: pageId }) }],
        };
    });
    // ============================================================
    // TOOL: set_page_visibility
    // ============================================================
    server.tool("set_page_visibility", "Show or hide a page in the navigation pane. Hidden pages still work for drillthrough.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        hidden: zod_1.z.coerce.boolean(),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ pageId, hidden }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const page = ctx.project.getPage(pageId);
        if (hidden) {
            page.visibility = "HiddenInViewMode";
        }
        else {
            delete page.visibility;
        }
        ctx.project.savePage(pageId, page);
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [
                { type: "text", text: JSON.stringify({ success: true, pageId, hidden }) },
            ],
        };
    });
    // ============================================================
    // TOOL: get_report_settings
    // ============================================================
    server.tool("get_report_settings", "Get the report-level settings and theme configuration", {}, { "readOnlyHint": true, "openWorldHint": false }, async () => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
    server.tool("update_report_settings", "Merge report-level settings. Keys: useStylableVisualContainerHeader, useEnhancedTooltips, exportDataMode (0|1), persistentFilters, keyboardNavigationEnabled, defaultDrillFilterOtherVisuals, allowChangeFilterTypes, useDefaultAggregateDisplayName.", {
        settings: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ settings }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const invalid = Object.keys(settings).filter((k) => !VALID_REPORT_SETTINGS.has(k));
        if (invalid.length > 0) {
            return (0, mcpResult_js_1.fail)(`Invalid setting keys: ${invalid.join(", ")}. Valid keys: ${[...VALID_REPORT_SETTINGS].join(", ")}`);
        }
        const report = ctx.project.getReport();
        report.settings = { ...report.settings, ...settings };
        ctx.project.saveReport(report);
        (0, readCache_js_1.invalidateScope)("report");
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
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        width: zod_1.z.number().optional(),
        height: zod_1.z.number().optional(),
        displayOption: zod_1.z.enum(["FitToPage", "FitToWidth", "ActualSize"]).optional(),
    }, { "openWorldHint": false }, async ({ pageId, width, height, displayOption }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const page = ctx.project.getPage(pageId);
        if (width !== undefined)
            page.width = width;
        if (height !== undefined)
            page.height = height;
        if (displayOption !== undefined)
            page.displayOption = displayOption;
        ctx.project.savePage(pageId, page);
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("auto_layout", "Auto-arrange all visuals on a page in a grid.", {
        pageId: zod_1.z.string().describe("The page ID"),
        columns: zod_1.z.number().optional().default(3),
        padding: zod_1.z.number().optional().default(10),
        marginTop: zod_1.z.number().optional().default(10),
        marginLeft: zod_1.z.number().optional().default(10),
    }, { "openWorldHint": false }, async ({ pageId, columns, padding, marginTop, marginLeft }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        (0, readCache_js_1.invalidateScope)("pages");
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
    }, { "openWorldHint": false }, async ({ pageId, displayName }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)("pages");
        (0, readCache_js_1.invalidateScope)(`page:${newPageId}`);
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
    // TOOL: reload_report
    // ============================================================
    server.tool("reload_report", "Reload the report in Power BI Desktop by closing and reopening the .pbip file. SAFETY: closes PBIDesktop.exe, so any unsaved work in Desktop (including modeling-MCP measures/relationships not yet flushed by Desktop autosave) is LOST. Requires confirm:true to proceed — otherwise returns a save-first warning for the agent to relay to the user.", {
        confirm: zod_1.z
            .boolean()
            .optional()
            .default(false)
            .describe("Must be true to actually reload. When false/omitted, the tool returns a save-first warning instead of killing PBI Desktop. The agent should relay the warning, wait for user confirmation, then retry with confirm:true."),
    }, { "destructiveHint": true, "openWorldHint": false }, async ({ confirm }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const reportPath = ctx.getReportPath();
        if (!reportPath) {
            return (0, mcpResult_js_1.fail)("No report connected. Use set_report first.");
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
                            warning: "About to close PBI Desktop. Unsaved work will be lost, including:\n" +
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
    server.tool("set_filter_pane", "Show or hide the filter pane.", {
        visible: zod_1.z.boolean(),
        expanded: zod_1.z.boolean().optional().default(true),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ visible, expanded }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)("report");
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
    server.tool("manage_extension_measures", "Manage extension measures (report-level DAX in reportExtensions.json). Empty file crashes PBI Desktop — tool auto-deletes when empty.", {
        operation: zod_1.z.enum(["list", "add", "remove"]),
        tableName: zod_1.z.string().optional().default("_Measures"),
        measureName: zod_1.z.string().optional(),
        expression: zod_1.z.string().optional().describe("DAX (for add)"),
        dataType: zod_1.z.string().optional().default("Text").describe("Text/Double/Int64/Boolean/DateTime"),
    }, { "destructiveHint": true, "openWorldHint": false }, async ({ operation, tableName, measureName, expression, dataType }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
                return (0, mcpResult_js_1.fail)("add requires: measureName, expression");
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
                return (0, mcpResult_js_1.fail)("remove requires: measureName");
            }
            const ext = ctx.project.getReportExtensions();
            if (!ext?.entities?.length) {
                return (0, mcpResult_js_1.fail)("No extension measures exist");
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
            ext.entities = ext.entities.filter((e) => (e.measures?.length ?? 0) > 0);
            // Save (auto-deletes file if empty)
            ctx.project.saveReportExtensions(ext);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, operation: "remove", measure: measureName, removed }) }] };
        }
        return (0, mcpResult_js_1.fail)("Unknown operation");
    });
    // ============================================================
    // TOOL: set_page_background
    // ============================================================
    server.tool("set_page_background", "Set the page canvas background and/or wallpaper. Hex color (#0D1117). Transparency 0-100.", {
        pageId: zod_1.z.string().optional().describe("Page ID. Auto-resolved when only one page exists."),
        color: zod_1.z.string().optional().describe("Canvas background color (hex)"),
        transparency: zod_1.z.number().min(0).max(100).optional().default(0),
        wallpaperColor: zod_1.z.string().optional().describe("Color behind the canvas"),
        wallpaperTransparency: zod_1.z.number().min(0).max(100).optional().default(0),
        clear: zod_1.z.boolean().optional().describe("Remove all background/wallpaper settings"),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ pageId, color, transparency, wallpaperColor, wallpaperTransparency, clear }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
        const r = (0, resolvePage_js_1.resolvePageId)(ctx.project, pageId);
        if (!r.resolved)
            return r.errorResponse;
        pageId = r.pageId;
        const page = ctx.project.getPage(pageId);
        if (!page.objects)
            page.objects = {};
        if (clear) {
            delete page.objects.background;
            delete page.objects.wallpaper;
            if (Object.keys(page.objects).length === 0)
                delete page.objects;
            ctx.project.savePage(pageId, page);
            (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
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
    server.tool("set_visual_interaction", "Set cross-filter interaction (Filter/Highlight/NoFilter) from source visual to target visual.", {
        pageId: zod_1.z.string().describe("The page ID"),
        source: zod_1.z.string(),
        target: zod_1.z.string(),
        type: zod_1.z.enum(["Filter", "Highlight", "NoFilter"]),
    }, { "idempotentHint": true, "openWorldHint": false }, async ({ pageId, source, target, type }) => {
        const _g = (0, context_js_1.requireProject)(ctx);
        if (_g)
            return _g;
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
        (0, readCache_js_1.invalidateScope)(`page:${pageId}`);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ success: true, pageId, source, target, interactionType: type }),
                }],
        };
    });
}
