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
/** Why validation skipped — surfaced to callers via `ValidationOutcome`. */
export type SkippedReason = "mode_off" | "model_not_found" | "model_parse_error" | "empty_bindings";
/**
 * Result of trying to load the field inventory — either the inventory, or
 * the reason we couldn't get one. Never throws.
 */
interface InventoryLookup {
    inventory: ModelFieldInventory | null;
    skipReason: SkippedReason | null;
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
export declare function getInventoryForProject(project: PbirProject, mode: ValidationMode): InventoryLookup;
/**
 * Test-seam: clear the once-per-path warning memory. Used by the binding
 * validator test suite so repeated runs see the same logs.
 */
export declare function _resetBindingValidationWarnings(): void;
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
 * Compact stable error code for binding-validation responses. The structured
 * `errors[]` array carries `reason`, `entity`, `property`, and `suggestions`
 * — the LLM looks the codes up in skills/errors.md once per session, so we
 * don't ship the prose explanation per call.
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
    /**
     * Set when validation did not actually run against a model. Callers in
     * warn mode can surface this to distinguish "validated and clean" from
     * "couldn't validate, hope for the best". null = validation ran.
     */
    skipReason: SkippedReason | null;
}
/**
 * Returns true when the skip reason is worth surfacing to the agent. Trivial
 * skips (`mode_off`, `empty_bindings`) are noise — they either reflect the
 * caller's own choice or a no-op input. Non-trivial skips (`model_not_found`,
 * `model_parse_error`) signal that an expected safety net didn't engage, and
 * the agent should know so it can be extra careful with its bindings.
 */
export declare function isNoteworthySkip(reason: SkippedReason | null): boolean;
/**
 * Attach binding-validation metadata (`bindingWarnings`, `bindingWarningMessage`,
 * and the conditional `bindingValidation.skipped` notice) to a response body.
 *
 * Three tool handlers — `pbir_add_visual`, `pbir_update_visual_bindings`, `pbir_bulk_bind` —
 * all need to surface the same information in the same shape. Before this
 * helper existed, each inlined the same 10-line block, which meant every
 * tweak (e.g. wording of the "typo loads silently" note) had to be made three
 * times. Mutates and returns `response` for chaining convenience.
 */
export declare function attachBindingValidationMetadata(response: Record<string, unknown>, validation: ValidationOutcome): Record<string, unknown>;
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
export declare function runBindingValidation(project: PbirProject, bindings: Array<{
    bucket: string;
    fields: FieldSpecInput[];
}> | undefined, strictBindings: boolean | undefined): ValidationOutcome;
export {};
