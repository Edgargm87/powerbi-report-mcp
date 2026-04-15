"use strict";
// ═══════════════════════════════════════════════════════════════════════════════
// Binding Validation
//
// Checks whether every field referenced in a `bindings` array actually exists
// in the report's semantic model (plus report-layer extension measures).
// Catches the silent-broken-visual failure mode where an agent binds
// `Sales[FooBar]` to a visual when `FooBar` doesn't exist — PBI Desktop
// happily loads the file and renders nothing, and the mistake isn't noticed
// until someone opens the report.
//
// The three bind paths (`add_visual`, `update_visual_bindings`, `bulk_bind`)
// all run their input through `validateBindings` BEFORE any write happens.
// When the model can't be located (live-connect, missing sibling folder,
// parse error), validation silently skips — it must never block a legitimate
// workflow just because the model is unreadable.
//
// Three modes (via MCP_BINDING_VALIDATION env var or per-call `strictBindings`):
//   strict (default) — any unknown field fails the call with an error list
//   warn              — same errors are returned as `bindingWarnings` in a
//                       successful response, caller decides how to react
//   off               — validation skipped entirely
// ═══════════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveValidationMode = resolveValidationMode;
exports.getInventoryForProject = getInventoryForProject;
exports.validateFieldSpec = validateFieldSpec;
exports.validateBindings = validateBindings;
exports.formatBindingErrors = formatBindingErrors;
exports.runBindingValidation = runBindingValidation;
const model_usage_js_1 = require("../model-usage.js");
// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------
/**
 * Resolve the effective validation mode for a single call.
 *
 * Precedence (highest first):
 *   1. Per-call `strictBindings` param (true → "strict", false → "warn")
 *   2. `MCP_BINDING_VALIDATION` env var ("strict" | "warn" | "off")
 *   3. Default "strict"
 */
function resolveValidationMode(strictBindings) {
    if (strictBindings === true)
        return "strict";
    if (strictBindings === false)
        return "warn";
    const envVal = (process.env.MCP_BINDING_VALIDATION || "").toLowerCase().trim();
    if (envVal === "off" || envVal === "false" || envVal === "0")
        return "off";
    if (envVal === "warn" || envVal === "warning")
        return "warn";
    if (envVal === "strict" || envVal === "on" || envVal === "1")
        return "strict";
    return "strict";
}
// ---------------------------------------------------------------------------
// Inventory lookup
// ---------------------------------------------------------------------------
/**
 * Get the model field inventory for a project. Returns `null` when:
 *   - validation is disabled globally (MCP_BINDING_VALIDATION=off)
 *   - the sibling `.SemanticModel` folder can't be located
 *   - the model files can't be parsed
 *
 * Callers must treat `null` as "skip validation silently", never as
 * "model is empty".
 */
function getInventoryForProject(project, mode) {
    if (mode === "off")
        return null;
    try {
        return (0, model_usage_js_1.getModelFieldInventory)(project.reportPath);
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Nearest-match suggestions (simple Levenshtein, length-bounded)
// ---------------------------------------------------------------------------
/**
 * Classic Levenshtein distance with an early-exit when the guaranteed
 * minimum already exceeds `cap`. Used for typo suggestions on field names,
 * so the O(n²) cost is fine — inputs are short (<50 chars).
 */
function levenshtein(a, b, cap) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    if (Math.abs(a.length - b.length) > cap)
        return cap + 1;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin)
                rowMin = curr[j];
        }
        if (rowMin > cap)
            return cap + 1;
        for (let j = 0; j <= b.length; j++)
            prev[j] = curr[j];
    }
    return prev[b.length];
}
/** Case-insensitive variant — used when a field differs only in casing. */
function levenshteinCI(a, b, cap) {
    return levenshtein(a.toLowerCase(), b.toLowerCase(), cap);
}
/**
 * Return up to `k` closest matches from `candidates` to `target`, formatted
 * with the caller-supplied `format` (usually `"Table[Field]"`). Prefers
 * case-insensitive exact matches first, then Levenshtein-ranked.
 */
function topMatches(target, candidates, format, k = 3) {
    if (!candidates.length)
        return [];
    const cap = Math.max(2, Math.floor(target.length / 2));
    const ranked = [];
    for (const c of candidates) {
        const d = levenshteinCI(target, c, cap);
        if (d <= cap)
            ranked.push({ name: c, d });
    }
    ranked.sort((a, b) => a.d - b.d || a.name.localeCompare(b.name));
    return ranked.slice(0, k).map((r) => format(r.name));
}
// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------
function parseInline(spec) {
    if (spec.field) {
        const match = spec.field.match(/^(.+)\[(.+)\]$/);
        if (!match)
            return null;
        return { entity: match[1].trim(), property: match[2].trim() };
    }
    if (spec.entity && spec.property) {
        return { entity: spec.entity, property: spec.property };
    }
    return null;
}
function asLabel(entity, property) {
    return `${entity}[${property}]`;
}
/**
 * Validate a single field spec against the model inventory.
 * Returns `null` when the field is valid, or a `BindingValidationError`
 * describing the problem.
 */
function validateFieldSpec(spec, inventory) {
    const parsed = parseInline(spec);
    if (!parsed) {
        const raw = spec.field || `${spec.entity ?? "?"}.${spec.property ?? "?"}`;
        return {
            label: raw,
            kind: spec.type,
            entity: "?",
            property: "?",
            reason: "parse_error",
            suggestions: [],
            rawMessage: `Field spec could not be parsed: expected "Table[Column]" or entity+property.`,
        };
    }
    const { entity, property } = parsed;
    const table = inventory.tables.get(entity);
    if (!table) {
        // Table name wrong — suggest nearest table.
        return {
            label: asLabel(entity, property),
            kind: spec.type,
            entity,
            property,
            reason: "table_not_found",
            suggestions: topMatches(entity, inventory.tableNames, (n) => `${n}[${property}]`, 3),
        };
    }
    // Field exists and is a measure.
    if (table.measures.has(property)) {
        if (spec.type === "column") {
            return {
                label: asLabel(entity, property),
                kind: "column",
                entity,
                property,
                reason: "type_mismatch_column_is_measure",
                suggestions: [asLabel(entity, property) + " (type: measure)"],
            };
        }
        return null; // measure or aggregation of a measure — valid
    }
    // Field exists and is a column.
    if (table.columns.has(property)) {
        if (spec.type === "measure") {
            return {
                label: asLabel(entity, property),
                kind: "measure",
                entity,
                property,
                reason: "type_mismatch_measure_is_column",
                suggestions: [asLabel(entity, property) + " (type: column or aggregation)"],
            };
        }
        return null; // column or aggregation(column) — valid
    }
    // Field not found in this table. Suggest similar names, prioritising the
    // correct kind (measures for measure specs, columns otherwise).
    const pool = spec.type === "measure"
        ? [...table.measures]
        : [...table.columns, ...table.measures];
    const suggestions = topMatches(property, pool, (n) => asLabel(entity, n), 3);
    return {
        label: asLabel(entity, property),
        kind: spec.type,
        entity,
        property,
        reason: spec.type === "measure" ? "measure_not_found" : "column_not_found",
        suggestions,
    };
}
/**
 * Validate a full `bindings` array. Returns a (possibly empty) array of
 * errors. Pure — does not throw, does not mutate.
 */
function validateBindings(bindings, inventory) {
    if (!inventory)
        return [];
    if (!bindings || bindings.length === 0)
        return [];
    const errors = [];
    for (const binding of bindings) {
        for (const field of binding.fields ?? []) {
            const err = validateFieldSpec(field, inventory);
            if (err)
                errors.push(err);
        }
    }
    return errors;
}
// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------
function describeReason(err) {
    switch (err.reason) {
        case "table_not_found":
            return `table '${err.entity}' not found in model`;
        case "measure_not_found":
            return `measure not found in table '${err.entity}'`;
        case "column_not_found":
            return `column not found in table '${err.entity}'`;
        case "type_mismatch_measure_is_column":
            return `'${err.entity}[${err.property}]' is a column, not a measure`;
        case "type_mismatch_column_is_measure":
            return `'${err.entity}[${err.property}]' is a measure, not a column`;
        case "parse_error":
            return err.rawMessage || "field spec could not be parsed";
    }
}
/**
 * Turn an error list into a single human-readable string. Used as the
 * payload of the thrown/returned error in strict mode and as the content of
 * `bindingWarnings` in warn mode.
 */
function formatBindingErrors(errors) {
    if (!errors.length)
        return "";
    const lines = [];
    lines.push(`Binding validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
    for (const err of errors) {
        const reason = describeReason(err);
        let line = `  • ${err.label} (${err.kind}): ${reason}`;
        if (err.suggestions.length > 0) {
            line += `. Did you mean: ${err.suggestions.join(", ")}?`;
        }
        lines.push(line);
    }
    lines.push(`Validation runs against the sibling .SemanticModel folder + report extension measures. ` +
        `To bypass for a single call set strictBindings: false, or set MCP_BINDING_VALIDATION=off globally.`);
    return lines.join("\n");
}
/**
 * Run validation with the three-mode policy and return a structured outcome.
 * Tool handlers should branch on `outcome.proceed`:
 *   - strict + errors → return error response, skip the write
 *   - warn + errors   → proceed with the write, include `bindingWarnings`
 *   - no errors       → proceed silently
 */
function runBindingValidation(project, bindings, strictBindings) {
    const mode = resolveValidationMode(strictBindings);
    if (mode === "off") {
        return { proceed: true, errors: [], message: "", mode };
    }
    const inventory = getInventoryForProject(project, mode);
    if (!inventory) {
        // No model to validate against — degrade silently.
        return { proceed: true, errors: [], message: "", mode };
    }
    const errors = validateBindings(bindings, inventory);
    if (errors.length === 0) {
        return { proceed: true, errors: [], message: "", mode };
    }
    const message = formatBindingErrors(errors);
    return { proceed: mode !== "strict", errors, message, mode };
}
