import type { VisualDefinition } from "../pbir.js";
import type { FieldSpecInput } from "./createVisual.js";
export interface BucketBindingInput {
    bucket: string;
    fields: FieldSpecInput[];
}
export interface ApplyBindingsOptions {
    autoFilters: boolean;
}
/**
 * Mutates `visual` in place with the new bindings and returns it for chaining.
 * Does NOT persist — caller is responsible for saveVisual.
 */
export declare function applyBindingsToVisual(visual: VisualDefinition, bindings: BucketBindingInput[], opts: ApplyBindingsOptions): VisualDefinition;
