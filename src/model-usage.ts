import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { PbirProject } from "./pbir.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface ModelMeasure {
  name: string;
  table: string;
  daxExpression: string;
  formatString: string;
  daxDependencies: string[];
  dependedOnBy: string[];
  usedIn: BindingRef[];
  usageCount: number;
  pageCount: number;
}

interface ModelColumn {
  name: string;
  table: string;
  dataType: string;
  isSlicerField: boolean;
  usedIn: BindingRef[];
  usageCount: number;
  pageCount: number;
}

interface BindingRef {
  pageId: string;
  pageName: string;
  visualId: string;
  visualType: string;
  visualTitle: string;
  bindingRole: string;
}

interface PageData {
  name: string;
  visualCount: number;
  measures: string[];
  columns: string[];
  measureCount: number;
  columnCount: number;
  slicerCount: number;
  typeCounts: Record<string, number>;
  coverage: number;
  visuals: Array<{ type: string; title: string; bindings: Array<{ fieldName: string; fieldTable: string; fieldType: string }> }>;
}

interface FullData {
  measures: ModelMeasure[];
  columns: ModelColumn[];
  pages: PageData[];
  unused: { measures: string[]; columns: string[] };
  totals: {
    measuresInModel: number;
    measuresUsed: number;
    columnsInModel: number;
    columnsUsed: number;
    pages: number;
    visuals: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 1: Locate Semantic Model
// ═══════════════════════════════════════════════════════════════════════════════

export function findSemanticModelPath(reportPath: string): string {
  const projectDir = path.dirname(reportPath);

  // Try definition.pbir first (explicit pointer)
  const pbirFile = path.join(reportPath, "definition.pbir");
  if (fs.existsSync(pbirFile)) {
    try {
      const pbir = JSON.parse(fs.readFileSync(pbirFile, "utf8"));
      const rel = pbir?.datasetReference?.byPath?.path;
      if (rel) {
        const candidate = path.resolve(projectDir, rel);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* fall through */ }
  }

  // Scan sibling folders
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  const modelDir = entries.find(e => e.isDirectory() && e.name.endsWith(".SemanticModel"));
  if (!modelDir) throw new Error("No .SemanticModel folder found alongside the report");
  return path.join(projectDir, modelDir.name);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 2: Parse Model (TMDL + BIM)
// ═══════════════════════════════════════════════════════════════════════════════

interface RawModel {
  measures: Array<{ name: string; table: string; daxExpression: string; formatString: string }>;
  columns: Array<{ name: string; table: string; dataType: string }>;
}

function parseTmdlModel(modelPath: string): RawModel {
  const tablesDir = path.join(modelPath, "definition", "tables");
  const measures: RawModel["measures"] = [];
  const columns: RawModel["columns"] = [];

  if (!fs.existsSync(tablesDir)) return { measures, columns };

  for (const file of fs.readdirSync(tablesDir).filter(f => f.endsWith(".tmdl"))) {
    const content = fs.readFileSync(path.join(tablesDir, file), "utf8");
    const lines = content.split("\n");
    let tableName = "";
    let currentMeasure: { name: string; table: string; daxExpression: string; formatString: string } | null = null;
    let currentColumn: { name: string; table: string; dataType: string } | null = null;
    let collectingExpression = false;
    let expressionLines: string[] = [];

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

        const colName = trimmed.replace(/^\s*column\s+/, "").replace(/\s*=.*$/, "").replace(/^'(.*)'$/, "$1").trim();
        currentColumn = { name: colName, table: tableName, dataType: "string" };
        columns.push(currentColumn);
        continue;
      }

      // Other depth-1 items (partition, hierarchy, etc.) end current measure/column
      if (tabCount === 1 && !line.match(/^\t\s/)) {
        if (currentMeasure && collectingExpression) {
          currentMeasure.daxExpression = expressionLines.join("\n").trim();
        }
        collectingExpression = false;
        expressionLines = [];
        currentMeasure = null;
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
  }

  return { measures, columns };
}

function parseBimModel(modelPath: string): RawModel {
  const bimPath = path.join(modelPath, "model.bim");
  if (!fs.existsSync(bimPath)) {
    const defBimPath = path.join(modelPath, "definition", "model.bim");
    if (!fs.existsSync(defBimPath)) throw new Error("No model.bim found");
    return parseBimFile(defBimPath);
  }
  return parseBimFile(bimPath);
}

function parseBimFile(bimPath: string): RawModel {
  const bim = JSON.parse(fs.readFileSync(bimPath, "utf8"));
  const measures: RawModel["measures"] = [];
  const columns: RawModel["columns"] = [];

  for (const table of bim.model?.tables || []) {
    const tableName = table.name;
    for (const m of table.measures || []) {
      measures.push({
        name: m.name,
        table: tableName,
        daxExpression: Array.isArray(m.expression) ? m.expression.join("\n") : (m.expression || ""),
        formatString: m.formatString || "",
      });
    }
    for (const c of table.columns || []) {
      if (c.type === "rowNumber" || c.isHidden) continue;
      columns.push({
        name: c.name,
        table: tableName,
        dataType: c.dataType || "string",
      });
    }
  }
  return { measures, columns };
}

function parseModel(modelPath: string): RawModel {
  const tablesDir = path.join(modelPath, "definition", "tables");
  if (fs.existsSync(tablesDir) && fs.readdirSync(tablesDir).some(f => f.endsWith(".tmdl"))) {
    return parseTmdlModel(modelPath);
  }
  return parseBimModel(modelPath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 3: Parse DAX Dependencies
// ═══════════════════════════════════════════════════════════════════════════════

function parseDaxDependencies(daxExpression: string, allMeasureNames: string[]): string[] {
  const deps = new Set<string>();
  for (const name of allMeasureNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\[${escaped}\\]`, "gi").test(daxExpression)) {
      deps.add(name);
    }
  }
  return [...deps];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 4: Scan Report Bindings
// ═══════════════════════════════════════════════════════════════════════════════

interface RawBinding {
  fieldType: "measure" | "column" | "aggregation";
  fieldName: string;
  tableName: string;
  bindingRole: string;
  pageId: string;
  pageName: string;
  visualId: string;
  visualType: string;
  visualTitle: string;
}

function extractFieldRef(field: any): { fieldType: "measure" | "column" | "aggregation"; fieldName: string; tableName: string } | null {
  if (field.Measure) {
    return { fieldType: "measure", fieldName: field.Measure.Property, tableName: field.Measure.Expression?.SourceRef?.Entity || "" };
  } else if (field.Column) {
    return { fieldType: "column", fieldName: field.Column.Property, tableName: field.Column.Expression?.SourceRef?.Entity || "" };
  } else if (field.Aggregation) {
    const col = field.Aggregation.Expression?.Column;
    if (col) return { fieldType: "aggregation", fieldName: col.Property, tableName: col.Expression?.SourceRef?.Entity || "" };
  } else if (field.HierarchyLevel) {
    const h = field.HierarchyLevel;
    const entity = h.Expression?.Hierarchy?.Expression?.SourceRef?.Entity;
    const level = h.Level;
    if (entity && level) return { fieldType: "column", fieldName: level, tableName: entity };
  }
  return null;
}

function scanReportBindings(reportPath: string): { bindings: RawBinding[]; pageCount: number; visualCount: number } {
  const project = new PbirProject(reportPath);
  const pageIds = project.listPageIds();
  const bindings: RawBinding[] = [];
  let totalVisuals = 0;

  for (const pageId of pageIds) {
    const page = project.getPage(pageId);
    const pageName = page.displayName || pageId;
    const visualIds = project.listVisualIds(pageId);

    for (const visualId of visualIds) {
      totalVisuals++;
      try {
        const visual = project.getVisual(pageId, visualId);
        const visualType = (visual as any).visual?.visualType || "unknown";
        const visualTitle = extractVisualTitle(visual) || visualType;
        const vId = (visual as any).name || visualId;
        const ctx = { pageId, pageName, visualId: vId, visualType, visualTitle };

        // Scan queryState projections
        const queryState = (visual as any).visual?.query?.queryState;
        if (queryState) {
          for (const [bucket, bucketData] of Object.entries(queryState)) {
            const projections = (bucketData as any).projections || [];
            for (const proj of projections) {
              if (!proj.field) continue;
              const ref = extractFieldRef(proj.field);
              if (ref) bindings.push({ ...ref, bindingRole: bucket, ...ctx });
            }
          }
        }

        // Scan filter bindings
        const filters = (visual as any).filterConfig?.filters || [];
        for (const f of filters) {
          if (!f.field) continue;
          const ref = extractFieldRef(f.field);
          if (ref) bindings.push({ ...ref, bindingRole: "Filter", ...ctx });
        }
      } catch { /* skip unreadable visuals */ }
    }
  }

  return { bindings, pageCount: pageIds.length, visualCount: totalVisuals };
}

function extractVisualTitle(visual: any): string {
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
  } catch { /* fallback */ }
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 5-7: Cross-Reference + Build Full Data
// ═══════════════════════════════════════════════════════════════════════════════

export function buildFullData(reportPath: string): FullData {
  const modelPath = findSemanticModelPath(reportPath);
  const rawModel = parseModel(modelPath);
  const allMeasureNames = rawModel.measures.map(m => m.name);
  const { bindings, pageCount, visualCount } = scanReportBindings(reportPath);

  // Build measures
  const measures: ModelMeasure[] = rawModel.measures.map(m => {
    const deps = parseDaxDependencies(m.daxExpression, allMeasureNames.filter(n => n !== m.name));
    const usedIn = bindings
      .filter(b => b.fieldType === "measure" && b.fieldName === m.name && b.tableName === m.table)
      .map(b => ({ pageId: b.pageId, pageName: b.pageName, visualId: b.visualId, visualType: b.visualType, visualTitle: b.visualTitle, bindingRole: b.bindingRole }));

    // Deduplicate by visual (same measure can appear in same visual via autoFilter)
    const uniqueVisuals = new Map<string, BindingRef>();
    for (const u of usedIn) {
      const key = `${u.pageId}|${u.visualId}`;
      const existing = uniqueVisuals.get(key);
      // Prefer non-Filter binding role
      if (!existing || (existing.bindingRole === "Filter" && u.bindingRole !== "Filter")) uniqueVisuals.set(key, u);
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
    };
  });

  // Build columns
  const SLICER_TYPES = new Set(["slicer", "listSlicer", "textSlicer", "advancedSlicerVisual"]);
  const columns: ModelColumn[] = rawModel.columns.map(c => {
    const usedIn = bindings
      .filter(b => (b.fieldType === "column" || b.fieldType === "aggregation") && b.fieldName === c.name && b.tableName === c.table)
      .map(b => ({ pageId: b.pageId, pageName: b.pageName, visualId: b.visualId, visualType: b.visualType, visualTitle: b.visualTitle, bindingRole: b.bindingRole }));

    const uniqueVisuals = new Map<string, BindingRef>();
    for (const u of usedIn) {
      const key = `${u.pageId}|${u.visualId}`;
      const existing = uniqueVisuals.get(key);
      if (!existing || (existing.bindingRole === "Filter" && u.bindingRole !== "Filter")) uniqueVisuals.set(key, u);
    }
    const dedupedUsedIn = [...uniqueVisuals.values()];

    return {
      name: c.name,
      table: c.table,
      dataType: c.dataType,
      isSlicerField: dedupedUsedIn.some(u => SLICER_TYPES.has(u.visualType)),
      usedIn: dedupedUsedIn,
      usageCount: dedupedUsedIn.length,
      pageCount: new Set(dedupedUsedIn.map(u => u.pageName)).size,
    };
  });

  // Reverse dependencies
  for (const m of measures) {
    m.dependedOnBy = measures.filter(x => x.daxDependencies.includes(m.name)).map(x => x.name);
  }

  // Build page data
  const pageMap = new Map<string, { name: string; visuals: Map<string, { type: string; title: string; bindings: Array<{ fieldName: string; fieldTable: string; fieldType: string }> }>; measures: Set<string>; columns: Set<string> }>();

  const addToPage = (pageName: string, visualType: string, visualTitle: string, fieldName: string, fieldTable: string, fieldType: string) => {
    if (!pageMap.has(pageName)) pageMap.set(pageName, { name: pageName, visuals: new Map(), measures: new Set(), columns: new Set() });
    const p = pageMap.get(pageName)!;
    const vKey = visualTitle || visualType;
    if (!p.visuals.has(vKey)) p.visuals.set(vKey, { type: visualType, title: vKey, bindings: [] });
    const vBindings = p.visuals.get(vKey)!.bindings;
    if (!vBindings.some(b => b.fieldName === fieldName && b.fieldTable === fieldTable)) {
      vBindings.push({ fieldName, fieldTable, fieldType });
    }
    if (fieldType === "measure") p.measures.add(fieldName);
    else p.columns.add(fieldName);
  };

  measures.forEach(m => m.usedIn.forEach(u => addToPage(u.pageName, u.visualType, u.visualTitle, m.name, m.table, "measure")));
  columns.forEach(c => c.usedIn.forEach(u => addToPage(u.pageName, u.visualType, u.visualTitle, c.name, c.table, "column")));

  const pages: PageData[] = [...pageMap.values()].map(p => {
    const visuals = [...p.visuals.values()];
    const typeCounts: Record<string, number> = {};
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

  const measuresUsed = measures.filter(m => m.usageCount > 0).length;
  const columnsUsed = columns.filter(c => c.usageCount > 0).length;

  return {
    measures,
    columns,
    pages,
    unused: {
      measures: measures.filter(m => m.usageCount === 0).map(m => `${m.table}[${m.name}]`),
      columns: columns.filter(c => c.usageCount === 0).map(c => `${c.table}[${c.name}]`),
    },
    totals: {
      measuresInModel: measures.length,
      measuresUsed,
      columnsInModel: columns.length,
      columnsUsed,
      pages: pageCount,
      visuals: visualCount,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML Dashboard Generation
// ═══════════════════════════════════════════════════════════════════════════════

export function generateHTML(data: FullData, reportName: string): string {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 16);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Model Usage - ${reportName}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans',system-ui,sans-serif;background:#0B0D11;color:#E2E8F0;min-height:100vh}
  .mono{font-family:'JetBrains Mono',monospace}
  .container{max-width:1100px;margin:0 auto;padding:20px 16px}
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
  .header-left .top{display:flex;align-items:center;gap:8px}
  .header-label{font-size:13px;color:#3B82F6;font-weight:700;font-family:'JetBrains Mono',monospace}
  .header-sep{font-size:13px;color:#334155}
  .header-sub{font-size:13px;color:#64748B}
  .timestamp{font-size:10px;color:#334155;font-family:'JetBrains Mono',monospace;margin-top:4px}
  .refresh-btn{padding:6px 14px;font-size:11px;font-family:'JetBrains Mono',monospace;border:1px solid #2A2D3A;border-radius:6px;cursor:pointer;background:#1A1D27;color:#64748B;transition:all .15s}
  .refresh-btn:hover{background:#2A2D3A;color:#F8FAFC;border-color:#3B82F6}
  .summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px}
  .stat{background:#1A1D27;border-radius:8px;border:1px solid #2A2D3A;padding:12px 14px;text-align:center}
  .stat-value{font-size:22px;font-weight:700;color:#F8FAFC}
  .stat-value.warn{color:#F59E0B}.stat-value.danger{color:#EF4444}
  .stat-label{font-size:10px;color:#64748B;margin-top:2px;text-transform:uppercase;letter-spacing:.06em}
  .tabs{display:flex;gap:2px;margin-bottom:16px;border-bottom:1px solid #1E2028}
  .tab{padding:8px 16px;font-size:13px;border:none;border-bottom:2px solid transparent;cursor:pointer;background:none;color:#64748B;font-family:inherit;font-weight:500;transition:all .15s}
  .tab.active{color:#F8FAFC;border-bottom-color:#3B82F6}
  .tab:hover:not(.active){color:#94A3B8}
  .tab .badge{font-size:10px;background:#2A2D3A;color:#94A3B8;padding:1px 6px;border-radius:10px;margin-left:6px;font-family:'JetBrains Mono',monospace}
  .tab .badge.warn{background:rgba(245,158,11,.15);color:#F59E0B}
  .panel{display:none}.panel.active{display:block}
  .search-row{display:flex;gap:10px;margin-bottom:14px;align-items:center}
  .search-input{flex:1;padding:7px 12px;font-size:13px;font-family:inherit;background:#1A1D27;border:1px solid #2A2D3A;border-radius:6px;color:#E2E8F0;outline:none;transition:border-color .15s}
  .search-input:focus{border-color:#3B82F6}
  .search-input::placeholder{color:#475569}
  .filter-btn{padding:6px 12px;font-size:11px;border:1px solid #2A2D3A;border-radius:6px;cursor:pointer;background:#1A1D27;color:#64748B;font-family:inherit;transition:all .15s}
  .filter-btn:hover,.filter-btn.active{background:#2A2D3A;color:#F8FAFC}
  .filter-btn.active{border-color:#3B82F6;color:#3B82F6}
  .data-table{width:100%;border-collapse:collapse}
  .data-table th{text-align:left;padding:8px 12px;font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #2A2D3A;font-weight:600;cursor:pointer;user-select:none;white-space:nowrap}
  .data-table th:hover{color:#94A3B8}
  .data-table td{padding:8px 12px;font-size:13px;border-bottom:1px solid #1A1D27;vertical-align:top}
  .data-table tr{transition:background .1s}
  .data-table tr:hover{background:#1A1D27}
  .data-table tr.unused{opacity:.5}
  .data-table tr.unused td:first-child{border-left:3px solid #EF4444;padding-left:9px}
  .field-name{font-weight:600;color:#F8FAFC;cursor:pointer;transition:color .15s;text-decoration:underline;text-decoration-color:#2A2D3A;text-underline-offset:2px}
  .field-name:hover{color:#3B82F6;text-decoration-color:#3B82F6}
  .field-table{font-size:11px;color:#64748B;font-family:'JetBrains Mono',monospace}
  .usage-count{font-family:'JetBrains Mono',monospace;font-weight:600}
  .usage-count.zero{color:#EF4444}.usage-count.low{color:#F59E0B}.usage-count.good{color:#22C55E}
  .dep-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;margin:1px 2px;font-family:'JetBrains Mono',monospace;background:rgba(139,92,246,.1);color:#A78BFA;border:1px solid rgba(139,92,246,.2);cursor:pointer;transition:all .15s}
  .dep-chip:hover{background:rgba(139,92,246,.2);border-color:#A78BFA}
  .used-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;margin:1px 2px;background:rgba(59,130,246,.1);color:#93C5FD;border:1px solid rgba(59,130,246,.15)}
  .slicer-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(236,72,153,.12);color:#EC4899;font-weight:600;margin-left:4px}
  .format-str{font-size:11px;color:#475569;font-family:'JetBrains Mono',monospace}

  .lineage-back{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748B;cursor:pointer;margin-bottom:16px;transition:color .15s}
  .lineage-back:hover{color:#3B82F6}
  .lineage-hero{background:#1A1D27;border-radius:10px;border:1px solid #2A2D3A;padding:20px;margin-bottom:16px}
  .lineage-hero-title{font-size:20px;font-weight:700;color:#F8FAFC;display:flex;align-items:center;gap:10px}
  .lineage-hero-title .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
  .lineage-hero-meta{font-size:12px;color:#64748B;margin-top:6px;font-family:'JetBrains Mono',monospace}
  .lineage-dax{font-family:'JetBrains Mono',monospace;font-size:12px;color:#94A3B8;background:#12141A;padding:10px 12px;border-radius:6px;border:1px solid #2A2D3A;margin-top:12px;white-space:pre-wrap;word-break:break-all;line-height:1.6}

  .lineage-flow-row{display:flex;gap:0;align-items:flex-start}
  .lineage-flow-col{flex:1;display:flex;flex-direction:column;gap:6px;padding:0 8px}
  .lineage-flow-col-label{font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:6px;font-weight:600}
  .lineage-arrow-col{display:flex;align-items:flex-start;justify-content:center;color:#334155;font-size:18px;flex-shrink:0;width:32px;padding-top:36px}

  .lc{background:#1A1D27;border:1px solid #2A2D3A;border-radius:8px;padding:10px 14px;transition:all .15s}
  .lc:hover{border-color:#475569}
  .lc.clickable{cursor:pointer}
  .lc.clickable:hover{border-color:#3B82F6}
  .lc .lc-name{font-size:13px;font-weight:600;color:#F8FAFC}
  .lc .lc-sub{font-size:10px;color:#64748B;font-family:'JetBrains Mono',monospace;margin-top:2px}
  .lc .lc-role{font-size:10px;color:#475569;margin-top:3px}
  .lc.upstream{border-left:3px solid #A78BFA}
  .lc.source{border-left:3px solid #10B981}
  .lc.center{border-left:3px solid #F59E0B;background:#14161C}
  .lc.center.col-type{border-left-color:#3B82F6}
  .lc.downstream{border-left:3px solid #8B5CF6}
  .lc.empty{border-style:dashed;opacity:.4}
  .lc.feeds{border-left:3px solid #F59E0B;background:rgba(245,158,11,.04)}

  .feeds-label{font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-top:10px;margin-bottom:4px;font-weight:600}

  .page-card{background:#1A1D27;border-radius:10px;border:1px solid #2A2D3A;margin-bottom:12px;overflow:hidden;transition:border-color .15s}
  .page-card:hover{border-color:#475569}
  .page-header{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:14px;user-select:none}
  .page-name{font-size:16px;font-weight:700;color:#F8FAFC;flex:1}
  .page-stats{display:flex;gap:12px;align-items:center}
  .page-stat{text-align:center}
  .page-stat-val{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace}
  .page-stat-label{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.05em}
  .page-expand{color:#475569;font-size:12px;transition:transform .2s;flex-shrink:0}
  .page-card.open .page-expand{transform:rotate(180deg)}
  .page-body{max-height:0;overflow:hidden;transition:max-height .3s ease}
  .page-card.open .page-body{max-height:2000px}
  .page-body-inner{padding:0 18px 16px}
  .page-section{margin-bottom:12px}
  .page-section-title{font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
  .page-section-title .line{flex:1;height:1px;background:#1E2028}
  .page-visual-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;transition:background .1s;margin-bottom:2px}
  .page-visual-row:hover{background:#12141A}
  .page-visual-type{font-size:11px;color:#64748B;font-family:'JetBrains Mono',monospace;width:100px;flex-shrink:0}
  .page-visual-title{font-size:13px;font-weight:600;color:#E2E8F0;flex:0 0 200px;min-width:200px}
  .page-visual-bindings{display:flex;flex-wrap:wrap;gap:3px}
  .page-type-summary{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .page-type-chip{font-size:10px;padding:3px 8px;border-radius:4px;background:#12141A;color:#94A3B8;border:1px solid #2A2D3A;font-family:'JetBrains Mono',monospace}

  .refresh-bar{position:fixed;bottom:0;left:0;right:0;height:28px;background:#12141C;border-top:1px solid #2A2D3A;display:flex;align-items:center;justify-content:center;gap:12px;font-size:11px;font-family:'JetBrains Mono',monospace;color:#64748B;z-index:999}
  .refresh-bar .timer{color:#94A3B8}
  .refresh-bar .dot{width:6px;height:6px;border-radius:50%;background:#334155;display:inline-block}
  .refresh-bar .dot.stale{background:#F59E0B}
  .refresh-bar button{padding:2px 10px;font-size:10px;font-family:'JetBrains Mono',monospace;border:1px solid #2A2D3A;border-radius:4px;cursor:pointer;background:#1A1D27;color:#64748B;transition:all .15s}
  .refresh-bar button:hover{background:#2A2D3A;color:#F8FAFC;border-color:#3B82F6}

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
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
  </div>
  <div class="summary" id="summary"></div>
  <div class="tabs" id="tabs"></div>

  <div class="panel" id="panel-measures">
    <div class="search-row">
      <input class="search-input" placeholder="Search measures..." oninput="filterTable('measures',this.value)">
      <button class="filter-btn" id="btn-unused-m" onclick="toggleUnused('measures')">Unused only</button>
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
      <button class="filter-btn" id="btn-unused-c" onclick="toggleUnused('columns')">Unused only</button>
    </div>
    <table class="data-table"><thead><tr>
      <th onclick="sortTable('columns','name')">Column ↕</th><th onclick="sortTable('columns','table')">Table ↕</th>
      <th onclick="sortTable('columns','dataType')">Type ↕</th><th onclick="sortTable('columns','usageCount')">Used ↕</th>
      <th onclick="sortTable('columns','pageCount')">Pages ↕</th><th>Used In</th>
    </tr></thead><tbody id="tbody-columns"></tbody></table>
  </div>

  <div class="panel" id="panel-pages"><div id="pages-content"></div></div>
  <div class="panel" id="panel-lineage"><div id="lineage-content"></div></div>
  <div class="panel" id="panel-unused"><div id="unused-content"></div></div>
</div>

<script>
const DATA=${JSON.stringify(data)};

let activeTab="measures",lastTab="measures";
let sortState={measures:{key:"usageCount",desc:true},columns:{key:"usageCount",desc:true}};
let showUnusedOnly={measures:false,columns:false};
let searchTerms={measures:"",columns:""};
let openPages=new Set();

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
  const t=DATA.totals,um=t.measuresInModel-t.measuresUsed,ucc=t.columnsInModel-t.columnsUsed;
  document.getElementById("summary").innerHTML=[
    {v:t.measuresUsed+"/"+t.measuresInModel,l:"Measures Used",c:""},{v:um,l:"Unused Measures",c:um>0?"danger":""},
    {v:t.columnsUsed+"/"+t.columnsInModel,l:"Columns Used",c:""},{v:ucc,l:"Unused Columns",c:ucc>0?"warn":""},
    {v:t.pages,l:"Pages",c:""},{v:t.visuals,l:"Visuals",c:""},
  ].map(s=>\`<div class="stat"><div class="stat-value \${s.c}">\${s.v}</div><div class="stat-label">\${s.l}</div></div>\`).join("");
}

function renderTabs(){
  const um=DATA.measures.filter(m=>m.usageCount===0).length+DATA.columns.filter(c=>c.usageCount===0).length;
  document.getElementById("tabs").innerHTML=[
    {id:"measures",l:"Measures",b:DATA.measures.length},{id:"columns",l:"Columns",b:DATA.columns.length},
    {id:"pages",l:"Pages",b:pageData.length},{id:"lineage",l:"Lineage",b:null},{id:"unused",l:"Unused",b:um,w:um>0}
  ].map(t=>\`<button class="tab \${activeTab===t.id?'active':''}" onclick="switchTab('\${t.id}')">\${t.l}\${t.b!==null?\`<span class="badge \${t.w?'warn':''}">\${t.b}</span>\`:''}</button>\`).join("");
}

function switchTab(id){
  if(id!=="lineage")lastTab=id;
  activeTab=id;renderTabs();
  document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
  document.getElementById("panel-"+id).classList.add("active");
  if(id==="lineage"&&!document.getElementById("lineage-content").innerHTML.trim())
    document.getElementById("lineage-content").innerHTML='<div style="text-align:center;padding:60px 20px;color:#475569"><div style="font-size:16px;margin-bottom:8px">Click a measure or column name to view its lineage</div><div style="font-size:12px">Go to the Measures or Columns tab and click any field name</div></div>';
}

function renderMeasures(){
  let items=[...DATA.measures];const s=sortState.measures;
  items.sort((a,b)=>{let av=a[s.key],bv=b[s.key];if(typeof av==='string')return s.desc?bv.localeCompare(av):av.localeCompare(bv);return s.desc?bv-av:av-bv;});
  if(showUnusedOnly.measures)items=items.filter(m=>m.usageCount===0);
  if(searchTerms.measures){const q=searchTerms.measures.toLowerCase();items=items.filter(m=>m.name.toLowerCase().includes(q)||m.table.toLowerCase().includes(q));}
  document.getElementById("tbody-measures").innerHTML=items.map(m=>{
    const deps=m.daxDependencies.map(d=>\`<span class="dep-chip" onclick="openLineage('measure','\${d}')">\${d}</span>\`).join("")||'<span style="color:#334155">—</span>';
    const pages=[...new Set(m.usedIn.map(u=>u.pageName))];
    const used=pages.map(p=>\`<span class="used-chip">\${p}</span>\`).join("")||'<span style="color:#334155">—</span>';
    return \`<tr class="\${m.usageCount===0?'unused':''}"><td><span class="field-name" onclick="openLineage('measure','\${m.name}')">\${m.name}</span></td><td><span class="field-table">\${m.table}</span></td><td><span class="usage-count \${uc(m.usageCount)}">\${m.usageCount}</span></td><td><span class="usage-count \${uc(m.pageCount)}">\${m.pageCount}</span></td><td>\${deps}</td><td>\${used}</td><td><span class="format-str">\${m.formatString||'—'}</span></td></tr>\`;
  }).join("");
}

function renderColumns(){
  let items=[...DATA.columns];const s=sortState.columns;
  items.sort((a,b)=>{let av=a[s.key],bv=b[s.key];if(typeof av==='string')return s.desc?bv.localeCompare(av):av.localeCompare(bv);return s.desc?bv-av:av-bv;});
  if(showUnusedOnly.columns)items=items.filter(c=>c.usageCount===0);
  if(searchTerms.columns){const q=searchTerms.columns.toLowerCase();items=items.filter(c=>c.name.toLowerCase().includes(q)||c.table.toLowerCase().includes(q));}
  document.getElementById("tbody-columns").innerHTML=items.map(c=>{
    const pages=[...new Set(c.usedIn.map(u=>u.pageName))];
    const used=pages.map(p=>\`<span class="used-chip">\${p}</span>\`).join("")||'<span style="color:#334155">—</span>';
    const sb=c.isSlicerField?'<span class="slicer-badge">SLICER</span>':'';
    return \`<tr class="\${c.usageCount===0?'unused':''}"><td><span class="field-name" onclick="openLineage('column','\${c.name}')">\${c.name}</span>\${sb}</td><td><span class="field-table">\${c.table}</span></td><td><span class="mono" style="font-size:11px;color:#64748B">\${c.dataType}</span></td><td><span class="usage-count \${uc(c.usageCount)}">\${c.usageCount}</span></td><td><span class="usage-count \${uc(c.pageCount)}">\${c.pageCount}</span></td><td>\${used}</td></tr>\`;
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
          \${upstream.length?upstream.map(u=>\`
            <div class="lc upstream clickable" onclick="openLineage('measure','\${u.name}')">
              <div class="lc-name">\${u.name}</div>
              <div class="lc-sub">\${u.table} · \${u.formatString||''}</div>
            </div>\`).join(""):\`<div class="lc upstream empty"><div class="lc-name">No dependencies</div><div class="lc-sub">Base measure</div></div>\`}
          <div class="lc source" style="margin-top:4px">
            <div class="lc-name" style="color:#10B981">⬡ \${m.table}</div>
            <div class="lc-sub">Source table</div>
          </div>
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
  document.getElementById("pages-content").innerHTML=pageData.map(p=>{
    const isOpen=openPages.has(p.name);

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
        <div class="page-name">\${p.name}</div>
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

function renderUnused(){
  const um=DATA.measures.filter(m=>m.usageCount===0),ucc=DATA.columns.filter(c=>c.usageCount===0);
  let h='';
  if(um.length)h+=\`<div style="margin-bottom:20px"><h3 style="font-size:14px;color:#EF4444;margin-bottom:10px;font-weight:600">Unused Measures (\${um.length})</h3><div style="display:flex;flex-wrap:wrap;gap:8px">\${um.map(m=>\`<div class="lc clickable" style="border-left:3px solid #EF4444;flex:0 0 auto" onclick="openLineage('measure','\${m.name}')"><div class="lc-name">\${m.name}</div><div class="lc-sub">\${m.table} · \${m.formatString||''}</div></div>\`).join("")}</div></div>\`;
  if(ucc.length)h+=\`<div><h3 style="font-size:14px;color:#F59E0B;margin-bottom:10px;font-weight:600">Unused Columns (\${ucc.length})</h3><div style="display:flex;flex-wrap:wrap;gap:8px">\${ucc.map(c=>\`<div class="lc clickable" style="border-left:3px solid #F59E0B;flex:0 0 auto" onclick="openLineage('column','\${c.name}')"><div class="lc-name">\${c.name}</div><div class="lc-sub">\${c.table} · \${c.dataType}</div></div>\`).join("")}</div></div>\`;
  if(!um.length&&!ucc.length)h='<div style="text-align:center;padding:40px;color:#22C55E;font-weight:600">All fields are in use ✓</div>';
  document.getElementById("unused-content").innerHTML=h;
}

function sortTable(t,k){const s=sortState[t];if(s.key===k)s.desc=!s.desc;else{s.key=k;s.desc=true;}t==="measures"?renderMeasures():renderColumns();}
function filterTable(t,v){searchTerms[t]=v;t==="measures"?renderMeasures():renderColumns();}
function toggleUnused(t){showUnusedOnly[t]=!showUnusedOnly[t];document.getElementById("btn-unused-"+(t==="measures"?"m":"c")).classList.toggle("active");t==="measures"?renderMeasures():renderColumns();}

renderSummary();renderTabs();renderMeasures();renderColumns();renderPages();renderUnused();switchTab("measures");

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
// Output Dir — inside MCP project: .usage/<report-name>/
// ═══════════════════════════════════════════════════════════════════════════════

/** Output dir inside the MCP project: .usage/<report-name>/ */
export function getUsageDir(reportPath: string): string {
  const name = path.basename(reportPath).replace(/\.Report$/, "");
  // __dirname = dist/ at runtime, go up one level to project root
  const projectRoot = path.join(__dirname, "..");
  return path.join(projectRoot, ".usage", name);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Caching + Watchers + Regeneration
// ═══════════════════════════════════════════════════════════════════════════════

let usageCache: { data: FullData; timestamp: number } | null = null;
let watchers: fs.FSWatcher[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastHtmlHash = "";
let currentReportPath: string | null = null;
let currentDashboardPath: string | null = null;

function simpleHash(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

export function regenerate(): void {
  if (!currentReportPath) return;
  try {
    const data = buildFullData(currentReportPath);
    const reportName = path.basename(currentReportPath).replace(/\.Report$/, "");
    const html = generateHTML(data, reportName);
    const hash = simpleHash(html);
    if (hash !== lastHtmlHash && currentDashboardPath) {
      const dir = path.dirname(currentDashboardPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(currentDashboardPath, html, "utf8");
      fs.writeFileSync(path.join(dir, "timestamp.txt"), String(Date.now()), "utf8");
      lastHtmlHash = hash;
    }
    usageCache = { data, timestamp: Date.now() };
  } catch (e) {
    console.error("model_usage regenerate failed:", e);
  }
}

export function invalidateCache(): void {
  usageCache = null;
  setTimeout(() => regenerate(), 50);
}

function onFileChange(filename: string | null): void {
  if (!filename) return;
  const ext = path.extname(filename);
  if (ext !== ".json" && ext !== ".tmdl" && filename !== "model.bim") return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => regenerate(), 500);
}

export function stopWatchers(): void {
  watchers.forEach(w => { try { w.close(); } catch { /* ignore */ } });
  watchers = [];
}

export function startWatchers(reportPath: string, modelPath: string): void {
  stopWatchers();
  currentReportPath = reportPath;

  const usageDir = getUsageDir(reportPath);
  currentDashboardPath = path.join(usageDir, "index.html");

  try {
    watchers.push(fs.watch(reportPath, { recursive: true }, (_event, f) => onFileChange(f as string)));
  } catch (e) {
    console.error("model_usage: failed to watch report folder:", e);
  }

  try {
    watchers.push(fs.watch(modelPath, { recursive: true }, (_event, f) => onFileChange(f as string)));
  } catch (e) {
    console.error("model_usage: failed to watch model folder:", e);
  }
}

process.on("exit", stopWatchers);
process.on("SIGINT", stopWatchers);
process.on("SIGTERM", stopWatchers);

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Tool Registration
// ═══════════════════════════════════════════════════════════════════════════════

export function registerModelUsageTool(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "model_usage",
    "Cross-reference the semantic model with the report — shows where every measure and column is used, DAX dependencies, unused fields, and per-page coverage. Also generates an HTML dashboard for visual inspection.",
    {
      reportPath: z.string().optional().describe("Path to the .Report folder. Uses current connected report if omitted."),
      slim: z.boolean().optional().default(true).describe("Slim mode returns usage counts only. Set false for full visual-level detail."),
    },
    async ({ reportPath: rp, slim }: { reportPath?: string; slim: boolean }) => {
      const effectivePath = rp || ctx.getReportPath();
      if (!effectivePath) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "No report connected. Use set_report first." }) }], isError: true };
      }

      let data: FullData;
      let cached = false;

      if (usageCache && !rp) {
        data = usageCache.data;
        cached = true;
      } else {
        data = buildFullData(effectivePath);
        usageCache = { data, timestamp: Date.now() };
        currentReportPath = effectivePath;
      }

      // Always regenerate HTML
      const reportName = path.basename(effectivePath).replace(/\.Report$/, "");
      currentDashboardPath = path.join(getUsageDir(effectivePath), "index.html");
      const dir = path.dirname(currentDashboardPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const html = generateHTML(data, reportName);
      fs.writeFileSync(currentDashboardPath, html, "utf8");
      fs.writeFileSync(path.join(dir, "timestamp.txt"), String(Date.now()), "utf8");
      lastHtmlHash = simpleHash(html);

      // Build response — JSON data only (HTML is 58KB+, too large for context)
      if (slim) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              measures: data.measures.map(m => ({ name: m.name, table: m.table, usageCount: m.usageCount, pageCount: m.pageCount, daxDependencies: m.daxDependencies })),
              columns: data.columns.map(c => ({ name: c.name, table: c.table, usageCount: c.usageCount, pageCount: c.pageCount, isSlicerField: c.isSlicerField })),
              pages: data.pages.map(p => ({ name: p.name, visualCount: p.visualCount, measureCount: p.measureCount, columnCount: p.columnCount, slicerCount: p.slicerCount, coverage: p.coverage })),
              unused: data.unused,
              totals: data.totals,
              dashboardPath: currentDashboardPath,
              cached,
              timestamp: Date.now(),
            }),
          }],
        };
      } else {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              measures: data.measures.map(m => ({
                name: m.name, table: m.table, usageCount: m.usageCount, pageCount: m.pageCount,
                daxDependencies: m.daxDependencies, dependedOnBy: m.dependedOnBy,
                formatString: m.formatString, daxExpression: m.daxExpression, usedIn: m.usedIn,
              })),
              columns: data.columns.map(c => ({
                name: c.name, table: c.table, usageCount: c.usageCount, pageCount: c.pageCount,
                isSlicerField: c.isSlicerField, dataType: c.dataType, usedIn: c.usedIn,
              })),
              pages: data.pages,
              unused: data.unused,
              totals: data.totals,
              dashboardPath: currentDashboardPath,
              cached,
              timestamp: Date.now(),
            }),
          }],
        };
      }
    }
  );
}
