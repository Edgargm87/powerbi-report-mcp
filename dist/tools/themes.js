"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerThemeTools = registerThemeTools;
const zod_1 = require("zod");
const extractTitle_js_1 = require("../helpers/extractTitle.js");
const readCache_js_1 = require("../helpers/readCache.js");
// Current PBIR schema versions — used when writing reportVersionAtImport
const REPORT_VERSION = { visual: "2.7.0", report: "3.2.0", page: "2.3.0" };
// --- Helper: sanitise a theme name into a safe filename ---
function themeFilename(name) {
    const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
    const ts = Date.now();
    return `${safe}${ts}.json`;
}
// --- Helper: upsert customTheme in report.json ---
function applyThemeToReport(report, filename) {
    // Set themeCollection.customTheme
    if (!report.themeCollection)
        report.themeCollection = {};
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
    let pkg = report.resourcePackages.find((p) => p.type === "RegisteredResources");
    if (!pkg) {
        pkg = { name: "RegisteredResources", type: "RegisteredResources", items: [] };
        report.resourcePackages.push(pkg);
    }
    // Remove any existing CustomTheme entries, then add the new one
    pkg.items = pkg.items.filter((item) => item.type !== "CustomTheme");
    pkg.items.push({ name: filename, path: filename, type: "CustomTheme" });
}
function registerThemeTools(server, ctx) {
    // ============================================================
    // TOOL: set_report_theme
    // ============================================================
    server.tool("set_report_theme", "Apply a custom JSON theme to the report. Saved to StaticResources, wired into report.json, affects all visuals globally. Colors are hex (#RRGGBB). dataColors: 6-12 values. visualStyles: per-visual-type overrides keyed by visualType or '*'.", {
        name: zod_1.z.string(),
        dataColors: zod_1.z.array(zod_1.z.string()).optional(),
        background: zod_1.z.string().optional(),
        foreground: zod_1.z.string().optional(),
        foregroundNeutralSecondary: zod_1.z.string().optional(),
        backgroundLight: zod_1.z.string().optional(),
        backgroundNeutral: zod_1.z.string().optional(),
        tableAccent: zod_1.z.string().optional(),
        visualStyles: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    }, async ({ name, dataColors, background, foreground, foregroundNeutralSecondary, backgroundLight, backgroundNeutral, tableAccent, visualStyles }) => {
        // Build theme JSON — only include provided properties
        const theme = { name };
        if (dataColors && dataColors.length > 0)
            theme.dataColors = dataColors;
        if (background)
            theme.background = background;
        if (foreground)
            theme.foreground = foreground;
        if (foregroundNeutralSecondary)
            theme.foregroundNeutralSecondary = foregroundNeutralSecondary;
        if (backgroundLight)
            theme.backgroundLight = backgroundLight;
        if (backgroundNeutral)
            theme.backgroundNeutral = backgroundNeutral;
        if (tableAccent)
            theme.tableAccent = tableAccent;
        if (visualStyles)
            theme.visualStyles = visualStyles;
        const filename = themeFilename(name);
        // Write the theme file
        ctx.project.saveRegisteredResource(filename, theme);
        // Update report.json
        const report = ctx.project.getReport();
        applyThemeToReport(report, filename);
        ctx.project.saveReport(report);
        (0, readCache_js_1.invalidateScope)("theme");
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
    });
    // ============================================================
    // TOOL: get_report_theme
    // ============================================================
    server.tool("get_report_theme", "Get the currently applied theme. Returns base theme name + custom theme JSON if any.", {}, async () => (0, readCache_js_1.cachedRead)("get_report_theme", {}, ["theme"], () => {
        const report = ctx.project.getReport();
        const tc = report.themeCollection;
        const baseTheme = tc?.baseTheme?.name ?? null;
        const customThemeName = tc?.customTheme?.name ?? null;
        let customThemeContent = null;
        if (customThemeName) {
            customThemeContent = ctx.project.readRegisteredResource(customThemeName);
        }
        return { baseTheme, customTheme: customThemeName, customThemeContent };
    }));
    // ============================================================
    // TOOL: remove_report_theme
    // ============================================================
    server.tool("remove_report_theme", "Remove the custom theme from the report, reverting to the default base theme. The theme file is kept in StaticResources but unlinked from report.json.", {}, async () => {
        const report = ctx.project.getReport();
        const tc = report.themeCollection;
        if (!tc?.customTheme) {
            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, message: "No custom theme was applied" }) }],
            };
        }
        const removedName = tc.customTheme.name;
        delete tc.customTheme;
        // Remove from resourcePackages
        if (Array.isArray(report.resourcePackages)) {
            for (const pkg of report.resourcePackages) {
                if (pkg.type === "RegisteredResources" && Array.isArray(pkg.items)) {
                    pkg.items = pkg.items.filter((item) => item.type !== "CustomTheme");
                }
            }
        }
        ctx.project.saveReport(report);
        (0, readCache_js_1.invalidateScope)("theme");
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ success: true, message: `Custom theme "${removedName}" removed`, removedTheme: removedName }),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: diff_report_theme
    // ============================================================
    server.tool("diff_report_theme", "Compare a proposed theme JSON against the currently applied theme and return what would be added, removed, or changed. Useful for previewing theme changes before applying.", {
        theme: zod_1.z
            .record(zod_1.z.string(), zod_1.z.unknown())
            .describe("Proposed theme JSON object to compare against the current theme"),
    }, async ({ theme }) => {
        const report = ctx.project.getReport();
        const tc = report.themeCollection;
        const customThemeName = tc?.customTheme?.name ?? null;
        const current = customThemeName
            ? ctx.project.readRegisteredResource(customThemeName) ?? {}
            : {};
        const proposed = theme;
        const allKeys = new Set([...Object.keys(current), ...Object.keys(proposed)]);
        const added = {};
        const removed = [];
        const changed = {};
        const unchanged = [];
        for (const key of allKeys) {
            const inCurrent = Object.prototype.hasOwnProperty.call(current, key);
            const inProposed = Object.prototype.hasOwnProperty.call(proposed, key);
            if (!inCurrent && inProposed) {
                added[key] = proposed[key];
            }
            else if (inCurrent && !inProposed) {
                removed.push(key);
            }
            else {
                const fromStr = JSON.stringify(current[key]);
                const toStr = JSON.stringify(proposed[key]);
                if (fromStr !== toStr) {
                    changed[key] = { from: current[key], to: proposed[key] };
                }
                else {
                    unchanged.push(key);
                }
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
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
                    }, null, 2),
                },
            ],
        };
    });
    // ============================================================
    // TOOL: list_report_themes
    // ============================================================
    server.tool("list_report_themes", "List all theme files stored in the report's StaticResources/RegisteredResources/ folder.", {}, async () => {
        const files = ctx.project.listRegisteredResources();
        const themeFiles = files.filter((f) => f.endsWith(".json"));
        const themes = themeFiles.map((f) => {
            const content = ctx.project.readRegisteredResource(f);
            return { filename: f, name: content?.name ?? f, keys: content ? Object.keys(content) : [] };
        });
        return {
            content: [{ type: "text", text: JSON.stringify({ themeFiles: themes }, null, 2) }],
        };
    });
    // ============================================================
    // TOOL: audit_theme_compliance
    // ============================================================
    server.tool("audit_theme_compliance", "Audit visuals on a page for theme overrides. Returns summary header + topN findings (default 20). topN:0 = all.", {
        pageId: zod_1.z.string().describe("The page ID to audit"),
        verbose: zod_1.z.boolean().optional().default(false).describe("Include override category names per visual"),
        topN: zod_1.z.number().int().min(0).optional().default(20).describe("Max findings (0 = all)"),
    }, async ({ pageId, verbose, topN }) => {
        const visualIds = ctx.project.listVisualIds(pageId);
        const results = [];
        let overrideCount = 0;
        for (const vid of visualIds) {
            const visual = ctx.project.getVisual(pageId, vid);
            const vType = visual.visual?.visualType || "unknown";
            const titleText = (0, extractTitle_js_1.extractVisualTitle)(visual.visual?.visualContainerObjects);
            const objects = visual.visual?.objects || {};
            const containerObjects = visual.visual?.visualContainerObjects || {};
            // Filter out auto-generated categories that are expected (not overrides)
            // data, selection are slicer config, not style overrides
            // general is often just textbox content
            const ignoredObjectCats = new Set(["data", "selection", "general"]);
            const objectCats = Object.keys(objects).filter((k) => !ignoredObjectCats.has(k));
            // title is commonly set per-visual (expected), so only flag other container overrides
            const ignoredContainerCats = new Set(["title"]);
            const containerCats = Object.keys(containerObjects).filter((k) => !ignoredContainerCats.has(k));
            const hasOverrides = objectCats.length > 0 || containerCats.length > 0;
            if (hasOverrides)
                overrideCount++;
            results.push({
                visualId: vid,
                visualType: vType,
                title: titleText,
                hasObjectOverrides: objectCats.length > 0,
                hasContainerOverrides: containerCats.length > 0,
                ...(verbose ? { objectCategories: objectCats, containerCategories: containerCats } : { objectCategories: [], containerCategories: [] }),
            });
        }
        const compliant = results.filter((r) => !r.hasObjectOverrides && !r.hasContainerOverrides);
        const nonCompliant = results.filter((r) => r.hasObjectOverrides || r.hasContainerOverrides);
        // Roll up by override category (the "byCode" header) — quickest way for
        // the LLM to spot which override category dominates without scanning
        // every finding row.
        const byCode = {};
        const categoriesAffectedSet = new Set();
        for (const r of nonCompliant) {
            for (const c of r.objectCategories) {
                byCode[c] = (byCode[c] ?? 0) + 1;
                categoriesAffectedSet.add(c);
            }
            for (const c of r.containerCategories) {
                byCode[c] = (byCode[c] ?? 0) + 1;
                categoriesAffectedSet.add(c);
            }
        }
        const cappedFindings = topN === 0 ? nonCompliant : nonCompliant.slice(0, topN);
        const truncated = nonCompliant.length > cappedFindings.length;
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        pageId,
                        totalVisuals: results.length,
                        compliantVisuals: compliant.length,
                        overrideVisuals: overrideCount,
                        totalFindings: nonCompliant.length,
                        categoriesAffected: categoriesAffectedSet.size,
                        byCode,
                        ...(truncated ? { truncated: true, returned: cappedFindings.length, hint: `Set topN:0 to return all ${nonCompliant.length} findings.` } : {}),
                        ...(verbose ? { details: cappedFindings } : {
                            summary: cappedFindings.map((r) => ({
                                visualId: r.visualId,
                                type: r.visualType,
                                title: r.title,
                                overrides: [...r.objectCategories, ...r.containerCategories],
                            }))
                        }),
                    }, null, 2),
                }],
        };
    });
}
