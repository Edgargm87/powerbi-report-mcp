/**
 * Extract the visual title text from a visual definition, stripping the
 * single-quote wrapping PBIR uses for string literals.
 *
 * @param visualContainerObjects The `visual.visualContainerObjects` object
 * from a visual.json — pass the raw value; this helper handles undefined,
 * missing keys, non-array shapes, and empty arrays.
 * @returns The title text, or null if not set / malformed.
 */
export declare function extractVisualTitle(visualContainerObjects: unknown): string | null;
