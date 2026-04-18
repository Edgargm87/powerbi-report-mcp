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
exports.findSemanticModelPath = findSemanticModelPath;
exports._resetModelUsageWarnings = _resetModelUsageWarnings;
exports.getLastParseWarnings = getLastParseWarnings;
exports.getModelFieldInventory = getModelFieldInventory;
exports.buildFullData = buildFullData;
exports.generateHTML = generateHTML;
exports.generateMarkdown = generateMarkdown;
exports.getUsageDir = getUsageDir;
exports.regenerate = regenerate;
exports.invalidateCache = invalidateCache;
exports.stopWatchers = stopWatchers;
exports.startWatchers = startWatchers;
exports.registerModelUsageTool = registerModelUsageTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const zod_1 = require("zod");
const pbir_js_1 = require("./pbir.js");
// ═══════════════════════════════════════════════════════════════════════════════
// Step 1: Locate Semantic Model
// ═══════════════════════════════════════════════════════════════════════════════
function findSemanticModelPath(reportPath) {
    const projectDir = path.dirname(reportPath);
    // Try definition.pbir first (explicit pointer)
    const pbirFile = path.join(reportPath, "definition.pbir");
    if (fs.existsSync(pbirFile)) {
        try {
            const pbir = JSON.parse(fs.readFileSync(pbirFile, "utf8"));
            const rel = pbir?.datasetReference?.byPath?.path;
            if (rel) {
                const candidate = path.resolve(projectDir, rel);
                if (fs.existsSync(candidate))
                    return candidate;
            }
        }
        catch { /* fall through */ }
    }
    // Scan sibling folders
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    const modelDir = entries.find(e => e.isDirectory() && e.name.endsWith(".SemanticModel"));
    if (!modelDir)
        throw new Error("No .SemanticModel folder found alongside the report");
    return path.join(projectDir, modelDir.name);
}
// Warn-once tracker for corrupt/locked TMDL or BIM files so we don't spam stderr.
const warnedParsePaths = new Set();
function _resetModelUsageWarnings() {
    warnedParsePaths.clear();
}
function warnParseOnce(filePath, err) {
    if (warnedParsePaths.has(filePath))
        return;
    warnedParsePaths.add(filePath);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[model_usage] Failed to parse ${path.basename(filePath)}: ${msg.slice(0, 200)}`);
}
/** Parse warnings collected during the most recent parseModel() call. */
let lastParseWarnings = [];
function getLastParseWarnings() {
    return [...lastParseWarnings];
}
function parseTmdlRelationships(modelPath) {
    const relFile = path.join(modelPath, "definition", "relationships.tmdl");
    if (!fs.existsSync(relFile))
        return [];
    try {
        const content = fs.readFileSync(relFile, "utf8");
        const rels = [];
        let current = null;
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("relationship ")) {
                if (current?.fromTable)
                    rels.push({ fromTable: current.fromTable, fromColumn: current.fromColumn, toTable: current.toTable, toColumn: current.toColumn, isActive: current.isActive !== false });
                current = { isActive: true };
            }
            else if (current && trimmed.startsWith("fromColumn:")) {
                const val = trimmed.replace("fromColumn:", "").trim();
                const dot = val.indexOf(".");
                if (dot > 0) {
                    current.fromTable = val.substring(0, dot).replace(/^'(.*)'$/, "$1");
                    current.fromColumn = val.substring(dot + 1).replace(/^'(.*)'$/, "$1");
                }
            }
            else if (current && trimmed.startsWith("toColumn:")) {
                const val = trimmed.replace("toColumn:", "").trim();
                const dot = val.indexOf(".");
                if (dot > 0) {
                    current.toTable = val.substring(0, dot).replace(/^'(.*)'$/, "$1");
                    current.toColumn = val.substring(dot + 1).replace(/^'(.*)'$/, "$1");
                }
            }
            else if (current && trimmed.startsWith("isActive:")) {
                current.isActive = trimmed.includes("true");
            }
        }
        if (current?.fromTable)
            rels.push({ fromTable: current.fromTable, fromColumn: current.fromColumn, toTable: current.toTable, toColumn: current.toColumn, isActive: current.isActive !== false });
        return rels;
    }
    catch (err) {
        warnParseOnce(relFile, err);
        lastParseWarnings.push(`relationships.tmdl: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
function parseTmdlFunctions(modelPath) {
    const funcFile = path.join(modelPath, "definition", "functions.tmdl");
    if (!fs.existsSync(funcFile))
        return [];
    let content;
    try {
        content = fs.readFileSync(funcFile, "utf8");
    }
    catch (err) {
        warnParseOnce(funcFile, err);
        lastParseWarnings.push(`functions.tmdl: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    try {
        const funcs = [];
        let pendingDesc = "";
        let funcDesc = "";
        let name = "";
        let params = "";
        let exprLines = [];
        let inFunc = false;
        let inBacktickBlock = false;
        const flush = () => {
            if (name) {
                funcs.push({ name, parameters: params, expression: exprLines.join("\n").trim(), description: funcDesc.trim() });
            }
            name = "";
            params = "";
            exprLines = [];
            funcDesc = "";
            inFunc = false;
            inBacktickBlock = false;
        };
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            // Collect /// doc comments (can appear between functions)
            if (trimmed.startsWith("///")) {
                pendingDesc += (pendingDesc ? " " : "") + trimmed.replace(/^\/\/\/\s*/, "");
                continue;
            }
            // Function declaration: function 'name' = or function 'name' = ```
            if (trimmed.startsWith("function ")) {
                if (inFunc)
                    flush();
                funcDesc = pendingDesc;
                pendingDesc = "";
                const match = trimmed.match(/^function\s+'([^']+)'\s*=\s*(```)?(.*)$/);
                if (match) {
                    name = match[1];
                    inFunc = true;
                    inBacktickBlock = !!match[2];
                    const rest = match[3]?.trim();
                    if (rest)
                        exprLines.push(rest);
                }
                else {
                    const m2 = trimmed.match(/^function\s+(\S+)\s*=\s*(```)?(.*)$/);
                    if (m2) {
                        name = m2[1];
                        inFunc = true;
                        inBacktickBlock = !!m2[2];
                        const rest = m2[3]?.trim();
                        if (rest)
                            exprLines.push(rest);
                    }
                }
                continue;
            }
            if (inFunc) {
                if (inBacktickBlock && trimmed === "```")
                    continue;
                if (trimmed.startsWith("lineageTag:"))
                    continue;
                exprLines.push(trimmed);
            }
            else {
                // Reset pending description if non-comment, non-function, non-empty
                if (trimmed && !trimmed.startsWith("///"))
                    pendingDesc = "";
            }
        }
        flush();
        // Extract parameters from expression: (Param : TYPE, ...) =>
        for (const f of funcs) {
            const paramMatch = f.expression.match(/^\(\s*(.*?)\s*\)\s*=>/s);
            if (paramMatch) {
                f.parameters = paramMatch[1].replace(/\s+/g, " ").trim();
                f.expression = f.expression.replace(/^\(.*?\)\s*=>\s*/s, "").trim();
            }
        }
        return funcs;
    }
    catch (err) {
        warnParseOnce(funcFile, err);
        lastParseWarnings.push(`functions.tmdl: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
function parseTmdlModel(modelPath) {
    const tablesDir = path.join(modelPath, "definition", "tables");
    const measures = [];
    const columns = [];
    const calcGroups = [];
    const relationships = parseTmdlRelationships(modelPath);
    const functions = parseTmdlFunctions(modelPath);
    if (!fs.existsSync(tablesDir))
        return { measures, columns, relationships, functions, calcGroups };
    for (const file of fs.readdirSync(tablesDir).filter(f => f.endsWith(".tmdl"))) {
        const tablePath = path.join(tablesDir, file);
        let content;
        try {
            content = fs.readFileSync(tablePath, "utf8");
        }
        catch (err) {
            warnParseOnce(tablePath, err);
            lastParseWarnings.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
        const lines = content.split("\n");
        let tableName = "";
        let currentMeasure = null;
        let currentColumn = null;
        let collectingExpression = false;
        let expressionLines = [];
        // Calc group tracking
        let isCalcGroupTable = false;
        let inCalcGroupSection = false;
        let calcGroupDesc = "";
        let calcGroupPrecedence = 10;
        let pendingCalcDesc = "";
        let calcGroupItems = [];
        let calcItemOrdinal = 0;
        let currentCalcItem = null;
        let calcItemExprLines = [];
        let collectingCalcItemExpr = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trimEnd();
            // Table name (no leading tabs)
            if (/^table\s+/.test(trimmed)) {
                tableName = trimmed.replace(/^table\s+/, "").replace(/^'(.*)'$/, "$1").trim();
                continue;
            }
            // Detect indentation depth (tab count)
            const tabCount = line.search(/[^\t]/);
            // New measure at depth 1
            if (tabCount === 1 && /^\tmeasure\s+/.test(line)) {
                // Flush previous measure
                if (currentMeasure && collectingExpression) {
                    currentMeasure.daxExpression = expressionLines.join("\n").trim();
                }
                collectingExpression = false;
                expressionLines = [];
                currentColumn = null;
                const rest = trimmed.replace(/^\s*measure\s+/, "");
                const eqIdx = rest.indexOf("=");
                if (eqIdx > 0) {
                    let name = rest.substring(0, eqIdx).trim().replace(/^'(.*)'$/, "$1");
                    const dax = rest.substring(eqIdx + 1).trim();
                    currentMeasure = { name, table: tableName, daxExpression: dax, formatString: "" };
                    measures.push(currentMeasure);
                    // Check if DAX continues on next lines
                    collectingExpression = true;
                    expressionLines = [dax];
                }
                continue;
            }
            // New column at depth 1
            if (tabCount === 1 && /^\tcolumn\s+/.test(line)) {
                if (currentMeasure && collectingExpression) {
                    currentMeasure.daxExpression = expressionLines.join("\n").trim();
                }
                collectingExpression = false;
                expressionLines = [];
                currentMeasure = null;
                const colRest = trimmed.replace(/^\s*column\s+/, "");
                const colEq = colRest.indexOf("=");
                const colName = (colEq > 0 ? colRest.substring(0, colEq) : colRest).trim().replace(/^'(.*)'$/, "$1");
                const isCalculated = colEq > 0;
                currentColumn = { name: colName, table: tableName, dataType: "string", isKey: false, isHidden: false, isCalculated };
                columns.push(currentColumn);
                continue;
            }
            // Calc group section at depth 1
            if (tabCount === 1 && /^\tcalculationGroup/.test(line)) {
                isCalcGroupTable = true;
                inCalcGroupSection = true;
                calcGroupDesc = pendingCalcDesc;
                pendingCalcDesc = "";
                currentMeasure = null;
                currentColumn = null;
                collectingExpression = false;
                expressionLines = [];
                continue;
            }
            // Inside calc group: depth-2 lines
            if (inCalcGroupSection && tabCount === 2) {
                const t2 = trimmed.trim();
                // Doc comment for next item
                if (t2.startsWith("///")) {
                    if (currentCalcItem) {
                        // Flush previous item expression
                        if (collectingCalcItemExpr) {
                            currentCalcItem.expression = calcItemExprLines.join("\n").trim();
                            collectingCalcItemExpr = false;
                            calcItemExprLines = [];
                        }
                        calcGroupItems.push(currentCalcItem);
                        currentCalcItem = null;
                    }
                    pendingCalcDesc += (pendingCalcDesc ? " " : "") + t2.replace(/^\/\/\/\s*/, "");
                    continue;
                }
                // precedence property
                if (t2.startsWith("precedence:")) {
                    calcGroupPrecedence = parseInt(t2.replace("precedence:", "").trim()) || 10;
                    continue;
                }
                // calculationItem Name = expr
                const ciMatch = t2.match(/^calculationItem\s+'?([^'=]+?)'?\s*=\s*(.*)$/);
                if (ciMatch) {
                    if (currentCalcItem) {
                        if (collectingCalcItemExpr) {
                            currentCalcItem.expression = calcItemExprLines.join("\n").trim();
                            collectingCalcItemExpr = false;
                            calcItemExprLines = [];
                        }
                        calcGroupItems.push(currentCalcItem);
                    }
                    const itemExpr = ciMatch[2].trim();
                    currentCalcItem = {
                        name: ciMatch[1].trim(),
                        ordinal: calcItemOrdinal++,
                        expression: itemExpr,
                        formatStringExpression: "",
                        description: pendingCalcDesc,
                    };
                    pendingCalcDesc = "";
                    if (!itemExpr) {
                        collectingCalcItemExpr = true;
                        calcItemExprLines = [];
                    }
                    continue;
                }
                // formatStringDefinition or other known props on item
                if (currentCalcItem && t2.startsWith("formatStringExpression:")) {
                    currentCalcItem.formatStringExpression = t2.replace("formatStringExpression:", "").trim();
                    continue;
                }
                // Expression continuation at depth 3
                if (collectingCalcItemExpr && currentCalcItem && tabCount >= 3) {
                    calcItemExprLines.push(t2);
                    continue;
                }
                continue;
            }
            // Depth 3 inside calc item expression
            if (inCalcGroupSection && collectingCalcItemExpr && currentCalcItem && tabCount >= 3) {
                calcItemExprLines.push(trimmed.trim());
                continue;
            }
            // Other depth-1 items (partition, hierarchy, etc.) end current measure/column
            if (tabCount === 1 && !line.match(/^\t\s/)) {
                // Exit calc group section
                if (inCalcGroupSection) {
                    if (currentCalcItem) {
                        if (collectingCalcItemExpr)
                            currentCalcItem.expression = calcItemExprLines.join("\n").trim();
                        calcGroupItems.push(currentCalcItem);
                        currentCalcItem = null;
                    }
                    inCalcGroupSection = false;
                }
                if (currentMeasure && collectingExpression) {
                    currentMeasure.daxExpression = expressionLines.join("\n").trim();
                }
                collectingExpression = false;
                expressionLines = [];
                currentMeasure = null;
                // Skip the Name column that belongs to the calc group table
                if (isCalcGroupTable && /^\tcolumn\s+/.test(line)) {
                    currentColumn = null;
                    continue;
                }
                currentColumn = null;
                continue;
            }
            // Depth 2+ properties
            if (tabCount >= 2) {
                const propLine = trimmed.trim();
                // Known TMDL property keywords that terminate expression collection
                const tmdlProps = ["formatString:", "lineageTag:", "summarizeBy:", "dataType:", "sourceColumn:", "displayFolder:", "description:", "isHidden:", "isKey:", "sortByColumn:", "isNameInferred:", "isDataTypeInferred:"];
                const isProp = tmdlProps.some(p => propLine.startsWith(p));
                if (isProp) {
                    // Flush expression before reading properties
                    if (currentMeasure && collectingExpression && expressionLines.length > 0) {
                        currentMeasure.daxExpression = expressionLines.join("\n").trim();
                        collectingExpression = false;
                        expressionLines = [];
                    }
                    if (propLine.startsWith("formatString:") && currentMeasure) {
                        currentMeasure.formatString = propLine.replace("formatString:", "").trim();
                    }
                    if (propLine.startsWith("dataType:") && currentColumn) {
                        currentColumn.dataType = propLine.replace("dataType:", "").trim();
                    }
                    if (propLine.startsWith("isKey:") && currentColumn) {
                        currentColumn.isKey = propLine.replace("isKey:", "").trim().toLowerCase() === "true";
                    }
                    if (propLine.startsWith("isHidden:") && currentColumn) {
                        currentColumn.isHidden = propLine.replace("isHidden:", "").trim().toLowerCase() === "true";
                    }
                    continue;
                }
                // Annotation/expression continuation at depth 2
                if (propLine.startsWith("annotation ") || propLine.startsWith("changedProperty ") || propLine.startsWith("extendedProperty ")) {
                    if (currentMeasure && collectingExpression) {
                        currentMeasure.daxExpression = expressionLines.join("\n").trim();
                        collectingExpression = false;
                        expressionLines = [];
                    }
                    continue;
                }
                // Multi-line DAX expression continuation (depth 3+)
                if (collectingExpression && currentMeasure && tabCount >= 3) {
                    expressionLines.push(propLine);
                    continue;
                }
            }
        }
        // Flush final measure
        if (currentMeasure && collectingExpression) {
            currentMeasure.daxExpression = expressionLines.join("\n").trim();
        }
        // Flush final calc item and register calc group
        if (isCalcGroupTable) {
            if (currentCalcItem) {
                if (collectingCalcItemExpr)
                    currentCalcItem.expression = calcItemExprLines.join("\n").trim();
                calcGroupItems.push(currentCalcItem);
            }
            calcGroups.push({ name: tableName, description: calcGroupDesc, precedence: calcGroupPrecedence, items: calcGroupItems });
        }
    }
    return { measures, columns, relationships, functions, calcGroups };
}
function parseBimModel(modelPath) {
    const bimPath = path.join(modelPath, "model.bim");
    if (!fs.existsSync(bimPath)) {
        const defBimPath = path.join(modelPath, "definition", "model.bim");
        if (!fs.existsSync(defBimPath))
            throw new Error("No model.bim found");
        return parseBimFile(defBimPath);
    }
    return parseBimFile(bimPath);
}
function bimExprToString(expr) {
    if (Array.isArray(expr))
        return expr.join("\n");
    return expr || "";
}
function parseBimFile(bimPath) {
    let bim;
    try {
        bim = JSON.parse(fs.readFileSync(bimPath, "utf8"));
    }
    catch (err) {
        warnParseOnce(bimPath, err);
        lastParseWarnings.push(`${path.basename(bimPath)}: ${err instanceof Error ? err.message : String(err)}`);
        return { measures: [], columns: [], relationships: [], functions: [], calcGroups: [] };
    }
    const measures = [];
    const columns = [];
    for (const table of bim.model?.tables || []) {
        const tableName = table.name || "";
        for (const m of table.measures || []) {
            measures.push({
                name: m.name || "",
                table: tableName,
                daxExpression: bimExprToString(m.expression),
                formatString: m.formatString || "",
            });
        }
        for (const c of table.columns || []) {
            if (c.type === "rowNumber")
                continue;
            columns.push({
                name: c.name || "",
                table: tableName,
                dataType: c.dataType || "string",
                isKey: c.isKey === true,
                isHidden: c.isHidden === true,
                isCalculated: c.type === "calculated",
            });
        }
    }
    const relationships = (bim.model?.relationships || []).map((r) => ({
        fromTable: r.fromTable || "",
        fromColumn: r.fromColumn || "",
        toTable: r.toTable || "",
        toColumn: r.toColumn || "",
        isActive: r.isActive !== false,
    }));
    const functions = [];
    for (const expr of bim.model?.expressions || []) {
        if (expr.kind === "m")
            continue; // skip M parameters
        const exprText = bimExprToString(expr.expression);
        const paramMatch = exprText.match(/^\(\s*(.*?)\s*\)\s*=>/s);
        functions.push({
            name: expr.name || "",
            parameters: paramMatch ? paramMatch[1].replace(/\s+/g, " ").trim() : "",
            expression: paramMatch ? exprText.replace(/^\(.*?\)\s*=>\s*/s, "").trim() : exprText.trim(),
            description: expr.description || "",
        });
    }
    const calcGroups = [];
    for (const table of bim.model?.tables || []) {
        if (!table.calculationGroup)
            continue;
        const cg = table.calculationGroup;
        const items = (cg.calculationItems || []).map((ci, idx) => ({
            name: ci.name || "",
            ordinal: ci.ordinal ?? idx,
            expression: bimExprToString(ci.expression),
            formatStringExpression: bimExprToString(ci.formatStringDefinition),
            description: ci.description || "",
        }));
        items.sort((a, b) => a.ordinal - b.ordinal);
        calcGroups.push({ name: table.name || "", description: table.description || "", precedence: cg.precedence ?? 0, items });
    }
    return { measures, columns, relationships, functions, calcGroups };
}
function parseModel(modelPath) {
    lastParseWarnings = [];
    const tablesDir = path.join(modelPath, "definition", "tables");
    if (fs.existsSync(tablesDir) && fs.readdirSync(tablesDir).some(f => f.endsWith(".tmdl"))) {
        return parseTmdlModel(modelPath);
    }
    return parseBimModel(modelPath);
}
let fieldInventoryCache = null;
/** Invalidate the field-inventory cache (called from invalidateCache()). */
function invalidateFieldInventoryCache() {
    fieldInventoryCache = null;
}
/**
 * Build (or return cached) field inventory for a report.
 *
 * Uses the same `findSemanticModelPath` + `parseModel` pipeline as
 * `buildFullData`, but only keeps tables / columns / measures. Adds
 * extension-measures from `reportExtensions.json` so measures authored at
 * the report layer are accepted as valid bind targets.
 *
 * Returns `null` when:
 *   - the sibling `.SemanticModel` folder is missing
 *   - the model file(s) can't be parsed
 *   - any other I/O error
 *
 * Callers MUST treat `null` as "cannot validate" (degrade to silent skip),
 * never as "model is empty". This keeps live-connect and offline workflows
 * working.
 */
function getModelFieldInventory(reportPath) {
    if (fieldInventoryCache && fieldInventoryCache.reportPath === reportPath) {
        return fieldInventoryCache.inventory;
    }
    let rawModel = null;
    try {
        const modelPath = findSemanticModelPath(reportPath);
        rawModel = parseModel(modelPath);
    }
    catch {
        // Missing .SemanticModel or parse failure — degrade to null so validation
        // is skipped rather than failing every bind call.
        return null;
    }
    if (!rawModel)
        return null;
    const tables = new Map();
    const getTable = (name) => {
        let t = tables.get(name);
        if (!t) {
            t = { columns: new Set(), measures: new Set() };
            tables.set(name, t);
        }
        return t;
    };
    for (const c of rawModel.columns) {
        if (!c.table || !c.name)
            continue;
        getTable(c.table).columns.add(c.name);
    }
    for (const m of rawModel.measures) {
        if (!m.table || !m.name)
            continue;
        getTable(m.table).measures.add(m.name);
    }
    // Calc-group tables expose their calc items as measures to the report layer.
    for (const cg of rawModel.calcGroups ?? []) {
        if (!cg.name)
            continue;
        const t = getTable(cg.name);
        for (const item of cg.items ?? []) {
            if (item.name)
                t.measures.add(item.name);
        }
    }
    // Extension measures — reportExtensions.json lives under the .Report folder.
    const extensionMeasures = new Map();
    try {
        const extPath = path.join(reportPath, "definition", "reportExtensions.json");
        if (fs.existsSync(extPath)) {
            const ext = JSON.parse(fs.readFileSync(extPath, "utf8"));
            for (const entity of ext?.entities ?? []) {
                const tableName = entity?.name;
                if (!tableName)
                    continue;
                let set = extensionMeasures.get(tableName);
                if (!set) {
                    set = new Set();
                    extensionMeasures.set(tableName, set);
                }
                for (const m of entity?.measures ?? []) {
                    if (m?.name)
                        set.add(m.name);
                }
                // Extension measures also live under their parent table in the
                // unified inventory so measure lookups succeed without special-casing.
                const tbl = getTable(tableName);
                for (const m of entity?.measures ?? []) {
                    if (m?.name)
                        tbl.measures.add(m.name);
                }
            }
        }
    }
    catch {
        // Extension file corrupt / unreadable — skip, don't fail the whole build.
    }
    const inventory = {
        tables,
        tableNames: [...tables.keys()],
        extensionMeasures,
        builtAt: Date.now(),
    };
    fieldInventoryCache = { reportPath, inventory };
    return inventory;
}
// ═══════════════════════════════════════════════════════════════════════════════
// Step 3: Parse DAX Dependencies
// ═══════════════════════════════════════════════════════════════════════════════
function parseDaxDependencies(daxExpression, allMeasureNames) {
    const deps = new Set();
    for (const name of allMeasureNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\[${escaped}\\]`, "gi").test(daxExpression)) {
            deps.add(name);
        }
    }
    return [...deps];
}
function extractFieldRef(field) {
    if (field.Measure) {
        return { fieldType: "measure", fieldName: field.Measure.Property, tableName: field.Measure.Expression?.SourceRef?.Entity || "" };
    }
    else if (field.Column) {
        return { fieldType: "column", fieldName: field.Column.Property, tableName: field.Column.Expression?.SourceRef?.Entity || "" };
    }
    else if (field.Aggregation) {
        const col = field.Aggregation.Expression?.Column;
        if (col)
            return { fieldType: "aggregation", fieldName: col.Property, tableName: col.Expression?.SourceRef?.Entity || "" };
    }
    else if (field.HierarchyLevel) {
        const h = field.HierarchyLevel;
        const entity = h.Expression?.Hierarchy?.Expression?.SourceRef?.Entity;
        const level = h.Level;
        if (entity && level)
            return { fieldType: "column", fieldName: level, tableName: entity };
    }
    return null;
}
function scanReportBindings(reportPath) {
    const project = new pbir_js_1.PbirProject(reportPath);
    const pageIds = project.listPageIds();
    const bindings = [];
    const hiddenPages = [];
    let totalVisuals = 0;
    for (const pageId of pageIds) {
        const page = project.getPage(pageId);
        const pageName = page.displayName || pageId;
        if (page.visibility === "HiddenInViewMode")
            hiddenPages.push(pageName);
        const visualIds = project.listVisualIds(pageId);
        for (const visualId of visualIds) {
            totalVisuals++;
            try {
                const visual = project.getVisual(pageId, visualId);
                const visualType = visual.visual?.visualType || "unknown";
                const visualTitle = extractVisualTitle(visual) || visualType;
                const vId = visual.name || visualId;
                const ctx = { pageId, pageName, visualId: vId, visualType, visualTitle };
                // Scan queryState projections
                const queryState = visual.visual?.query?.queryState;
                if (queryState) {
                    for (const [bucket, bucketData] of Object.entries(queryState)) {
                        const projections = bucketData.projections || [];
                        for (const proj of projections) {
                            if (!proj.field)
                                continue;
                            const ref = extractFieldRef(proj.field);
                            if (ref)
                                bindings.push({ ...ref, bindingRole: bucket, ...ctx });
                        }
                    }
                }
                // Scan filter bindings
                const filters = visual.filterConfig?.filters || [];
                for (const f of filters) {
                    if (!f.field)
                        continue;
                    const ref = extractFieldRef(f.field);
                    if (ref)
                        bindings.push({ ...ref, bindingRole: "Filter", ...ctx });
                }
                // Scan objects section (conditional formatting: images, reference labels, colors, icons, etc.)
                const objects = visual.visual?.objects;
                if (objects && typeof objects === "object") {
                    const walkExpr = (obj, role) => {
                        if (!obj || typeof obj !== "object")
                            return;
                        if (obj.expr) {
                            const ref = extractFieldRef(obj.expr);
                            if (ref)
                                bindings.push({ ...ref, bindingRole: role, ...ctx });
                        }
                        if (Array.isArray(obj)) {
                            for (const item of obj)
                                walkExpr(item, role);
                        }
                        else {
                            for (const val of Object.values(obj))
                                walkExpr(val, role);
                        }
                    };
                    for (const [objectType, objectArr] of Object.entries(objects)) {
                        walkExpr(objectArr, objectType);
                    }
                }
            }
            catch { /* skip unreadable visuals */ }
        }
    }
    return { bindings, pageCount: pageIds.length, visualCount: totalVisuals, hiddenPages };
}
function extractVisualTitle(visual) {
    try {
        const vco = visual.visual?.visualContainerObjects;
        if (vco?.title) {
            for (const item of vco.title) {
                const textProp = item?.properties?.text;
                if (textProp?.expr?.Literal?.Value) {
                    return textProp.expr.Literal.Value.replace(/^'(.*)'$/, "$1");
                }
            }
        }
    }
    catch { /* fallback */ }
    return "";
}
// ═══════════════════════════════════════════════════════════════════════════════
// Step 5-7: Cross-Reference + Build Full Data
// ═══════════════════════════════════════════════════════════════════════════════
function buildFullData(reportPath) {
    const modelPath = findSemanticModelPath(reportPath);
    const rawModel = parseModel(modelPath);
    const allMeasureNames = rawModel.measures.map(m => m.name);
    const { bindings, pageCount, visualCount, hiddenPages } = scanReportBindings(reportPath);
    // Build measures
    const measures = rawModel.measures.map(m => {
        const deps = parseDaxDependencies(m.daxExpression, allMeasureNames.filter(n => n !== m.name));
        const usedIn = bindings
            .filter(b => b.fieldType === "measure" && b.fieldName === m.name && b.tableName === m.table)
            .map(b => ({ pageId: b.pageId, pageName: b.pageName, visualId: b.visualId, visualType: b.visualType, visualTitle: b.visualTitle, bindingRole: b.bindingRole }));
        // Deduplicate by visual (same measure can appear in same visual via autoFilter)
        const uniqueVisuals = new Map();
        for (const u of usedIn) {
            const key = `${u.pageId}|${u.visualId}`;
            const existing = uniqueVisuals.get(key);
            // Prefer non-Filter binding role
            if (!existing || (existing.bindingRole === "Filter" && u.bindingRole !== "Filter"))
                uniqueVisuals.set(key, u);
        }
        const dedupedUsedIn = [...uniqueVisuals.values()];
        return {
            name: m.name,
            table: m.table,
            daxExpression: m.daxExpression,
            formatString: m.formatString,
            daxDependencies: deps,
            dependedOnBy: [], // filled below
            usedIn: dedupedUsedIn,
            usageCount: dedupedUsedIn.length,
            pageCount: new Set(dedupedUsedIn.map(u => u.pageName)).size,
            status: "unused", // classified below
        };
    });
    // Build columns
    const SLICER_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
    const columns = rawModel.columns.map(c => {
        const usedIn = bindings
            .filter(b => (b.fieldType === "column" || b.fieldType === "aggregation") && b.fieldName === c.name && b.tableName === c.table)
            .map(b => ({ pageId: b.pageId, pageName: b.pageName, visualId: b.visualId, visualType: b.visualType, visualTitle: b.visualTitle, bindingRole: b.bindingRole }));
        const uniqueVisuals = new Map();
        for (const u of usedIn) {
            const key = `${u.pageId}|${u.visualId}`;
            const existing = uniqueVisuals.get(key);
            if (!existing || (existing.bindingRole === "Filter" && u.bindingRole !== "Filter"))
                uniqueVisuals.set(key, u);
        }
        const dedupedUsedIn = [...uniqueVisuals.values()];
        return {
            name: c.name,
            table: c.table,
            dataType: c.dataType,
            isSlicerField: dedupedUsedIn.some(u => SLICER_TYPES.has(u.visualType)),
            isKey: c.isKey,
            isHidden: c.isHidden,
            isCalculated: c.isCalculated,
            usedIn: dedupedUsedIn,
            usageCount: dedupedUsedIn.length,
            pageCount: new Set(dedupedUsedIn.map(u => u.pageName)).size,
            status: "unused", // classified below
        };
    });
    // Reverse dependencies
    for (const m of measures) {
        m.dependedOnBy = measures.filter(x => x.daxDependencies.includes(m.name)).map(x => x.name);
    }
    // ── Classify measures: direct → indirect → unused ──
    // Direct: bound to a visual
    for (const m of measures) {
        if (m.usageCount > 0)
            m.status = "direct";
    }
    // Indirect: referenced (transitively) by any direct measure
    const measureMap = new Map(measures.map(m => [m.name, m]));
    const markIndirect = (name, visited) => {
        if (visited.has(name))
            return;
        visited.add(name);
        const m = measureMap.get(name);
        if (!m)
            return;
        for (const dep of m.daxDependencies) {
            const dm = measureMap.get(dep);
            if (dm && dm.status === "unused")
                dm.status = "indirect";
            markIndirect(dep, visited);
        }
    };
    for (const m of measures) {
        if (m.status === "direct" || m.status === "indirect") {
            markIndirect(m.name, new Set());
        }
    }
    // ── Classify columns: direct → indirect → unused ──
    // Direct: bound to a visual
    for (const c of columns) {
        if (c.usageCount > 0) {
            c.status = "direct";
            continue;
        }
    }
    // Indirect: referenced in any measure's DAX or used in a relationship
    const relationshipColumns = new Set();
    for (const r of rawModel.relationships) {
        relationshipColumns.add(`${r.fromTable}|${r.fromColumn}`);
        relationshipColumns.add(`${r.toTable}|${r.toColumn}`);
    }
    // Build set of columns referenced in DAX
    const daxReferencedColumns = new Set();
    for (const m of measures) {
        if (m.status === "unused")
            continue; // only check direct/indirect measures
        for (const c of columns) {
            if (daxReferencedColumns.has(`${c.table}|${c.name}`))
                continue;
            const qualifiedRef = `${c.table}[${c.name}]`;
            const shortRef = `[${c.name}]`;
            if (m.daxExpression.includes(qualifiedRef) || m.daxExpression.includes(shortRef)) {
                daxReferencedColumns.add(`${c.table}|${c.name}`);
            }
        }
    }
    for (const c of columns) {
        if (c.status !== "unused")
            continue;
        const key = `${c.table}|${c.name}`;
        if (relationshipColumns.has(key) || daxReferencedColumns.has(key)) {
            c.status = "indirect";
        }
    }
    // Build page data
    const pageMap = new Map();
    const addToPage = (pageName, visualType, visualTitle, fieldName, fieldTable, fieldType) => {
        if (!pageMap.has(pageName))
            pageMap.set(pageName, { name: pageName, visuals: new Map(), measures: new Set(), columns: new Set() });
        const p = pageMap.get(pageName);
        const vKey = visualTitle || visualType;
        if (!p.visuals.has(vKey))
            p.visuals.set(vKey, { type: visualType, title: vKey, bindings: [] });
        const vBindings = p.visuals.get(vKey).bindings;
        if (!vBindings.some(b => b.fieldName === fieldName && b.fieldTable === fieldTable)) {
            vBindings.push({ fieldName, fieldTable, fieldType });
        }
        if (fieldType === "measure")
            p.measures.add(fieldName);
        else
            p.columns.add(fieldName);
    };
    measures.forEach(m => m.usedIn.forEach(u => addToPage(u.pageName, u.visualType, u.visualTitle, m.name, m.table, "measure")));
    columns.forEach(c => c.usedIn.forEach(u => addToPage(u.pageName, u.visualType, u.visualTitle, c.name, c.table, "column")));
    // Build table data — aggregate columns + measures + relationships per table
    const calcGroupNames = new Set(rawModel.calcGroups.map(cg => cg.name));
    const tableNames = new Set();
    rawModel.columns.forEach(c => tableNames.add(c.table));
    rawModel.measures.forEach(m => tableNames.add(m.table));
    // Ensure calc group tables appear even if they have no non-system columns
    calcGroupNames.forEach(n => tableNames.add(n));
    const tables = [...tableNames].sort((a, b) => a.localeCompare(b)).map(tableName => {
        // Outgoing: this table's column is the `fromColumn` (FK pointing to another table)
        // Incoming: this table's column is the `toColumn` (PK referenced by another table's FK)
        const outgoingRels = rawModel.relationships.filter(r => r.fromTable === tableName);
        const incomingRels = rawModel.relationships.filter(r => r.toTable === tableName);
        const fkByColumn = new Map();
        outgoingRels.forEach(r => fkByColumn.set(r.fromColumn, { table: r.toTable, column: r.toColumn }));
        const incomingByColumn = new Map();
        incomingRels.forEach(r => {
            const list = incomingByColumn.get(r.toColumn) || [];
            list.push({ table: r.fromTable, column: r.fromColumn, isActive: r.isActive });
            incomingByColumn.set(r.toColumn, list);
        });
        // Pull matching ModelColumn entries for this table (skip calc group implicit Name column)
        const tableColumns = columns
            .filter(c => c.table === tableName)
            .filter(c => !(calcGroupNames.has(tableName) && c.name === "Name"))
            .map(c => {
            const fkTarget = fkByColumn.get(c.name);
            const incomingRefs = incomingByColumn.get(c.name) || [];
            return {
                name: c.name,
                dataType: c.dataType || "string",
                isKey: c.isKey,
                isInferredPK: incomingRefs.length > 0,
                isHidden: c.isHidden,
                isCalculated: c.isCalculated,
                isFK: !!fkTarget,
                fkTarget,
                incomingRefs,
                usageCount: c.usageCount,
                status: c.status,
            };
        })
            .sort((a, b) => {
            // PK (explicit or inferred) first, then FK, then the rest alphabetical
            const aPK = a.isKey || a.isInferredPK;
            const bPK = b.isKey || b.isInferredPK;
            if (aPK !== bPK)
                return aPK ? -1 : 1;
            if (a.isFK !== b.isFK)
                return a.isFK ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        const tableMeasures = measures
            .filter(m => m.table === tableName)
            .map(m => ({ name: m.name, status: m.status, usageCount: m.usageCount }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const tableRels = [
            ...outgoingRels.map(r => ({ direction: "outgoing", fromTable: r.fromTable, fromColumn: r.fromColumn, toTable: r.toTable, toColumn: r.toColumn, isActive: r.isActive })),
            ...incomingRels.map(r => ({ direction: "incoming", fromTable: r.fromTable, fromColumn: r.fromColumn, toTable: r.toTable, toColumn: r.toColumn, isActive: r.isActive })),
        ];
        return {
            name: tableName,
            isCalcGroup: calcGroupNames.has(tableName),
            columnCount: tableColumns.length,
            measureCount: tableMeasures.length,
            keyCount: tableColumns.filter(c => c.isKey || c.isInferredPK).length,
            fkCount: tableColumns.filter(c => c.isFK).length,
            hiddenColumnCount: tableColumns.filter(c => c.isHidden).length,
            columns: tableColumns,
            measures: tableMeasures,
            relationships: tableRels,
        };
    });
    const pages = [...pageMap.values()].map(p => {
        const visuals = [...p.visuals.values()];
        const typeCounts = {};
        visuals.forEach(v => { typeCounts[v.type] = (typeCounts[v.type] || 0) + 1; });
        return {
            name: p.name,
            visualCount: visuals.length,
            measures: [...p.measures],
            columns: [...p.columns],
            measureCount: p.measures.size,
            columnCount: p.columns.size,
            slicerCount: typeCounts["slicer"] || 0,
            typeCounts,
            coverage: rawModel.measures.length > 0 ? Math.round(p.measures.size / rawModel.measures.length * 100) : 0,
            visuals,
        };
    });
    return {
        measures,
        columns,
        relationships: rawModel.relationships,
        functions: rawModel.functions,
        calcGroups: rawModel.calcGroups,
        tables,
        pages,
        hiddenPages,
        totals: {
            measuresInModel: measures.length,
            measuresDirect: measures.filter(m => m.status === "direct").length,
            measuresIndirect: measures.filter(m => m.status === "indirect").length,
            measuresUnused: measures.filter(m => m.status === "unused").length,
            columnsInModel: columns.length,
            columnsDirect: columns.filter(c => c.status === "direct").length,
            columnsIndirect: columns.filter(c => c.status === "indirect").length,
            columnsUnused: columns.filter(c => c.status === "unused").length,
            relationships: rawModel.relationships.length,
            functions: rawModel.functions.length,
            calcGroups: rawModel.calcGroups.length,
            tables: tables.length,
            pages: pageCount,
            visuals: visualCount,
        },
    };
}
// ═══════════════════════════════════════════════════════════════════════════════
// HTML Dashboard Generation
// ═══════════════════════════════════════════════════════════════════════════════
function generateHTML(data, reportName) {
    const ts = new Date().toISOString().replace("T", " ").substring(0, 16);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Model Usage - ${reportName}</title>
<script>(function(){try{var t=localStorage.getItem('usage-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{
    --bg:#0B0D11;--surface:#1A1D27;--surface-alt:#12141A;--surface-deep:#12141C;--surface-center:#14161C;
    --border:#2A2D3A;--border-soft:#1E2028;--border-row:#1A1D27;
    --text:#F8FAFC;--text-body:#E2E8F0;--text-muted:#94A3B8;--text-dim:#7A8595;--text-faint:#5E6A7B;--text-fainter:#4A5566;
    --row-hover:#1A1D27;--hover-border:#475569;
    --chip-dep-bg:rgba(139,92,246,.1);--chip-dep-bd:rgba(139,92,246,.2);--chip-dep-tx:#A78BFA;--chip-dep-hover:rgba(139,92,246,.2);
    --chip-used-bg:rgba(59,130,246,.1);--chip-used-bd:rgba(59,130,246,.15);--chip-used-tx:#93C5FD;
    --code-name:#93C5FD;--code-type:#A78BFA;--code-punct:#475569;
    --accent:#3B82F6;
  }
  [data-theme="light"]{
    --bg:#F8FAFC;--surface:#FFFFFF;--surface-alt:#F1F5F9;--surface-deep:#FFFFFF;--surface-center:#FFFBEB;
    --border:#E2E8F0;--border-soft:#F1F5F9;--border-row:#F1F5F9;
    --text:#0F172A;--text-body:#1E293B;--text-muted:#475569;--text-dim:#64748B;--text-faint:#94A3B8;--text-fainter:#CBD5E1;
    --row-hover:#F1F5F9;--hover-border:#94A3B8;
    --chip-dep-bg:rgba(139,92,246,.08);--chip-dep-bd:rgba(139,92,246,.3);--chip-dep-tx:#6D28D9;--chip-dep-hover:rgba(139,92,246,.15);
    --chip-used-bg:rgba(59,130,246,.08);--chip-used-bd:rgba(59,130,246,.25);--chip-used-tx:#1D4ED8;
    --code-name:#1D4ED8;--code-type:#6D28D9;--code-punct:#94A3B8;
    --accent:#2563EB;
  }
  body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--text-body);min-height:100vh;transition:background .2s,color .2s}
  .mono{font-family:'JetBrains Mono',monospace}
  .container{max-width:1100px;margin:0 auto;padding:20px 16px}
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
  .header-left .top{display:flex;align-items:center;gap:8px}
  .header-label{font-size:13px;color:var(--accent);font-weight:700;font-family:'JetBrains Mono',monospace}
  .header-sep{font-size:13px;color:var(--text-fainter)}
  .header-sub{font-size:13px;color:var(--text-dim)}
  .timestamp{font-size:10px;color:var(--text-fainter);font-family:'JetBrains Mono',monospace;margin-top:4px}
  .header-actions{display:flex;gap:6px;align-items:center}
  .theme-btn{padding:6px 10px;font-size:13px;line-height:1;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface);color:var(--text-dim);transition:all .15s}
  .theme-btn:hover{background:var(--border);color:var(--text);border-color:var(--accent)}
  .refresh-btn{padding:6px 14px;font-size:11px;font-family:'JetBrains Mono',monospace;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface);color:var(--text-dim);transition:all .15s}
  .refresh-btn:hover{background:var(--border);color:var(--text);border-color:var(--accent)}
  .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
  .stat-detail{font-size:10px;color:var(--text-faint);margin-top:2px;font-family:'JetBrains Mono',monospace}
  .stat{background:var(--surface);border-radius:8px;border:1px solid var(--border);padding:12px 14px;text-align:center}
  .stat-value{font-size:22px;font-weight:700;color:var(--text)}
  .stat-value.good{color:#22C55E}.stat-value.warn{color:#F59E0B}.stat-value.danger{color:#EF4444}
  .stat-label{font-size:10px;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
  .tabs{display:flex;gap:2px;margin-bottom:16px;border-bottom:1px solid var(--border-soft)}
  .tab{padding:8px 16px;font-size:13px;border:none;border-bottom:2px solid transparent;cursor:pointer;background:none;color:var(--text-dim);font-family:inherit;font-weight:500;transition:all .15s}
  .tab.active{color:var(--text);border-bottom-color:var(--accent)}
  .tab:hover:not(.active){color:var(--text-muted)}
  .tab .badge{font-size:10px;background:var(--border);color:var(--text-muted);padding:1px 6px;border-radius:10px;margin-left:6px;font-family:'JetBrains Mono',monospace}
  .tab .badge.warn{background:rgba(245,158,11,.15);color:#F59E0B}
  .panel{display:none}.panel.active{display:block}
  .search-row{display:flex;gap:10px;margin-bottom:14px;align-items:center}
  .search-input{flex:1;padding:7px 12px;font-size:13px;font-family:inherit;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text-body);outline:none;transition:border-color .15s}
  .search-input:focus{border-color:var(--accent)}
  .search-input::placeholder{color:var(--text-faint)}
  .filter-btn{padding:6px 12px;font-size:11px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface);color:var(--text-dim);font-family:inherit;transition:all .15s}
  .filter-btn:hover,.filter-btn.active{background:var(--border);color:var(--text)}
  .filter-btn.active{border-color:var(--accent);color:var(--accent)}
  .data-table{width:100%;border-collapse:collapse}
  .data-table th{text-align:left;padding:8px 12px;font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);font-weight:600;cursor:pointer;user-select:none;white-space:nowrap}
  .data-table th:hover{color:var(--text-muted)}
  .data-table td{padding:8px 12px;font-size:13px;border-bottom:1px solid var(--border-row);vertical-align:top}
  .data-table tr{transition:background .1s}
  .data-table tr:hover{background:var(--row-hover)}
  .data-table tr.unused{opacity:.5}
  .data-table tr.unused td:first-child{border-left:3px solid #EF4444;padding-left:9px}
  .data-table tr.indirect{opacity:.7}
  .data-table tr.indirect td:first-child{border-left:3px solid #F59E0B;padding-left:9px}
  .field-name{font-weight:600;color:var(--text);cursor:pointer;transition:color .15s;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:2px}
  .field-name:hover{color:var(--accent);text-decoration-color:var(--accent)}
  .field-table{font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace}
  .usage-count{font-family:'JetBrains Mono',monospace;font-weight:600}
  .usage-count.zero{color:#EF4444}.usage-count.low{color:#F59E0B}.usage-count.good{color:#22C55E}
  .dep-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;margin:1px 2px;font-family:'JetBrains Mono',monospace;background:var(--chip-dep-bg);color:var(--chip-dep-tx);border:1px solid var(--chip-dep-bd);cursor:pointer;transition:all .15s}
  .dep-chip:hover{background:var(--chip-dep-hover);border-color:var(--chip-dep-tx)}
  .used-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;margin:1px 2px;background:var(--chip-used-bg);color:var(--chip-used-tx);border:1px solid var(--chip-used-bd)}
  .slicer-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(236,72,153,.12);color:#EC4899;font-weight:600;margin-left:4px}
  .hidden-badge{font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(139,92,246,.15);color:#A78BFA;border:1px solid rgba(139,92,246,.3);font-weight:600;letter-spacing:.05em;margin-left:8px;vertical-align:middle;cursor:help}
  [data-theme="light"] .hidden-badge{background:rgba(139,92,246,.1);color:#6D28D9;border-color:rgba(139,92,246,.35)}
  .pk-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,.15);color:#F59E0B;border:1px solid rgba(245,158,11,.3);font-weight:700;letter-spacing:.05em;margin-left:6px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
  .fk-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(59,130,246,.12);color:#3B82F6;border:1px solid rgba(59,130,246,.28);font-weight:700;letter-spacing:.05em;margin-left:6px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
  .hid-col-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(100,116,139,.12);color:var(--text-dim);border:1px solid rgba(100,116,139,.25);font-weight:600;margin-left:6px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
  .calc-col-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(168,85,247,.12);color:#A855F7;border:1px solid rgba(168,85,247,.28);font-weight:600;margin-left:6px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
  [data-theme="light"] .pk-badge{background:rgba(245,158,11,.1);color:#B45309;border-color:rgba(245,158,11,.35)}
  [data-theme="light"] .fk-badge{background:rgba(59,130,246,.08);color:#1D4ED8;border-color:rgba(59,130,246,.3)}
  [data-theme="light"] .calc-col-badge{background:rgba(168,85,247,.08);color:#7E22CE;border-color:rgba(168,85,247,.3)}

  .tcol-row{display:grid;grid-template-columns:1fr 140px 220px;gap:12px;padding:6px 10px;border-radius:6px;align-items:center;font-size:12px;border-bottom:1px solid var(--border-row)}
  .tcol-row:last-child{border-bottom:none}
  .tcol-row:hover{background:var(--surface-alt)}
  .tcol-name{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-body);font-weight:500;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tcol-name:hover{color:var(--accent)}
  .tcol-type{font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tcol-fk{font-size:11px;font-family:'JetBrains Mono',monospace;line-height:1.6;white-space:normal;overflow:hidden}
  .tcol-fk .arrow{color:var(--text-faint);margin:0 4px}
  .tcol-fk .rel-out{color:#22C55E}
  .tcol-fk .rel-in{color:var(--chip-used-tx)}
  .tcol-fk .rel-inactive{opacity:.55;font-style:italic}
  [data-theme="light"] .tcol-fk .rel-out{color:#15803D}
  .pk-badge.inferred{background:transparent;color:#F59E0B;border:1px dashed rgba(245,158,11,.5)}
  [data-theme="light"] .pk-badge.inferred{color:#B45309;border-color:rgba(245,158,11,.55)}
  .trel-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--text-body)}
  .trel-row:hover{background:var(--surface-alt)}
  .trel-dir{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
  .trel-dir.out{background:rgba(34,197,94,.12);color:#22C55E;border:1px solid rgba(34,197,94,.3)}
  .trel-dir.in{background:rgba(59,130,246,.12);color:#3B82F6;border:1px solid rgba(59,130,246,.3)}
  .trel-inactive{opacity:.55;font-style:italic}
  .calc-group-pill{font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(236,72,153,.12);color:#EC4899;border:1px solid rgba(236,72,153,.3);font-weight:600;letter-spacing:.05em;margin-left:8px;vertical-align:middle}
  .format-str{font-size:11px;color:var(--text-faint);font-family:'JetBrains Mono',monospace}

  .lineage-back{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);cursor:pointer;margin-bottom:16px;transition:color .15s}
  .lineage-back:hover{color:var(--accent)}
  .lineage-hero{background:var(--surface);border-radius:10px;border:1px solid var(--border);padding:20px;margin-bottom:16px}
  .lineage-hero-title{font-size:20px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:10px}
  .lineage-hero-title .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
  .lineage-hero-meta{font-size:12px;color:var(--text-dim);margin-top:6px;font-family:'JetBrains Mono',monospace}
  .lineage-dax{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);background:var(--surface-alt);padding:10px 12px;border-radius:6px;border:1px solid var(--border);margin-top:12px;white-space:pre-wrap;word-break:break-all;line-height:1.6}

  .lineage-flow-row{display:flex;gap:0;align-items:flex-start}
  .lineage-flow-col{flex:1;display:flex;flex-direction:column;gap:6px;padding:0 8px}
  .lineage-flow-col-label{font-size:10px;color:var(--text-fainter);text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:6px;font-weight:600}
  .lineage-arrow-col{display:flex;align-items:flex-start;justify-content:center;color:var(--text-fainter);font-size:18px;flex-shrink:0;width:32px;padding-top:36px}

  .lc{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;transition:all .15s}
  .lc:hover{border-color:var(--hover-border)}
  .lc.clickable{cursor:pointer}
  .lc.clickable:hover{border-color:var(--accent)}
  .lc .lc-name{font-size:13px;font-weight:600;color:var(--text)}
  .lc .lc-sub{font-size:10px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;margin-top:2px}
  .lc .lc-role{font-size:10px;color:var(--text-faint);margin-top:3px}
  .lc.upstream{border-left:3px solid #A78BFA}
  .lc.source{border-left:3px solid #10B981}
  .lc.center{border-left:3px solid #F59E0B;background:var(--surface-center)}
  .lc.center.col-type{border-left-color:var(--accent)}
  .lc.downstream{border-left:3px solid #8B5CF6}
  .lc.empty{border-style:dashed;opacity:.4}
  .lc.udf{border-left:3px solid #14B8A6}
  .lc.feeds{border-left:3px solid #F59E0B;background:rgba(245,158,11,.04)}

  .feeds-label{font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-top:10px;margin-bottom:4px;font-weight:600}

  .page-card{background:var(--surface);border-radius:10px;border:1px solid var(--border);margin-bottom:12px;overflow:hidden;transition:border-color .15s}
  .page-card:hover{border-color:var(--hover-border)}
  .page-header{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:14px;user-select:none}
  .page-name{font-size:16px;font-weight:700;color:var(--text);flex:1}
  .page-stats{display:flex;gap:12px;align-items:center}
  .page-stat{text-align:center}
  .page-stat-val{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace}
  .page-stat-label{font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em}
  .page-expand{color:var(--text-faint);font-size:12px;transition:transform .2s;flex-shrink:0}
  .page-card.open .page-expand{transform:rotate(180deg)}
  .page-body{max-height:0;overflow:hidden;transition:max-height .3s ease}
  .page-card.open .page-body{max-height:2000px}
  .page-body-inner{padding:0 18px 16px}
  .page-section{margin-bottom:12px}
  .page-section-title{font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
  .page-section-title .line{flex:1;height:1px;background:var(--border-soft)}
  .page-visual-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;transition:background .1s;margin-bottom:2px}
  .page-visual-row:hover{background:var(--surface-alt)}
  .page-visual-type{font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;width:150px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .page-visual-title{font-size:13px;font-weight:600;color:var(--text-body);flex:0 0 220px;min-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .page-visual-bindings{display:flex;flex-wrap:wrap;gap:3px}
  .page-type-summary{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .page-type-chip{font-size:10px;padding:3px 8px;border-radius:4px;background:var(--surface-alt);color:var(--text-muted);border:1px solid var(--border);font-family:'JetBrains Mono',monospace}

  .ci-card{padding:10px 12px;border-radius:6px;background:var(--surface-alt);border:1px solid var(--border);margin-bottom:6px}
  .ci-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .ci-ord{font-size:11px;color:var(--text-faint);font-weight:600;min-width:20px}
  .ci-name{font-size:13px;font-weight:600;color:var(--text-body)}

  .has-tip{position:relative;cursor:help}
  .has-tip::after{content:attr(data-tooltip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:var(--surface);color:var(--text);border:1px solid var(--border);padding:8px 12px;border-radius:6px;font-size:11px;font-weight:400;white-space:normal;width:max-content;max-width:240px;text-align:left;pointer-events:none;opacity:0;transition:opacity .15s;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,.4);line-height:1.5;text-transform:none;letter-spacing:0}
  .has-tip::before{content:"";position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--border);pointer-events:none;opacity:0;transition:opacity .15s;z-index:1000}
  .has-tip:hover::after,.has-tip:hover::before{opacity:1}
  .summary .stat.has-tip:first-child::after{left:0;transform:none}
  .summary .stat.has-tip:first-child::before{left:24px}
  .summary .stat.has-tip:last-child::after{left:auto;right:0;transform:none}
  .summary .stat.has-tip:last-child::before{left:auto;right:24px;transform:none}

  .lineage-dax{position:relative}
  .copy-btn{position:absolute;top:6px;right:6px;width:24px;height:24px;padding:0;font-size:12px;line-height:1;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--surface);color:var(--text-dim);opacity:0;transition:all .15s;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center}
  .lineage-dax:hover .copy-btn{opacity:1}
  .copy-btn:hover{color:var(--text);background:var(--border);border-color:var(--accent)}
  .copy-btn.copied{color:#22C55E;border-color:#22C55E;opacity:1}

  .refresh-bar{position:fixed;bottom:0;left:0;right:0;height:28px;background:var(--surface-deep);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:center;gap:12px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-dim);z-index:999}
  .refresh-bar .timer{color:var(--text-muted)}
  .refresh-bar .dot{width:6px;height:6px;border-radius:50%;background:var(--text-fainter);display:inline-block}
  .refresh-bar .dot.stale{background:#F59E0B}
  .refresh-bar button{padding:2px 10px;font-size:10px;font-family:'JetBrains Mono',monospace;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:var(--surface);color:var(--text-dim);transition:all .15s}
  .refresh-bar button:hover{background:var(--border);color:var(--text);border-color:var(--accent)}

  @media(max-width:768px){.summary{grid-template-columns:repeat(3,1fr)}.lineage-flow-row{flex-direction:column}.lineage-arrow-col{transform:rotate(90deg);padding:8px 0;width:100%}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-left">
      <div class="top"><span class="header-label">MODEL USAGE</span><span class="header-sep">|</span><span class="header-sub">${reportName}</span></div>
      <div class="timestamp">Generated: ${ts}</div>
    </div>
    <div class="header-actions">
      <button class="theme-btn" id="theme-btn" onclick="toggleTheme()" title="Toggle light/dark theme" aria-label="Toggle theme">☾</button>
      <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
    </div>
  </div>
  <div class="summary" id="summary"></div>
  <div class="tabs" id="tabs"></div>

  <div class="panel" id="panel-measures">
    <div class="search-row">
      <input class="search-input" placeholder="Search measures..." oninput="filterTable('measures',this.value)">
      <button class="filter-btn" id="btn-unused-m" onclick="toggleUnused('measures')">Not on visual</button>
    </div>
    <table class="data-table"><thead><tr>
      <th onclick="sortTable('measures','name')">Measure ↕</th><th onclick="sortTable('measures','table')">Table ↕</th>
      <th onclick="sortTable('measures','usageCount')">Used ↕</th><th onclick="sortTable('measures','pageCount')">Pages ↕</th>
      <th>Dependencies</th><th>Used In</th><th>Format</th>
    </tr></thead><tbody id="tbody-measures"></tbody></table>
  </div>

  <div class="panel" id="panel-columns">
    <div class="search-row">
      <input class="search-input" placeholder="Search columns..." oninput="filterTable('columns',this.value)">
      <button class="filter-btn" id="btn-unused-c" onclick="toggleUnused('columns')">Not on visual</button>
    </div>
    <table class="data-table"><thead><tr>
      <th onclick="sortTable('columns','name')">Column ↕</th><th onclick="sortTable('columns','table')">Table ↕</th>
      <th onclick="sortTable('columns','dataType')">Type ↕</th><th onclick="sortTable('columns','usageCount')">Used ↕</th>
      <th onclick="sortTable('columns','pageCount')">Pages ↕</th><th>Used In</th>
    </tr></thead><tbody id="tbody-columns"></tbody></table>
  </div>

  <div class="panel" id="panel-tables"><div id="tables-content"></div></div>
  <div class="panel" id="panel-relationships"><div id="relationships-content"></div></div>
  <div class="panel" id="panel-functions"><div id="functions-content"></div></div>
  <div class="panel" id="panel-calcgroups"><div id="calcgroups-content"></div></div>
  <div class="panel" id="panel-pages"><div id="pages-content"></div></div>
  <div class="panel" id="panel-lineage"><div id="lineage-content"></div></div>
  <div class="panel" id="panel-unused"><div id="unused-content"></div></div>
</div>

<script>
const DATA=${JSON.stringify(data)};

function toggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme')||'dark';
  var next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('usage-theme',next);}catch(e){}
  var btn=document.getElementById('theme-btn');
  if(btn)btn.textContent=next==='dark'?'☾':'☀';
}

function addCopyButtons(){
  document.querySelectorAll('.lineage-dax:not([data-copy-wired])').forEach(function(el){
    el.setAttribute('data-copy-wired','1');
    var dax=el.textContent;
    el.setAttribute('data-dax',dax);
    var btn=document.createElement('button');
    btn.className='copy-btn';
    btn.textContent='⎘';
    btn.title='Copy DAX';
    btn.onclick=function(e){
      e.stopPropagation();
      var text=el.getAttribute('data-dax')||'';
      function ok(){btn.textContent='✓';btn.classList.add('copied');setTimeout(function(){btn.textContent='⎘';btn.classList.remove('copied');},1500);}
      function fallback(){
        var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
        var success=false;try{success=document.execCommand('copy');}catch(err){}
        document.body.removeChild(ta);
        if(success)ok();else{btn.textContent='✗';setTimeout(function(){btn.textContent='⎘';},1500);}
      }
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(ok).catch(fallback);
      }else{fallback();}
    };
    el.appendChild(btn);
  });
}
(function(){var t=document.documentElement.getAttribute('data-theme')||'dark';var btn=document.getElementById('theme-btn');if(btn)btn.textContent=t==='dark'?'☾':'☀';})();

let activeTab="measures",lastTab="measures";
let sortState={measures:{key:"usageCount",desc:true},columns:{key:"usageCount",desc:true}};
let showUnusedOnly={measures:false,columns:false};
let searchTerms={measures:"",columns:""};
let openPages=new Set();
let openTables=new Set();

const pageData=(()=>{
  const map=new Map();
  const addToPage=(pageName,visualType,visualTitle,fieldName,fieldTable,fieldType)=>{
    if(!map.has(pageName))map.set(pageName,{name:pageName,visuals:new Map(),measures:new Set(),columns:new Set()});
    const p=map.get(pageName);
    const vKey=visualTitle;
    if(!p.visuals.has(vKey))p.visuals.set(vKey,{type:visualType,title:visualTitle,bindings:[]});
    const vb=p.visuals.get(vKey).bindings;
    if(!vb.some(b=>b.fieldName===fieldName&&b.fieldTable===fieldTable))vb.push({fieldName,fieldTable,fieldType});
    if(fieldType==="measure")p.measures.add(fieldName);
    else p.columns.add(fieldName);
  };
  DATA.measures.forEach(m=>m.usedIn.forEach(u=>addToPage(u.pageName,u.visualType,u.visualTitle,m.name,m.table,"measure")));
  DATA.columns.forEach(c=>c.usedIn.forEach(u=>addToPage(u.pageName,u.visualType,u.visualTitle,c.name,c.table,"column")));
  return [...map.values()].map(p=>{
    const visuals=[...p.visuals.values()];
    const typeCounts={};
    visuals.forEach(v=>{typeCounts[v.type]=(typeCounts[v.type]||0)+1;});
    const slicerCount=typeCounts["slicer"]||0;
    const coverage=DATA.totals.measuresInModel>0?Math.round(p.measures.size/DATA.totals.measuresInModel*100):0;
    return{
      name:p.name,visualCount:visuals.length,
      measures:[...p.measures],columns:[...p.columns],
      measureCount:p.measures.size,columnCount:p.columns.size,
      slicerCount,typeCounts,coverage,visuals
    };
  });
})();

function uc(n){return n===0?"zero":n<=1?"low":"good"}

function renderSummary(){
  const t=DATA.totals;
  const totalOrphan=t.measuresUnused+t.columnsUnused;
  const hiddenCount=(DATA.hiddenPages||[]).length;
  const visibleCount=t.pages-hiddenCount;
  const tipDirect=\`Fields bound to at least one visual (data well, filter, or conditional formatting). \${t.measuresDirect} measures · \${t.columnsDirect} columns.\`;
  const tipIndirect=\`Not on any visual, but referenced by direct measures via DAX or used in a relationship — keep these. \${t.measuresIndirect} measures · \${t.columnsIndirect} columns.\`;
  const tipUnused=\`Not referenced anywhere in the report — safe to remove. \${t.measuresUnused} measures · \${t.columnsUnused} columns.\`;
  const tipPages=\`Total pages in the report. \${visibleCount} visible · \${hiddenCount} hidden (tooltip / drillthrough / nav-suppressed).\`;
  const tipVisuals=\`Total visuals across all pages.\`;
  document.getElementById("summary").innerHTML=\`
    <div class="stat has-tip" data-tooltip="\${tipDirect}"><div class="stat-value good">\${t.measuresDirect+t.columnsDirect}</div><div class="stat-label">Direct</div><div class="stat-detail">\${t.measuresDirect}M · \${t.columnsDirect}C</div></div>
    <div class="stat has-tip" data-tooltip="\${tipIndirect}"><div class="stat-value \${t.measuresIndirect+t.columnsIndirect>0?'warn':''}">\${t.measuresIndirect+t.columnsIndirect}</div><div class="stat-label">Indirect</div><div class="stat-detail">\${t.measuresIndirect}M · \${t.columnsIndirect}C</div></div>
    <div class="stat has-tip" data-tooltip="\${tipUnused}"><div class="stat-value \${totalOrphan>0?'danger':''}">\${totalOrphan}</div><div class="stat-label">Unused</div><div class="stat-detail">\${t.measuresUnused}M · \${t.columnsUnused}C</div></div>
    <div class="stat has-tip" data-tooltip="\${tipPages}"><div class="stat-value">\${t.pages}</div><div class="stat-label">Pages</div><div class="stat-detail">\${visibleCount}V · \${hiddenCount}H</div></div>
    <div class="stat has-tip" data-tooltip="\${tipVisuals}"><div class="stat-value">\${t.visuals}</div><div class="stat-label">Visuals</div></div>
  \`;
}

function renderTabs(){
  const um=DATA.totals.measuresUnused+DATA.totals.columnsUnused;
  document.getElementById("tabs").innerHTML=[
    {id:"measures",l:"Measures",b:DATA.measures.length},{id:"columns",l:"Columns",b:DATA.columns.length},{id:"tables",l:"Tables",b:DATA.tables.length},
    {id:"relationships",l:"Relationships",b:DATA.relationships.length},{id:"functions",l:"Functions",b:DATA.functions.filter(f=>!f.name.endsWith('.About')).length},{id:"calcgroups",l:"Calc Groups",b:DATA.calcGroups.length},{id:"pages",l:"Pages",b:pageData.length},{id:"unused",l:"Unused",b:um,w:um>0},{id:"lineage",l:"Lineage",b:null}
  ].map(t=>\`<button class="tab \${activeTab===t.id?'active':''}" onclick="switchTab('\${t.id}')">\${t.l}\${t.b!==null?\`<span class="badge \${t.w?'warn':''}">\${t.b}</span>\`:''}</button>\`).join("");
}

function switchTab(id){
  if(id!=="lineage")lastTab=id;
  activeTab=id;renderTabs();
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.getElementById("panel-"+id).classList.add("active");
  if(id==="lineage"&&!document.getElementById("lineage-content").innerHTML.trim())
    document.getElementById("lineage-content").innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text-faint)"><div style="font-size:16px;margin-bottom:8px">Click a measure or column name to view its lineage</div><div style="font-size:12px">Go to the Measures or Columns tab and click any field name</div></div>';
}

function sc(s){return s==='unused'?'unused':s==='indirect'?'indirect':''}
function renderMeasures(){
  let items=[...DATA.measures];const s=sortState.measures;
  items.sort((a,b)=>{let av=a[s.key],bv=b[s.key];if(typeof av==='string')return s.desc?bv.localeCompare(av):av.localeCompare(bv);return s.desc?bv-av:av-bv;});
  if(showUnusedOnly.measures)items=items.filter(m=>m.status!=='direct');
  if(searchTerms.measures){const q=searchTerms.measures.toLowerCase();items=items.filter(m=>m.name.toLowerCase().includes(q)||m.table.toLowerCase().includes(q));}
  document.getElementById("tbody-measures").innerHTML=items.map(m=>{
    const deps=m.daxDependencies.map(d=>\`<span class="dep-chip" onclick="openLineage('measure','\${d}')">\${d}</span>\`).join("")||'<span style="color:var(--text-faint)">—</span>';
    const pages=[...new Set(m.usedIn.map(u=>u.pageName))];
    const used=pages.map(p=>\`<span class="used-chip">\${p}</span>\`).join("")||'<span style="color:var(--text-faint)">—</span>';
    const statusBadge=m.status==='indirect'?'<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,.12);color:#F59E0B;font-weight:600;margin-left:4px">INDIRECT</span>':m.status==='unused'?'<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,.12);color:#EF4444;font-weight:600;margin-left:4px">UNUSED</span>':'';
    return \`<tr class="\${sc(m.status)}"><td><span class="field-name" onclick="openLineage('measure','\${m.name}')">\${m.name}</span>\${statusBadge}</td><td><span class="field-table">\${m.table}</span></td><td><span class="usage-count \${uc(m.usageCount)}">\${m.usageCount}</span></td><td><span class="usage-count \${uc(m.pageCount)}">\${m.pageCount}</span></td><td>\${deps}</td><td>\${used}</td><td><span class="format-str">\${m.formatString||'—'}</span></td></tr>\`;
  }).join("");
}

function renderColumns(){
  let items=[...DATA.columns];const s=sortState.columns;
  items.sort((a,b)=>{let av=a[s.key],bv=b[s.key];if(typeof av==='string')return s.desc?bv.localeCompare(av):av.localeCompare(bv);return s.desc?bv-av:av-bv;});
  if(showUnusedOnly.columns)items=items.filter(c=>c.status!=='direct');
  if(searchTerms.columns){const q=searchTerms.columns.toLowerCase();items=items.filter(c=>c.name.toLowerCase().includes(q)||c.table.toLowerCase().includes(q));}
  document.getElementById("tbody-columns").innerHTML=items.map(c=>{
    const pages=[...new Set(c.usedIn.map(u=>u.pageName))];
    const used=pages.map(p=>\`<span class="used-chip">\${p}</span>\`).join("")||'<span style="color:var(--text-faint)">—</span>';
    const sb=c.isSlicerField?'<span class="slicer-badge">SLICER</span>':'';
    const statusBadge=c.status==='indirect'?'<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,.12);color:#F59E0B;font-weight:600;margin-left:4px">INDIRECT</span>':c.status==='unused'?'<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,.12);color:#EF4444;font-weight:600;margin-left:4px">UNUSED</span>':'';
    return \`<tr class="\${sc(c.status)}"><td><span class="field-name" onclick="openLineage('column','\${c.name}')">\${c.name}</span>\${sb}\${statusBadge}</td><td><span class="field-table">\${c.table}</span></td><td><span class="mono" style="font-size:11px;color:#64748B">\${c.dataType}</span></td><td><span class="usage-count \${uc(c.usageCount)}">\${c.usageCount}</span></td><td><span class="usage-count \${uc(c.pageCount)}">\${c.pageCount}</span></td><td>\${used}</td></tr>\`;
  }).join("");
}

function openLineage(type,name){
  lastTab=activeTab!=="lineage"?activeTab:lastTab;
  activeTab="lineage";renderTabs();
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.getElementById("panel-lineage").classList.add("active");

  const el=document.getElementById("lineage-content");
  const backTab=type==="column"?"columns":"measures";

  if(type==="measure"){
    const m=DATA.measures.find(x=>x.name===name);
    if(!m){el.innerHTML='<div style="color:#EF4444;padding:20px">Measure not found</div>';return;}

    const upstream=m.daxDependencies.map(d=>{
      const dep=DATA.measures.find(x=>x.name===d);
      return dep||{name:d,table:"?",formatString:""};
    });
    const usedFuncs=DATA.functions.filter(f=>!f.name.endsWith('.About')&&(m.daxExpression.includes("'"+f.name+"'")||m.daxExpression.includes(f.name+'(')));
    const feedsInto=DATA.measures.filter(x=>x.daxDependencies.includes(m.name));

    el.innerHTML=\`
      <div class="lineage-back" onclick="switchTab('\${backTab}')">← Back to \${backTab==='measures'?'Measures':'Columns'}</div>
      <div class="lineage-hero">
        <div class="lineage-hero-title"><span class="dot" style="background:#F59E0B"></span>\${m.name}</div>
        <div class="lineage-hero-meta">\${m.table} · \${m.formatString||'—'} · \${m.usageCount} visual\${m.usageCount!==1?'s':''} · \${m.pageCount} page\${m.pageCount!==1?'s':''}</div>
        <div class="lineage-dax">\${m.daxExpression}</div>
      </div>
      <div class="lineage-flow-row">
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#A78BFA">↑ Upstream</div>
          \${usedFuncs.map(f=>\`
            <div class="lc udf clickable" style="margin-bottom:4px" onclick="switchTab('functions')">
              <div class="lc-name" style="color:#14B8A6">ƒ \${f.name}</div>
              <div class="lc-sub">Function · \${f.parameters?f.parameters.split(',').length+' param'+(f.parameters.split(',').length!==1?'s':''):'no params'}</div>
            </div>\`).join("")}
          <div class="lc source" style="margin-bottom:4px">
            <div class="lc-name" style="color:#10B981">⬡ \${m.table}</div>
            <div class="lc-sub">Source table</div>
          </div>
          \${upstream.length?upstream.map(u=>\`
            <div class="lc upstream clickable" onclick="openLineage('measure','\${u.name}')">
              <div class="lc-name">\${u.name}</div>
              <div class="lc-sub">\${u.table} · \${u.formatString||''}</div>
            </div>\`).join(""):\`\${usedFuncs.length?'':\`<div class="lc upstream empty"><div class="lc-name">No dependencies</div><div class="lc-sub">Base measure</div></div>\`}\`}
        </div>
        <div class="lineage-arrow-col">→</div>
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#F59E0B">● This Measure</div>
          <div class="lc center">
            <div class="lc-name">\${m.name}</div>
            <div class="lc-sub">\${m.daxExpression.length>50?m.daxExpression.substring(0,50)+'…':m.daxExpression}</div>
          </div>
          \${feedsInto.length?\`
            <div class="feeds-label">Feeds into</div>
            \${feedsInto.map(f=>\`
              <div class="lc feeds clickable" onclick="openLineage('measure','\${f.name}')">
                <div class="lc-name">\${f.name}</div>
                <div class="lc-sub">\${f.formatString||''} · \${f.usageCount} visual\${f.usageCount!==1?'s':''}</div>
              </div>\`).join("")}
          \`:''}
        </div>
        <div class="lineage-arrow-col">→</div>
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#8B5CF6">↓ Downstream</div>
          \${m.usedIn.length?m.usedIn.map(d=>\`
            <div class="lc downstream">
              <div class="lc-name">\${d.visualTitle}</div>
              <div class="lc-sub">\${d.visualType} · \${d.bindingRole}</div>
              <div class="lc-role">\${d.pageName}</div>
            </div>\`).join(""):\`<div class="lc downstream empty"><div class="lc-name" style="color:#EF4444">Not used</div><div class="lc-sub">Orphaned measure</div></div>\`}
        </div>
      </div>\`;
    addCopyButtons();
  }
  else if(type==="column"){
    const c=DATA.columns.find(x=>x.name===name);
    if(!c){el.innerHTML='<div style="color:#EF4444;padding:20px">Column not found</div>';return;}
    const colRef=c.table+'['+c.name+']';
    const related=DATA.measures.filter(m=>m.daxExpression.includes(colRef)||m.daxExpression.includes('['+c.name+']'));

    el.innerHTML=\`
      <div class="lineage-back" onclick="switchTab('columns')">← Back to Columns</div>
      <div class="lineage-hero">
        <div class="lineage-hero-title"><span class="dot" style="background:#3B82F6"></span>\${c.name}\${c.isSlicerField?'<span class="slicer-badge">SLICER</span>':''}</div>
        <div class="lineage-hero-meta">\${c.table} · \${c.dataType} · \${c.usageCount} visual\${c.usageCount!==1?'s':''} · \${c.pageCount} page\${c.pageCount!==1?'s':''}</div>
      </div>
      <div class="lineage-flow-row">
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#10B981">↑ Source</div>
          <div class="lc source">
            <div class="lc-name" style="color:#10B981">⬡ \${c.table}</div>
            <div class="lc-sub">\${c.dataType}</div>
          </div>
        </div>
        <div class="lineage-arrow-col">→</div>
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#3B82F6">● This Column</div>
          <div class="lc center col-type">
            <div class="lc-name">\${c.name}</div>
            <div class="lc-sub">\${c.table}[\${c.name}]</div>
          </div>
          \${related.length?\`
            <div class="feeds-label">Measures referencing \${c.name}</div>
            \${related.map(m=>\`
              <div class="lc feeds clickable" onclick="openLineage('measure','\${m.name}')">
                <div class="lc-name">\${m.name}</div>
                <div class="lc-sub">\${m.formatString||''} · \${m.usageCount} visual\${m.usageCount!==1?'s':''}</div>
              </div>\`).join("")}
          \`:''}
        </div>
        <div class="lineage-arrow-col">→</div>
        <div class="lineage-flow-col">
          <div class="lineage-flow-col-label" style="color:#8B5CF6">↓ Downstream</div>
          \${c.usedIn.length?c.usedIn.map(d=>\`
            <div class="lc downstream">
              <div class="lc-name">\${d.visualTitle}</div>
              <div class="lc-sub">\${d.visualType} · \${d.bindingRole}</div>
              <div class="lc-role">\${d.pageName}</div>
            </div>\`).join(""):\`<div class="lc downstream empty"><div class="lc-name" style="color:#EF4444">Not used</div><div class="lc-sub">Orphaned column</div></div>\`}
        </div>
      </div>\`;
  }
}

function renderPages(){
  const FC={measure:"#F59E0B",column:"#3B82F6"};
  const hiddenSet=new Set(DATA.hiddenPages||[]);
  document.getElementById("pages-content").innerHTML=pageData.map(p=>{
    const isOpen=openPages.has(p.name);
    const hiddenBadge=hiddenSet.has(p.name)?'<span class="hidden-badge" title="This page is marked HiddenInViewMode — typically a tooltip, drillthrough, or nav-suppressed page">HIDDEN</span>':'';

    const typeChips=Object.entries(p.typeCounts).map(([t,c])=>\`<span class="page-type-chip">\${c}× \${t}</span>\`).join("");

    const visualRows=p.visuals.map(v=>{
      const bindingChips=v.bindings.map(b=>{
        const color=b.fieldType==="measure"?FC.measure:FC.column;
        return \`<span class="dep-chip" style="background:\${color}15;color:\${color};border-color:\${color}30;cursor:pointer" onclick="event.stopPropagation();openLineage('\${b.fieldType}','\${b.fieldName}')">\${b.fieldName}</span>\`;
      }).join("");
      return \`<div class="page-visual-row">
        <span class="page-visual-type">\${v.type}</span>
        <span class="page-visual-title">\${v.title}</span>
        <div class="page-visual-bindings">\${bindingChips}</div>
      </div>\`;
    }).join("");

    const measureChips=p.measures.map(m=>\`<span class="dep-chip" style="background:rgba(245,158,11,.1);color:#F59E0B;border-color:rgba(245,158,11,.2);cursor:pointer" onclick="event.stopPropagation();openLineage('measure','\${m}')">\${m}</span>\`).join("");
    const columnChips=p.columns.map(c=>\`<span class="dep-chip" style="background:rgba(59,130,246,.1);color:#3B82F6;border-color:rgba(59,130,246,.2);cursor:pointer" onclick="event.stopPropagation();openLineage('column','\${c}')">\${c}</span>\`).join("");

    return \`<div class="page-card \${isOpen?'open':''}">
      <div class="page-header" onclick="togglePage('\${p.name}')">
        <div class="page-name">\${p.name}\${hiddenBadge}</div>
        <div class="page-stats">
          <div class="page-stat"><div class="page-stat-val" style="color:#8B5CF6">\${p.visualCount}</div><div class="page-stat-label">Visuals</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#F59E0B">\${p.measureCount}</div><div class="page-stat-label">Measures</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#3B82F6">\${p.columnCount}</div><div class="page-stat-label">Columns</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#EC4899">\${p.slicerCount}</div><div class="page-stat-label">Slicers</div></div>
        </div>
        <span class="page-expand">▼</span>
      </div>
      <div class="page-body"><div class="page-body-inner">
        <div class="page-section">
          <div class="page-section-title">Visual types<span class="line"></span></div>
          <div class="page-type-summary">\${typeChips}</div>
        </div>
        <div class="page-section">
          <div class="page-section-title">Measures (\${p.measureCount})<span class="line"></span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">\${measureChips||'<span style="color:#475569;font-size:12px">None</span>'}</div>
        </div>
        <div class="page-section">
          <div class="page-section-title">Columns (\${p.columnCount})<span class="line"></span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">\${columnChips||'<span style="color:#475569;font-size:12px">None</span>'}</div>
        </div>
        <div class="page-section">
          <div class="page-section-title">Visuals (\${p.visualCount})<span class="line"></span></div>
          \${visualRows}
        </div>
      </div></div>
    </div>\`;
  }).join("");
}

function togglePage(name){
  if(openPages.has(name))openPages.delete(name);else openPages.add(name);
  renderPages();
}

function toggleTableCard(name){
  if(openTables.has(name))openTables.delete(name);else openTables.add(name);
  renderTables();
}

function renderTables(){
  const tables=DATA.tables||[];
  document.getElementById("tables-content").innerHTML=tables.map(t=>{
    const isOpen=openTables.has(t.name);
    const calcGroupPill=t.isCalcGroup?'<span class="calc-group-pill" title="This table is a calculation group">CALC GROUP</span>':'';

    const colRows=t.columns.map(c=>{
      const badges=[];
      if(c.isKey)badges.push('<span class="pk-badge" title="Primary key — isKey:true set in the model">PK</span>');
      else if(c.isInferredPK)badges.push('<span class="pk-badge inferred" title="Inferred primary key — this column is on the one-side of at least one relationship">PK</span>');
      if(c.isFK)badges.push('<span class="fk-badge" title="Foreign key — used as fromColumn in a relationship">FK</span>');
      if(c.isCalculated)badges.push('<span class="calc-col-badge" title="Calculated column">CALC</span>');
      if(c.isHidden)badges.push('<span class="hid-col-badge" title="isHidden:true">HIDDEN</span>');
      const statusClass=c.status==='unused'?'zero':c.status==='indirect'?'low':'good';
      // Relationship column: FK target (outgoing) or incoming PK refs, or both if the column is a bridge
      const parts=[];
      if(c.isFK&&c.fkTarget)parts.push(\`<span class="rel-out">→ \${c.fkTarget.table}[\${c.fkTarget.column}]</span>\`);
      if(c.incomingRefs&&c.incomingRefs.length>0){
        const refs=c.incomingRefs.map(r=>\`<span class="rel-in\${r.isActive?'':' rel-inactive'}">← \${r.table}[\${r.column}]\${r.isActive?'':' <span style="font-size:9px;opacity:.7">(inactive)</span>'}</span>\`).join('<span style="color:var(--text-fainter);margin:0 4px">·</span>');
        parts.push(refs);
      }
      const relText=parts.length?parts.join('<br>'):'<span style="color:var(--text-fainter)">—</span>';
      return \`<div class="tcol-row">
        <div>
          <span class="tcol-name" onclick="openLineage('column','\${c.name.replace(/'/g,"\\\\'")}')">\${c.name}</span>\${badges.join('')}
          <span class="usage-count \${statusClass}" style="margin-left:8px;font-size:10px">\${c.usageCount}</span>
        </div>
        <div class="tcol-type">\${c.dataType}</div>
        <div class="tcol-fk">\${relText}</div>
      </div>\`;
    }).join("")||'<div style="padding:8px 10px;color:var(--text-faint);font-size:12px">No columns</div>';

    const measureList=t.measures.map(m=>{
      const cls=m.status==='unused'?'zero':m.status==='indirect'?'low':'good';
      return \`<span class="dep-chip" style="background:rgba(245,158,11,.1);color:#F59E0B;border-color:rgba(245,158,11,.2);cursor:pointer" onclick="event.stopPropagation();openLineage('measure','\${m.name.replace(/'/g,"\\\\'")}')">\${m.name} <span class="usage-count \${cls}" style="margin-left:4px;font-size:9px">\${m.usageCount}</span></span>\`;
    }).join("")||'<span style="color:var(--text-faint);font-size:12px">None</span>';

    const relRows=t.relationships.map(r=>{
      const dirClass=r.direction==='outgoing'?'out':'in';
      const dirLabel=r.direction==='outgoing'?'FK →':'← PK';
      const inactive=r.isActive?'':' trel-inactive';
      const arrow=r.direction==='outgoing'?'→':'←';
      const other=r.direction==='outgoing'?\`\${r.toTable}[\${r.toColumn}]\`:\`\${r.fromTable}[\${r.fromColumn}]\`;
      const self=r.direction==='outgoing'?\`[\${r.fromColumn}]\`:\`[\${r.toColumn}]\`;
      return \`<div class="trel-row\${inactive}">
        <span class="trel-dir \${dirClass}">\${dirLabel}</span>
        <span>\${self} <span style="color:var(--text-faint)">\${arrow}</span> \${other}</span>
        \${r.isActive?'':'<span style="font-size:9px;color:var(--text-dim);margin-left:4px">(inactive)</span>'}
      </div>\`;
    }).join("")||'<div style="padding:8px 10px;color:var(--text-faint);font-size:12px">No relationships</div>';

    return \`<div class="page-card \${isOpen?'open':''}">
      <div class="page-header" onclick="toggleTableCard('\${t.name.replace(/'/g,"\\\\'")}')">
        <div class="page-name">\${t.name}\${calcGroupPill}</div>
        <div class="page-stats">
          <div class="page-stat"><div class="page-stat-val" style="color:#3B82F6">\${t.columnCount}</div><div class="page-stat-label">Columns</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#F59E0B">\${t.measureCount}</div><div class="page-stat-label">Measures</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#F59E0B">\${t.keyCount}</div><div class="page-stat-label">Keys</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#3B82F6">\${t.fkCount}</div><div class="page-stat-label">FKs</div></div>
        </div>
        <span class="page-expand">▼</span>
      </div>
      <div class="page-body"><div class="page-body-inner">
        <div class="page-section">
          <div class="page-section-title">Columns (\${t.columnCount})<span class="line"></span></div>
          <div class="tcol-row" style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);font-weight:600;border-bottom:1px solid var(--border);padding-bottom:4px">
            <div>Name</div><div>Type</div><div>Relationship</div>
          </div>
          \${colRows}
        </div>
        <div class="page-section">
          <div class="page-section-title">Measures (\${t.measureCount})<span class="line"></span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">\${measureList}</div>
        </div>
        <div class="page-section">
          <div class="page-section-title">Relationships (\${t.relationships.length})<span class="line"></span></div>
          \${relRows}
        </div>
      </div></div>
    </div>\`;
  }).join("")||'<div style="text-align:center;padding:60px 20px;color:var(--text-faint);font-size:13px">No tables found</div>';
}

var openOrphanSections=new Set();
function toggleOrphanSection(id){if(openOrphanSections.has(id))openOrphanSections.delete(id);else openOrphanSections.add(id);renderUnused();}

function orphanSection(id,title,subtitle,color,count,countLabel,items){
  const isOpen=openOrphanSections.has(id);
  return \`<div class="page-card \${isOpen?'open':''}" style="border-left:3px solid \${color}">
    <div class="page-header" onclick="toggleOrphanSection('\${id}')">
      <div style="flex:1">
        <div class="page-name" style="font-size:14px">\${title}</div>
        <div style="font-size:11px;color:#64748B;margin-top:2px">\${subtitle}</div>
      </div>
      <div class="page-stats">
        <div class="page-stat"><div class="page-stat-val" style="color:\${color}">\${count}</div><div class="page-stat-label">\${countLabel}</div></div>
      </div>
      <span class="page-expand">▼</span>
    </div>
    <div class="page-body"><div class="page-body-inner">
      <div style="display:flex;flex-wrap:wrap;gap:8px">\${items}</div>
    </div></div>
  </div>\`;
}

function renderUnused(){
  const unusedM=DATA.measures.filter(m=>m.status==='unused'),indirectM=DATA.measures.filter(m=>m.status==='indirect');
  const unusedC=DATA.columns.filter(c=>c.status==='unused'),indirectC=DATA.columns.filter(c=>c.status==='indirect');
  const pureOrphanM=unusedM.filter(m=>!m.dependedOnBy.length);
  const chainOrphanM=unusedM.filter(m=>m.dependedOnBy.length>0);
  let h='';

  if(pureOrphanM.length) h+=orphanSection('pure-m','Unused Measures — Not Referenced Anywhere','No visual uses them and no other measure references them — safe to remove','#EF4444',pureOrphanM.length,'Measures',
    pureOrphanM.map(m=>\`<div class="lc clickable" style="border-left:3px solid #EF4444;flex:0 0 auto" onclick="event.stopPropagation();openLineage('measure','\${m.name}')"><div class="lc-name">\${m.name}</div><div class="lc-sub">\${m.table} · \${m.formatString||''}</div></div>\`).join(""));

  if(chainOrphanM.length) h+=orphanSection('chain-m','Unused Measures — Dead Chain','Other measures depend on them, but the full chain never reaches any visual','#EF4444',chainOrphanM.length,'Measures',
    chainOrphanM.map(m=>\`<div class="lc clickable" style="border-left:3px solid #EF4444;flex:0 0 auto" onclick="event.stopPropagation();openLineage('measure','\${m.name}')"><div class="lc-name">\${m.name}</div><div class="lc-sub">\${m.table} · \${m.formatString||''} · depended on by \${m.dependedOnBy.length}</div></div>\`).join(""));

  if(unusedC.length) h+=orphanSection('orphan-c','Unused Columns','No visual, measure, or relationship uses them — safe to hide or remove','#EF4444',unusedC.length,'Columns',
    unusedC.map(c=>\`<div class="lc clickable" style="border-left:3px solid #EF4444;flex:0 0 auto" onclick="event.stopPropagation();openLineage('column','\${c.name}')"><div class="lc-name">\${c.name}</div><div class="lc-sub">\${c.table} · \${c.dataType}</div></div>\`).join(""));

  if(indirectM.length) h+=orphanSection('indirect-m','Indirect Measures','Not on any visual, but used inside other measures that are — keep these','#F59E0B',indirectM.length,'Measures',
    indirectM.map(m=>\`<div class="lc clickable" style="border-left:3px solid #F59E0B;flex:0 0 auto" onclick="event.stopPropagation();openLineage('measure','\${m.name}')"><div class="lc-name">\${m.name}</div><div class="lc-sub">\${m.table} · \${m.formatString||''}</div></div>\`).join(""));

  if(indirectC.length) h+=orphanSection('indirect-c','Indirect Columns','Not on any visual, but used in a relationship or measure DAX — keep these','#F59E0B',indirectC.length,'Columns',
    indirectC.map(c=>\`<div class="lc clickable" style="border-left:3px solid #F59E0B;flex:0 0 auto" onclick="event.stopPropagation();openLineage('column','\${c.name}')"><div class="lc-name">\${c.name}</div><div class="lc-sub">\${c.table} · \${c.dataType}</div></div>\`).join(""));

  if(!unusedM.length&&!unusedC.length&&!indirectM.length&&!indirectC.length)h='<div style="text-align:center;padding:40px;color:#22C55E;font-weight:600">All fields are in use ✓</div>';
  document.getElementById("unused-content").innerHTML=h;
}

function renderRelationships(){
  const rels=DATA.relationships;
  if(!rels.length){document.getElementById("relationships-content").innerHTML='<div style="text-align:center;padding:40px;color:#6B7280">No relationships found in the model</div>';return;}
  let h='<table class="data-table"><thead><tr><th>From Table</th><th>From Column</th><th></th><th>To Table</th><th>To Column</th><th>Status</th></tr></thead><tbody>';
  for(const r of rels){
    const statusColor=r.isActive?'#10B981':'#6B7280';
    const statusLabel=r.isActive?'Active':'Inactive';
    h+=\`<tr>
      <td style="font-weight:600">\${r.fromTable}</td>
      <td>\${r.fromColumn}</td>
      <td style="text-align:center;color:#6B7280;font-size:18px">→</td>
      <td style="font-weight:600">\${r.toTable}</td>
      <td>\${r.toColumn}</td>
      <td><span style="color:\${statusColor};font-size:12px;font-weight:500">\${statusLabel}</span></td>
    </tr>\`;
  }
  h+='</tbody></table>';
  document.getElementById("relationships-content").innerHTML=h;
}

function renderFunctions(){
  const fns=DATA.functions.filter(f=>!f.name.endsWith('.About'));
  if(!fns.length){document.getElementById("functions-content").innerHTML='<div style="text-align:center;padding:40px;color:#6B7280">No user-defined functions found in the model</div>';return;}
  let h='<div style="display:flex;flex-direction:column;gap:12px">';
  for(const f of fns){
    const refMeasures=DATA.measures.filter(m=>m.daxExpression.includes("'"+f.name+"'")||m.daxExpression.includes(f.name+'('));
    const params=f.parameters?f.parameters.split(',').map(p=>{
      const parts=p.trim().split(/\\s*:\\s*/);
      return parts.length>=2?'<span style="color:var(--code-name)">'+parts[0].trim()+'</span> <span style="color:var(--code-punct)">:</span> <span style="color:var(--code-type)">'+parts.slice(1).join(':').trim()+'</span>':'<span style="color:var(--code-name)">'+p.trim()+'</span>';
    }).join('<span style="color:var(--code-punct)">, </span>'):'<span style="color:var(--code-punct);font-style:italic">none</span>';
    const desc=f.description?'<div style="font-size:11px;color:#64748B;margin-top:6px;line-height:1.4">'+f.description.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'';
    const expr=f.expression.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const measureChips=refMeasures.map(m=>\`<span class="dep-chip" style="background:rgba(245,158,11,.1);color:#F59E0B;border-color:rgba(245,158,11,.2);cursor:pointer" onclick="event.stopPropagation();openLineage('measure','\${m.name}')">\${m.name}</span>\`).join('');
    h+=\`<div class="page-card">
      <div class="page-header" onclick="this.parentElement.classList.toggle('open')">
        <div style="flex:1">
          <div class="page-name" style="font-size:14px">\${f.name}</div>
          <div style="font-size:11px;color:#64748B;margin-top:2px;font-family:'JetBrains Mono',monospace">( \${params} )</div>
        </div>
        <div class="page-stats">
          <div class="page-stat"><div class="page-stat-val" style="color:#F59E0B">\${refMeasures.length}</div><div class="page-stat-label">Measures</div></div>
        </div>
        <span class="page-expand">▼</span>
      </div>
      <div class="page-body"><div class="page-body-inner">
        \${desc}
        \${refMeasures.length?\`<div style="margin-top:8px"><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px">Measures using this function</div><div style="display:flex;flex-wrap:wrap;gap:4px">\${measureChips}</div></div>\`:''}
        <div class="lineage-dax" style="margin-top:8px;max-height:300px;overflow-y:auto">\${expr}</div>
      </div></div>
    </div>\`;
  }
  h+='</div>';
  document.getElementById("functions-content").innerHTML=h;
}

function renderCalcGroups(){
  const cgs=DATA.calcGroups;
  if(!cgs.length){document.getElementById("calcgroups-content").innerHTML='<div style="text-align:center;padding:40px;color:#6B7280">No calculation groups found in the model</div>';return;}
  let h='<div style="display:flex;flex-direction:column;gap:12px">';
  for(const cg of cgs){
    const desc=cg.description?'<div style="font-size:11px;color:var(--text-dim);margin-top:4px">'+cg.description.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'';
    let items='';
    for(const item of cg.items){
      const expr=item.expression.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const fmtBadge=item.formatStringExpression?'<span class="mono" style="margin-left:8px;font-size:10px;color:var(--text-dim)">fmt: '+item.formatStringExpression.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>':'';
      const itemDesc=item.description?'<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">'+item.description.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>':'';
      items+=\`<div class="ci-card">
        <div class="ci-head">
          <span class="ci-ord">\${item.ordinal}</span>
          <span class="ci-name">\${item.name}</span>\${fmtBadge}
        </div>\${itemDesc}
        <div class="lineage-dax" style="font-size:12px">\${expr}</div>
      </div>\`;
    }
    h+=\`<div class="page-card">
      <div class="page-header" onclick="this.parentElement.classList.toggle('open')">
        <div style="flex:1">
          <div class="page-name" style="font-size:14px">\${cg.name}</div>
          \${desc}
        </div>
        <div class="page-stats">
          <div class="page-stat"><div class="page-stat-val" style="color:#A78BFA">\${cg.items.length}</div><div class="page-stat-label">Items</div></div>
          <div class="page-stat"><div class="page-stat-val" style="color:#64748B">\${cg.precedence}</div><div class="page-stat-label">Precedence</div></div>
        </div>
        <span class="page-expand">▼</span>
      </div>
      <div class="page-body"><div class="page-body-inner">\${items}</div></div>
    </div>\`;
  }
  h+='</div>';
  document.getElementById("calcgroups-content").innerHTML=h;
}

function sortTable(t,k){const s=sortState[t];if(s.key===k)s.desc=!s.desc;else{s.key=k;s.desc=true;}t==="measures"?renderMeasures():renderColumns();}
function filterTable(t,v){searchTerms[t]=v;t==="measures"?renderMeasures():renderColumns();}
function toggleUnused(t){showUnusedOnly[t]=!showUnusedOnly[t];document.getElementById("btn-unused-"+(t==="measures"?"m":"c")).classList.toggle("active");t==="measures"?renderMeasures():renderColumns();}

renderSummary();renderTabs();renderMeasures();renderColumns();renderTables();renderRelationships();renderFunctions();renderCalcGroups();renderPages();renderUnused();switchTab("measures");addCopyButtons();

// Auto-refresh: 5-minute countdown with stale detection
(function(){
  var INTERVAL=300;
  var remaining=INTERVAL;
  var lastTs='';
  var stale=false;
  var bar=document.createElement('div');
  bar.className='refresh-bar';
  bar.innerHTML='<span class="dot" id="rf-dot"></span><span class="timer" id="rf-timer"></span><button id="rf-btn" onclick="location.reload()">Refresh now</button>';
  document.body.style.paddingBottom='36px';
  document.body.appendChild(bar);
  var timerEl=document.getElementById('rf-timer');
  var dotEl=document.getElementById('rf-dot');
  var btnEl=document.getElementById('rf-btn');
  function fmt(s){var m=Math.floor(s/60);var ss=s%60;return m+':'+(ss<10?'0':'')+ss;}
  function tick(){
    remaining--;
    if(remaining<=0){location.reload();return;}
    timerEl.textContent=stale?'New data available · refresh in '+fmt(remaining):'Refresh in '+fmt(remaining);
  }
  function checkStale(){
    try{
      var x=new XMLHttpRequest();
      x.open('GET','timestamp.txt?_='+Date.now(),true);
      x.onload=function(){
        if(x.status===200||x.status===0){
          var ts=x.responseText.trim();
          if(!lastTs){lastTs=ts;return;}
          if(ts!==lastTs){
            stale=true;
            dotEl.classList.add('stale');
            btnEl.textContent='Refresh now (new data)';
          }
        }
      };
      x.send();
    }catch(e){}
  }
  timerEl.textContent='Refresh in '+fmt(remaining);
  setInterval(tick,1000);
  checkStale();
  setInterval(checkStale,10000);
})();
</script>
</body>
</html>`;
}
// ═══════════════════════════════════════════════════════════════════════════════
// Markdown Dashboard Generation
//
// Sibling to generateHTML — same FullData input, 9 sections matching the
// HTML tabs. Produces a standalone .md file for offline reading, PRs, or
// pasting into documentation. Zero token cost (never sent to the LLM).
// ═══════════════════════════════════════════════════════════════════════════════
function generateMarkdown(data, reportName) {
    const ts = new Date().toISOString().replace("T", " ").substring(0, 16);
    const t = data.totals;
    const lines = [];
    const ln = (s = "") => lines.push(s);
    ln(`# Model Usage — ${reportName}`);
    ln();
    ln(`> Generated: ${ts} | ${t.measuresInModel} measures | ${t.columnsInModel} columns | ${t.tables} tables | ${t.relationships} relationships | ${t.pages} pages | ${t.visuals} visuals`);
    ln();
    // ── KPI row ──
    ln(`| Measures | | Columns | | Tables | Pages | Visuals |`);
    ln(`|---|---|---|---|---|---|---|`);
    ln(`| ✅ ${t.measuresDirect} direct | ⚠️ ${t.measuresUnused} unused | ✅ ${t.columnsDirect} direct | ⚠️ ${t.columnsUnused} unused | ${t.tables} | ${t.pages} | ${t.visuals} |`);
    ln();
    // ── Measures ──
    ln(`## Measures (${data.measures.length})`);
    ln();
    if (data.measures.length > 0) {
        ln(`| Measure | Table | Status | Visuals | Pages | DAX Dependencies |`);
        ln(`|---|---|---|---:|---:|---|`);
        for (const m of data.measures) {
            const icon = m.status === "direct" ? "✅" : m.status === "indirect" ? "🔗" : "⚠️";
            const deps = m.daxDependencies.length > 0 ? m.daxDependencies.join(", ") : "—";
            ln(`| ${m.name} | ${m.table} | ${icon} ${m.status} | ${m.usageCount} | ${m.pageCount} | ${deps} |`);
        }
        ln();
    }
    // ── Columns ──
    ln(`## Columns (${data.columns.length})`);
    ln();
    if (data.columns.length > 0) {
        ln(`| Column | Table | Type | Status | Visuals | Notes |`);
        ln(`|---|---|---|---|---:|---|`);
        for (const c of data.columns) {
            const icon = c.status === "direct" ? "✅" : c.status === "indirect" ? "🔗" : "⚠️";
            const notes = [];
            if (c.isKey)
                notes.push("PK");
            if (c.isSlicerField)
                notes.push("slicer");
            if (c.isHidden)
                notes.push("hidden");
            if (c.isCalculated)
                notes.push("calc");
            ln(`| ${c.name} | ${c.table} | ${c.dataType} | ${icon} ${c.status} | ${c.usageCount} | ${notes.join(", ") || "—"} |`);
        }
        ln();
    }
    // ── Tables ──
    ln(`## Tables (${data.tables.length})`);
    ln();
    for (const tbl of data.tables) {
        const badge = tbl.isCalcGroup ? " *(calc group)*" : "";
        ln(`### ${tbl.name}${badge} (${tbl.columnCount} cols, ${tbl.measureCount} measures)`);
        ln();
        if (tbl.columns.length > 0) {
            ln(`| Column | Type | Key | Status | Visuals |`);
            ln(`|---|---|---|---|---:|`);
            for (const c of tbl.columns) {
                let key = "—";
                if (c.isKey)
                    key = "🔑 PK";
                else if (c.isInferredPK)
                    key = "🔑 inferred PK";
                else if (c.isFK && c.fkTarget)
                    key = `FK → ${c.fkTarget.table}[${c.fkTarget.column}]`;
                const icon = c.status === "direct" ? "✅" : c.status === "indirect" ? "🔗" : "⚠️";
                ln(`| ${c.name} | ${c.dataType} | ${key} | ${icon} ${c.status} | ${c.usageCount} |`);
            }
            ln();
        }
        if (tbl.measures.length > 0) {
            ln(`**Measures:**`);
            for (const m of tbl.measures) {
                const icon = m.status === "direct" ? "✅" : m.status === "indirect" ? "🔗" : "⚠️";
                ln(`- ${icon} ${m.name} (${m.usageCount} visuals)`);
            }
            ln();
        }
    }
    // ── Relationships ──
    ln(`## Relationships (${data.relationships.length})`);
    ln();
    if (data.relationships.length > 0) {
        ln(`| From | → | To | Active |`);
        ln(`|---|---|---|---|`);
        for (const r of data.relationships) {
            const active = r.isActive ? "✅" : "❌ inactive";
            ln(`| ${r.fromTable}[${r.fromColumn}] | → | ${r.toTable}[${r.toColumn}] | ${active} |`);
        }
        ln();
    }
    // ── Functions ──
    const visibleFuncs = data.functions.filter(f => !f.name.endsWith(".About"));
    if (visibleFuncs.length > 0) {
        ln(`## Functions (${visibleFuncs.length})`);
        ln();
        for (const f of visibleFuncs) {
            ln(`### ${f.name}`);
            if (f.description)
                ln(`> ${f.description}`);
            if (f.parameters)
                ln(`Parameters: \`${f.parameters}\``);
            ln();
            ln("```dax");
            ln(f.expression);
            ln("```");
            ln();
        }
    }
    // ── Calc Groups ──
    if (data.calcGroups.length > 0) {
        ln(`## Calc Groups (${data.calcGroups.length})`);
        ln();
        for (const cg of data.calcGroups) {
            ln(`### ${cg.name} (precedence: ${cg.precedence})`);
            if (cg.description)
                ln(`> ${cg.description}`);
            ln();
            if (cg.items.length > 0) {
                ln(`| Item | Ordinal | DAX |`);
                ln(`|---|---:|---|`);
                for (const item of cg.items) {
                    const dax = item.expression.replace(/\n/g, " ").substring(0, 80);
                    ln(`| ${item.name} | ${item.ordinal} | \`${dax}${item.expression.length > 80 ? "…" : ""}\` |`);
                }
                ln();
            }
        }
    }
    // ── Pages ──
    ln(`## Pages (${data.pages.length})`);
    ln();
    if (data.pages.length > 0) {
        ln(`| Page | Visuals | Measures | Columns | Slicers | Coverage |`);
        ln(`|---|---:|---:|---:|---:|---:|`);
        for (const p of data.pages) {
            const hidden = data.hiddenPages.includes(p.name) ? " *(hidden)*" : "";
            ln(`| ${p.name}${hidden} | ${p.visualCount} | ${p.measureCount} | ${p.columnCount} | ${p.slicerCount} | ${p.coverage}% |`);
        }
        ln();
        // Per-page visual detail
        for (const p of data.pages) {
            const hidden = data.hiddenPages.includes(p.name) ? " *(hidden)*" : "";
            ln(`### ${p.name}${hidden}`);
            ln();
            if (p.visuals.length > 0) {
                ln(`| Visual | Type | Fields |`);
                ln(`|---|---|---|`);
                for (const v of p.visuals) {
                    const fields = v.bindings.map(b => `${b.fieldTable}[${b.fieldName}]`).join(", ") || "—";
                    ln(`| ${v.title} | ${v.type} | ${fields} |`);
                }
                ln();
            }
        }
    }
    // ── Unused ──
    const unusedM = data.measures.filter(m => m.status === "unused");
    const unusedC = data.columns.filter(c => c.status === "unused");
    if (unusedM.length > 0 || unusedC.length > 0) {
        ln(`## Unused (${unusedM.length} measures, ${unusedC.length} columns)`);
        ln();
        if (unusedM.length > 0) {
            ln(`### Unused Measures`);
            for (const m of unusedM) {
                const deps = m.dependedOnBy.length > 0 ? ` — depended on by: ${m.dependedOnBy.join(", ")}` : " — no dependents";
                ln(`- ${m.table}[${m.name}]${deps}`);
            }
            ln();
        }
        if (unusedC.length > 0) {
            ln(`### Unused Columns`);
            for (const c of unusedC) {
                ln(`- ${c.table}[${c.name}] (${c.dataType})`);
            }
            ln();
        }
    }
    // ── Footer ──
    ln(`---`);
    ln(`*Generated by [powerbi-report-mcp](https://github.com/jonathan-pap/powerbi-report-mcp) v0.6.1*`);
    return lines.join("\n");
}
// ═══════════════════════════════════════════════════════════════════════════════
// Output Dir — inside MCP project: .usage/<report-name>/
// ═══════════════════════════════════════════════════════════════════════════════
/** Output dir inside the MCP project: .usage/<report-name>/ */
function getUsageDir(reportPath) {
    const name = path.basename(reportPath).replace(/\.Report$/, "");
    // __dirname = dist/ at runtime, go up one level to project root
    const projectRoot = path.join(__dirname, "..");
    return path.join(projectRoot, ".usage", name);
}
// Keyed by resolved reportPath so multiple reports can be cached independently.
const usageCache = new Map();
let watchers = [];
let debounceTimer;
let lastHtmlHash = "";
let currentReportPath = null;
let currentDashboardPath = null;
function simpleHash(str) {
    return crypto.createHash("md5").update(str).digest("hex");
}
/**
 * Cheap fingerprint over the semantic model — stats every .tmdl file plus
 * model.bim and joins their mtimes. Fast enough to call on every request.
 * Returns "" if fingerprint cannot be computed (fall back to miss).
 */
function computeModelFingerprint(reportPath) {
    try {
        const modelPath = findSemanticModelPath(reportPath);
        const parts = [];
        const defDir = path.join(modelPath, "definition");
        const walk = (dir) => {
            if (!fs.existsSync(dir))
                return;
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory())
                    walk(full);
                else if (ent.name.endsWith(".tmdl")) {
                    try {
                        parts.push(`${full}:${fs.statSync(full).mtimeMs}`);
                    }
                    catch { /* ignore */ }
                }
            }
        };
        walk(defDir);
        for (const bim of [path.join(modelPath, "model.bim"), path.join(defDir, "model.bim")]) {
            if (fs.existsSync(bim)) {
                try {
                    parts.push(`${bim}:${fs.statSync(bim).mtimeMs}`);
                }
                catch { /* ignore */ }
            }
        }
        return simpleHash(parts.join("|"));
    }
    catch {
        return "";
    }
}
/** Async — non-blocking HTML write. Safe to fire-and-forget. */
async function regenerate() {
    if (!currentReportPath)
        return;
    try {
        const data = buildFullData(currentReportPath);
        const reportName = path.basename(currentReportPath).replace(/\.Report$/, "");
        const html = generateHTML(data, reportName);
        const hash = simpleHash(html);
        if (hash !== lastHtmlHash && currentDashboardPath) {
            const dir = path.dirname(currentDashboardPath);
            if (!fs.existsSync(dir))
                await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(currentDashboardPath, html, "utf8");
            await fs.promises.writeFile(path.join(dir, "timestamp.txt"), String(Date.now()), "utf8");
            lastHtmlHash = hash;
        }
        usageCache.set(currentReportPath, {
            data,
            fingerprint: computeModelFingerprint(currentReportPath),
            timestamp: Date.now(),
        });
    }
    catch (e) {
        console.error("model_usage regenerate failed:", e);
    }
}
function invalidateCache(reportPath) {
    if (reportPath)
        usageCache.delete(reportPath);
    else
        usageCache.clear();
    invalidateFieldInventoryCache();
    setTimeout(() => { regenerate().catch(() => { }); }, 50);
}
function onFileChange(filename) {
    if (!filename)
        return;
    const ext = path.extname(filename);
    if (ext !== ".json" && ext !== ".tmdl" && filename !== "model.bim")
        return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { regenerate().catch(() => { }); }, 500);
}
function stopWatchers() {
    watchers.forEach(w => { try {
        w.close();
    }
    catch { /* ignore */ } });
    watchers = [];
}
function startWatchers(reportPath, modelPath) {
    stopWatchers();
    currentReportPath = reportPath;
    const usageDir = getUsageDir(reportPath);
    currentDashboardPath = path.join(usageDir, "index.html");
    try {
        watchers.push(fs.watch(reportPath, { recursive: true }, (_event, f) => onFileChange(f)));
    }
    catch (e) {
        console.error("model_usage: failed to watch report folder:", e);
    }
    try {
        watchers.push(fs.watch(modelPath, { recursive: true }, (_event, f) => onFileChange(f)));
    }
    catch (e) {
        console.error("model_usage: failed to watch model folder:", e);
    }
}
process.on("exit", stopWatchers);
process.on("SIGINT", stopWatchers);
process.on("SIGTERM", stopWatchers);
// ═══════════════════════════════════════════════════════════════════════════════
// MCP Tool Registration
// ═══════════════════════════════════════════════════════════════════════════════
function registerModelUsageTool(server, ctx) {
    server.tool("model_usage", "Cross-reference the semantic model with the report — shows where every measure and column is used, DAX dependencies, unused fields, and per-page coverage. Also generates an HTML dashboard for visual inspection.", {
        reportPath: zod_1.z.string().optional().describe("Path to the .Report folder. Uses current connected report if omitted."),
        slim: zod_1.z.boolean().optional().default(true).describe("Slim mode returns usage counts only. Set false for full visual-level detail."),
    }, async ({ reportPath: rp, slim }) => {
        const effectivePath = rp || ctx.getReportPath();
        if (!effectivePath) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "No report connected. Use set_report first." }) }], isError: true };
        }
        let data;
        let cached = false;
        // Per-report cache with mtime fingerprint — avoids rebuild when nothing changed.
        const fingerprint = computeModelFingerprint(effectivePath);
        const existing = usageCache.get(effectivePath);
        if (existing && fingerprint && existing.fingerprint === fingerprint) {
            data = existing.data;
            cached = true;
        }
        else {
            data = buildFullData(effectivePath);
            usageCache.set(effectivePath, { data, fingerprint, timestamp: Date.now() });
        }
        currentReportPath = effectivePath;
        // Always regenerate HTML (async — non-blocking)
        const reportName = path.basename(effectivePath).replace(/\.Report$/, "");
        currentDashboardPath = path.join(getUsageDir(effectivePath), "index.html");
        const dir = path.dirname(currentDashboardPath);
        if (!fs.existsSync(dir))
            await fs.promises.mkdir(dir, { recursive: true });
        const html = generateHTML(data, reportName);
        await fs.promises.writeFile(currentDashboardPath, html, "utf8");
        await fs.promises.writeFile(path.join(dir, "timestamp.txt"), String(Date.now()), "utf8");
        lastHtmlHash = simpleHash(html);
        // Build response — JSON data only (HTML is 58KB+, too large for context)
        const unused = {
            measures: data.measures.filter(m => m.status === "unused").map(m => `${m.table}[${m.name}]`),
            columns: data.columns.filter(c => c.status === "unused").map(c => `${c.table}[${c.name}]`),
        };
        // Surface parse warnings so the caller knows something was silently skipped
        // (e.g. a TMDL file that was locked or corrupt during read).
        const parseWarnings = cached ? [] : getLastParseWarnings();
        if (slim) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            measures: data.measures.map(m => ({ name: m.name, table: m.table, usageCount: m.usageCount, pageCount: m.pageCount, status: m.status, daxDependencies: m.daxDependencies })),
                            columns: data.columns.map(c => ({ name: c.name, table: c.table, usageCount: c.usageCount, pageCount: c.pageCount, status: c.status, isSlicerField: c.isSlicerField })),
                            pages: data.pages.map(p => ({ name: p.name, visualCount: p.visualCount, measureCount: p.measureCount, columnCount: p.columnCount, slicerCount: p.slicerCount, coverage: p.coverage, hidden: data.hiddenPages.includes(p.name) })),
                            hiddenPages: data.hiddenPages,
                            unused,
                            totals: data.totals,
                            dashboardPath: currentDashboardPath,
                            cached,
                            timestamp: Date.now(),
                            ...(parseWarnings.length > 0 ? { parseWarnings } : {}),
                        }),
                    }],
            };
        }
        else {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            measures: data.measures.map(m => ({
                                name: m.name, table: m.table, usageCount: m.usageCount, pageCount: m.pageCount, status: m.status,
                                daxDependencies: m.daxDependencies, dependedOnBy: m.dependedOnBy,
                                formatString: m.formatString, daxExpression: m.daxExpression, usedIn: m.usedIn,
                            })),
                            columns: data.columns.map(c => ({
                                name: c.name, table: c.table, usageCount: c.usageCount, pageCount: c.pageCount, status: c.status,
                                isSlicerField: c.isSlicerField, dataType: c.dataType, usedIn: c.usedIn,
                            })),
                            pages: data.pages.map(p => ({ ...p, hidden: data.hiddenPages.includes(p.name) })),
                            hiddenPages: data.hiddenPages,
                            unused,
                            totals: data.totals,
                            dashboardPath: currentDashboardPath,
                            cached,
                            timestamp: Date.now(),
                            ...(parseWarnings.length > 0 ? { parseWarnings } : {}),
                        }),
                    }],
            };
        }
    });
}
