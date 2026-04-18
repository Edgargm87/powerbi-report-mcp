export interface MCPResult {
    [x: string]: unknown;
    content: [{
        type: "text";
        text: string;
    }];
    isError?: true;
}
/**
 * Build a success response. Payload is serialized to JSON; `success: true`
 * is automatically merged into the root.
 */
export declare function ok(payload?: Record<string, unknown>): MCPResult;
/**
 * Build an error response. The error message plus any structured details are
 * merged into a `{ success: false, error, ...details }` payload. `isError: true`
 * is set so MCP clients can distinguish protocol errors from success-with-caveat
 * responses.
 */
export declare function fail(error: string, details?: Record<string, unknown>): MCPResult;
/**
 * Build a raw-text response (no JSON envelope). Use sparingly — reserved for
 * tools that return large pre-formatted payloads (e.g. `model_usage` HTML,
 * `get_visual` slim=false raw PBIR JSON) where an extra `{success: true}`
 * wrapper would be redundant and break downstream parsers.
 */
export declare function raw(text: string): MCPResult;
