import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
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
    pages: PageData[];
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
