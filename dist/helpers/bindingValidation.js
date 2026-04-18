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
exports._resetBindingValidationWarnings = _resetBindingValidationWarnings;
exports.validateFieldSpec = validateFieldSpec;
exports.validateBindings = validateBindings;
exports.formatBindingErrors = formatBindingErrors;
exports.isNoteworthySkip = isNoteworthySkip;
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
// One-time-per-path warning log. Without this, every single bind call on a
// live-connect report would spam stderr with the same "model not found" line.
const warnedPaths = new Set();
function warnOnce(reportPath, msg) {
    if (warnedPaths.has(reportPath))
        return;
    warnedPaths.add(reportPath);
    console.error(`[binding-validation] ${msg}  (report: ${reportPath})`);
}
/**
 * Get the model field inventory for a project. Returns `{inventory, skipReason}`:
 *   - when mode is "off" → null inventory, skipReason = "mode_off"
 *   - when .SemanticModel is unreachable → null, skipReason = "model_not_found"
 *   - when parsing throws → null, skipReason = "model_parse_error"
 *   - when everything loads → inventory non-null, skipReason = null
 *
 * Stderr is tagged with `[binding-validation]` the first time a particular
 * report path fails so silent-degrade is observable without spamming logs.
 */
function getInventoryForProject(project, mode) {
    if (mode === "off") {
        return { inventory: null, skipReason: "mode_off" };
    }
    try {
        const inv = (0, model_usage_js_1.getModelFieldInventory)(project.reportPath);
        if (!inv) {
            warnOnce(project.reportPath, "validation skipped: no sibling .SemanticModel folder (live-connect report or thin report)");
            return { inventory: null, skipReason: "model_not_found" };
        }
        return { inventory: inv, skipReason: null };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnOnce(project.reportPath, `validation skipped: model inventory failed to parse (${msg})`);
        return { inventory: null, skipReason: "model_parse_error" };
    }
}
/**
 * Test-seam: clear the once-per-path warning memory. Used by the binding
 * validator test suite so repeated runs see the same logs.
 */
function _resetBindingValidationWarnings() {
    warnedPaths.clear();
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
 * Returns true when the skip reason is worth surfacing to the agent. Trivial
 * skips (`mode_off`, `empty_bindings`) are noise — they either reflect the
 * caller's own choice or a no-op input. Non-trivial skips (`model_not_found`,
 * `model_parse_error`) signal that an expected safety net didn't engage, and
 * the agent should know so it can be extra careful with its bindings.
 */
function isNoteworthySkip(reason) {
    return reason === "model_not_found" || reason === "model_parse_error";
}
/**
 * Run validation with the three-mode policy and return a structured outcome.
 * Tool handlers should branch on `outcome.proceed`:
 *   - strict + errors → return error response, skip the write
 *   - warn + errors   → proceed with the write, include `bindingWarnings`
 *   - no errors       → proceed silently
 *
 * `outcome.skipReason` is non-null when the validator had no model to work
 * against (off mode, live-connect report, unparseable model). Handlers may
 * surface this to the agent for transparency — e.g. `bindingValidation: { skipped: "model_not_found" }`
 * — but must never block the call on a skip.
 */
function runBindingValidation(project, bindings, strictBindings) {
    const mode = resolveValidationMode(strictBindings);
    if (mode === "off") {
        return { proceed: true, errors: [], message: "", mode, skipReason: "mode_off" };
    }
    // Short-circuit on empty input before we bother loading the inventory —
    // there's nothing to check and an inventory miss here would be misleading.
    if (!bindings || bindings.length === 0) {
        return { proceed: true, errors: [], message: "", mode, skipReason: "empty_bindings" };
    }
    const { inventory, skipReason } = getInventoryForProject(project, mode);
    if (!inventory) {
        // No model to validate against — degrade silently but surface the reason.
        return { proceed: true, errors: [], message: "", mode, skipReason };
    }
    const errors = validateBindings(bindings, inventory);
    if (errors.length === 0) {
        return { proceed: true, errors: [], message: "", mode, skipReason: null };
    }
    const message = formatBindingErrors(errors);
    return { proceed: mode !== "strict", errors, message, mode, skipReason: null };
}
