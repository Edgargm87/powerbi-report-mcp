export interface MCPResult {
    [x: string]: unknown;
    content: [{
        type: "text";
        text: string;
    }];
    structuredContent?: Record<string, unknown>;
    isError?: true;
}
/**
 * Build a success response. Payload is serialized to JSON; `success: true`
 * is automatically merged into the root. Both `content[0].text` (legacy
 * stringified) and `structuredContent` (modern parsed object) carry the
 * same payload — newer clients read the structured form directly, older
 * clients keep parsing the text envelope.
 */
export declare function ok(payload?: Record<string, unknown>): MCPResult;
/**
 * Build an error response. The error message plus any structured details are
 * merged into a `{ success: false, error, ...details }` payload. `isError: true`
 * is set so MCP clients can distinguish protocol errors from success-with-caveat
 * responses. Both legacy text and `structuredContent` are populated so error
 * responses are also parseable without re-stringifying.
 */
export declare function fail(error: string, details?: Record<string, unknown>): MCPResult;
/**
 * Build a raw-text response (no JSON envelope). Use sparingly — reserved for
 * tools that return large pre-formatted payloads (e.g. `pbir_model_usage` HTML,
 * `pbir_get_visual` slim=false raw PBIR JSON) where an extra `{success: true}`
 * wrapper would be redundant and break downstream parsers. No
 * `structuredContent` is emitted — by definition the payload is not
 * structured JSON.
 */
export declare function raw(text: string): MCPResult;
