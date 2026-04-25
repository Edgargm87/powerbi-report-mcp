"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// MCP result shape — single source of truth
//
// Every tool handler must return a MCPResult. As of v0.8.0 the shape is
// dual-emit:
//
//   {
//     content: [{ type: "text", text: <JSON string> }],  // legacy text, back-compat
//     structuredContent: <object>,                       // modern parsed payload
//     isError?: true                                      // only when the call failed
//   }
//
// The JSON payload always carries at minimum:
//   { success: boolean, ...}
//
// On failure: { success: false, error: string, ...details }
// On success: { success: true, ...data }
//
// The dual emission lets newer MCP clients consume `structuredContent`
// directly (no JSON.parse round-trip, schema-validated against any
// `outputSchema` declared at registration time) while older clients keep
// reading the stringified `content[0].text`.
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
 * is automatically merged into the root. Both `content[0].text` (legacy
 * stringified) and `structuredContent` (modern parsed object) carry the
 * same payload — newer clients read the structured form directly, older
 * clients keep parsing the text envelope.
 */
function ok(payload = {}) {
    const body = { success: true, ...payload };
    return {
        content: [{ type: "text", text: JSON.stringify(body) }],
        structuredContent: body,
    };
}
/**
 * Build an error response. The error message plus any structured details are
 * merged into a `{ success: false, error, ...details }` payload. `isError: true`
 * is set so MCP clients can distinguish protocol errors from success-with-caveat
 * responses. Both legacy text and `structuredContent` are populated so error
 * responses are also parseable without re-stringifying.
 */
function fail(error, details = {}) {
    const body = { success: false, error, ...details };
    return {
        content: [{ type: "text", text: JSON.stringify(body) }],
        structuredContent: body,
        isError: true,
    };
}
/**
 * Build a raw-text response (no JSON envelope). Use sparingly — reserved for
 * tools that return large pre-formatted payloads (e.g. `pbir_model_usage` HTML,
 * `pbir_get_visual` slim=false raw PBIR JSON) where an extra `{success: true}`
 * wrapper would be redundant and break downstream parsers. No
 * `structuredContent` is emitted — by definition the payload is not
 * structured JSON.
 */
function raw(text) {
    return { content: [{ type: "text", text }] };
}
