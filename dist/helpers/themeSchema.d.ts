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
export type ValidationIssue = {
    category: string;
    issue: "unknown-category" | "unknown-property";
    name: string;
    didYouMean?: string[];
};
/**
 * Validate a list of {category, properties} entries against the schema for a
 * given visualType. Returns empty array when everything is known.
 *
 * The schema's `*` category is treated as a pass-through — anything allowed
 * there is allowed under every category (it's the shared bag of common props).
 *
 * Unknown visualType → no-op (we don't want to block writes on visual types
 * the schema hasn't caught up with yet; the refresh script handles that).
 */
export declare function validateFormatting(visualType: string, entries: Array<{
    category: string;
    properties: Record<string, unknown>;
}>): ValidationIssue[];
