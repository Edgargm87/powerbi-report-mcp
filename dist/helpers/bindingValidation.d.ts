import type { FieldSpecInput } from "./createVisual.js";
import type { ModelFieldInventory } from "../model-usage.js";
import type { PbirProject } from "../pbir.js";
export type ValidationMode = "strict" | "warn" | "off";
export interface BindingValidationError {
    /** "Table[Field]" as the caller provided it, for round-tripping into error messages. */
    label: string;
    /** Column / measure / aggregation — whichever the spec claimed. */
    kind: "column" | "measure" | "aggregation";
    /** Table name (parsed). */
    entity: string;
    /** Field name (parsed). */
    property: string;
    /** Why validation failed — stable category used by the formatter. */
    reason: "table_not_found" | "measure_not_found" | "column_not_found" | "type_mismatch_measure_is_column" | "type_mismatch_column_is_measure" | "parse_error";
    /** Top 3 nearest-match suggestions, already formatted as "Table[Field]". */
    suggestions: string[];
    /** Human-readable raw message (used for `parse_error` and anything unusual). */
    rawMessage?: string;
}
/**
 * Resolve the effective validation mode for a single call.
 *
 * Precedence (highest first):
 *   1. Per-call `strictBindings` param (true → "strict", false → "warn")
 *   2. `MCP_BINDING_VALIDATION` env var ("strict" | "warn" | "off")
 *   3. Default "strict"
 */
export declare function resolveValidationMode(strictBindings: boolean | undefined): ValidationMode;
/**
 * Get the model field inventory for a project. Returns `null` when:
 *   - validation is disabled globally (MCP_BINDING_VALIDATION=off)
 *   - the sibling `.SemanticModel` folder can't be located
 *   - the model files can't be parsed
 *
 * Callers must treat `null` as "skip validation silently", never as
 * "model is empty".
 */
export declare function getInventoryForProject(project: PbirProject, mode: ValidationMode): ModelFieldInventory | null;
/**
 * Validate a single field spec against the model inventory.
 * Returns `null` when the field is valid, or a `BindingValidationError`
 * describing the problem.
 */
export declare function validateFieldSpec(spec: FieldSpecInput, inventory: ModelFieldInventory): BindingValidationError | null;
/**
 * Validate a full `bindings` array. Returns a (possibly empty) array of
 * errors. Pure — does not throw, does not mutate.
 */
export declare function validateBindings(bindings: Array<{
    bucket: string;
    fields: FieldSpecInput[];
}> | undefined, inventory: ModelFieldInventory | null): BindingValidationError[];
/**
 * Turn an error list into a single human-readable string. Used as the
 * payload of the thrown/returned error in strict mode and as the content of
 * `bindingWarnings` in warn mode.
 */
export declare function formatBindingErrors(errors: BindingValidationError[]): string;
export interface ValidationOutcome {
    /** Was the call allowed to proceed? */
    proceed: boolean;
    /** Raw errors — empty in `off` mode or when everything validated. */
    errors: BindingValidationError[];
    /** Pre-formatted message for error responses / warnings. */
    message: string;
    /** Resolved mode (helpful for telemetry and skill-doc truthfulness). */
    mode: ValidationMode;
}
/**
 * Run validation with the three-mode policy and return a structured outcome.
 * Tool handlers should branch on `outcome.proceed`:
 *   - strict + errors → return error response, skip the write
 *   - warn + errors   → proceed with the write, include `bindingWarnings`
 *   - no errors       → proceed silently
 */
export declare function runBindingValidation(project: PbirProject, bindings: Array<{
    bucket: string;
    fields: FieldSpecInput[];
}> | undefined, strictBindings: boolean | undefined): ValidationOutcome;
