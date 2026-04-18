"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// MCP result shape — single source of truth
//
// Every tool handler must return a MCPResult. The shape is:
//   {
//     content: [{ type: "text", text: <JSON string> }],
//     isError?: true  // only when the call failed
//   }
//
// The JSON payload always carries at minimum:
//   { success: boolean, ...}
//
// On failure: { success: false, error: string, ...details }
// On success: { success: true, ...data }
//
// The `safe()` wrapper in src/index.ts catches thrown errors and converts them
// to this shape with `isError: true`. Handlers that return early for
// validation failures should also use `isError: true` for consistency with
// the `isError` contract in the MCP spec.
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
exports.raw = raw;
/**
 * Build a success response. Payload is serialized to JSON; `success: true`
 * is automatically merged into the root.
 */
function ok(payload = {}) {
    return {
        content: [
            { type: "text", text: JSON.stringify({ success: true, ...payload }) },
        ],
    };
}
/**
 * Build an error response. The error message plus any structured details are
 * merged into a `{ success: false, error, ...details }` payload. `isError: true`
 * is set so MCP clients can distinguish protocol errors from success-with-caveat
 * responses.
 */
function fail(error, details = {}) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ success: false, error, ...details }),
            },
        ],
        isError: true,
    };
}
/**
 * Build a raw-text response (no JSON envelope). Use sparingly — reserved for
 * tools that return large pre-formatted payloads (e.g. `model_usage` HTML,
 * `get_visual` slim=false raw PBIR JSON) where an extra `{success: true}`
 * wrapper would be redundant and break downstream parsers.
 */
function raw(text) {
    return { content: [{ type: "text", text }] };
}
