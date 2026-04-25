export type CategoryMap = Map<string, Record<string, unknown>>;
export declare function loadSchema(): {
    schema: Record<string, unknown>;
    file: string;
};
export declare function getCategoriesForVisualType(schema: Record<string, unknown>, visualType: string): CategoryMap;
export declare function summarizePropertySpec(schema: Record<string, unknown>, spec: unknown): {
    type: string;
    enum?: string[];
    description?: string;
    title?: string;
};
