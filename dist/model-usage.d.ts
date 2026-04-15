import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
interface CalcItem {
    name: string;
    ordinal: number;
    expression: string;
    formatStringExpression: string;
    description: string;
}
interface ModelCalcGroup {
    name: string;
    description: string;
    precedence: number;
    items: CalcItem[];
}
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
    status: "direct" | "indirect" | "unused";
}
interface ModelColumn {
    name: string;
    table: string;
    dataType: string;
    isSlicerField: boolean;
    isKey: boolean;
    isHidden: boolean;
    isCalculated: boolean;
    usedIn: BindingRef[];
    usageCount: number;
    pageCount: number;
    status: "direct" | "indirect" | "unused";
}
interface BindingRef {
    pageId: string;
    pageName: string;
    visualId: string;
    visualType: string;
    visualTitle: string;
    bindingRole: string;
}
interface TableColumnData {
    name: string;
    dataType: string;
    isKey: boolean;
    isInferredPK: boolean;
    isHidden: boolean;
    isCalculated: boolean;
    isFK: boolean;
    fkTarget?: {
        table: string;
        column: string;
    };
    incomingRefs: Array<{
        table: string;
        column: string;
        isActive: boolean;
    }>;
    usageCount: number;
    status: "direct" | "indirect" | "unused";
}
interface TableRelationshipRef {
    direction: "outgoing" | "incoming";
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    isActive: boolean;
}
interface TableData {
    name: string;
    isCalcGroup: boolean;
    columnCount: number;
    measureCount: number;
    keyCount: number;
    fkCount: number;
    hiddenColumnCount: number;
    columns: TableColumnData[];
    measures: Array<{
        name: string;
        status: string;
        usageCount: number;
    }>;
    relationships: TableRelationshipRef[];
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
    visuals: Array<{
        type: string;
        title: string;
        bindings: Array<{
            fieldName: string;
            fieldTable: string;
            fieldType: string;
        }>;
    }>;
}
interface FullData {
    measures: ModelMeasure[];
    columns: ModelColumn[];
    relationships: ModelRelationship[];
    functions: ModelFunction[];
    calcGroups: ModelCalcGroup[];
    tables: TableData[];
    pages: PageData[];
    hiddenPages: string[];
    totals: {
        measuresInModel: number;
        measuresDirect: number;
        measuresIndirect: number;
        measuresUnused: number;
        columnsInModel: number;
        columnsDirect: number;
        columnsIndirect: number;
        columnsUnused: number;
        relationships: number;
        functions: number;
        calcGroups: number;
        tables: number;
        pages: number;
        visuals: number;
    };
}
export declare function findSemanticModelPath(reportPath: string): string;
interface ModelRelationship {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    isActive: boolean;
}
interface ModelFunction {
    name: string;
    parameters: string;
    expression: string;
    description: string;
}
export interface ModelFieldInventory {
    /** table name → { columns: Set<columnName>, measures: Set<measureName> } */
    tables: Map<string, {
        columns: Set<string>;
        measures: Set<string>;
    }>;
    /** All table names (for nearest-match suggestions on typos). */
    tableNames: string[];
    /** Extension measures (stored in reportExtensions.json, not the model). */
    extensionMeasures: Map<string, Set<string>>;
    /** Timestamp when built — useful for debugging cache behaviour. */
    builtAt: number;
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
export declare function getModelFieldInventory(reportPath: string): ModelFieldInventory | null;
export declare function buildFullData(reportPath: string): FullData;
export declare function generateHTML(data: FullData, reportName: string): string;
/** Output dir inside the MCP project: .usage/<report-name>/ */
export declare function getUsageDir(reportPath: string): string;
export declare function regenerate(): void;
export declare function invalidateCache(): void;
export declare function stopWatchers(): void;
export declare function startWatchers(reportPath: string, modelPath: string): void;
export declare function registerModelUsageTool(server: McpServer, ctx: ServerContext): void;
export {};
