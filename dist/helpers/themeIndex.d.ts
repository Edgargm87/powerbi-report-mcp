export interface FormatEntry {
    category: string;
    properties?: Record<string, unknown>;
}
export interface FormatTypoIssue {
    category: string;
    prop?: string;
    didYouMean: string;
}
/**
 * Validate format entries against the bundled schema.
 *
 * Returns one issue per misspelled category/property with a single best-guess
 * "did you mean" suggestion. Empty array = clean. Unknown visualType returns
 * empty array (we don't gate writes on schema lag).
 */
export declare function validateFormatTypos(visualType: string, entries: ReadonlyArray<FormatEntry>): FormatTypoIssue[];
/**
 * Test seam — drops the cached index so tests can rebuild after fixture swaps.
 */
export declare function _resetThemeIndex(): void;
