// Custom-visual availability validation.
//
// Power BI custom visuals (AppSource, organizational, or private .pbiviz
// packages) must be registered in the report's report.json under
// `publicCustomVisuals` before Desktop can render them. A visual.json can
// reference a visualType that isn't registered — the PBIR JSON is perfectly
// valid, the file loads, but Desktop shows "Hubo un problema con uno o más
// campos"-style breakage because there's nothing installed to draw with.
//
// This mirrors bindingValidation.ts's strict/warn/off pattern so agents get
// the same UX they already know from binding and layout checks.

import type { PbirProject } from "../pbir.js";

export type CustomVisualValidationMode = "strict" | "warn" | "off";

/**
 * Reliable signature for a Power BI custom-visual identifier: a
 * human-readable prefix immediately followed by a 32-character hex GUID with
 * no separator (e.g. "htmlContent443BE3AD55E043BF878BED274D3A6855",
 * "PBI_CV_...<32 hex>"). This is the actual naming convention pbiviz/AppSource
 * packaging uses, and it's a safer test than "not a key in VISUAL_BUCKETS" —
 * VISUAL_BUCKETS is a curated, hand-maintained list of natives and may not be
 * exhaustive of every native type Desktop ships, so treating "unknown to
 * VISUAL_BUCKETS" as "custom" would risk false-positive blocks on legitimate
 * native types the map simply hasn't caught up with yet.
 */
const CUSTOM_VISUAL_GUID_SUFFIX = /[0-9A-Fa-f]{32}$/;

export function isCustomVisualType(visualType: string): boolean {
  return visualType.length > 32 && CUSTOM_VISUAL_GUID_SUFFIX.test(visualType);
}

/** The custom visuals actually registered (installed) in the connected report. */
export function getRegisteredCustomVisuals(project: PbirProject): string[] {
  try {
    return project.getReport().publicCustomVisuals ?? [];
  } catch {
    return [];
  }
}

export function resolveCustomVisualValidationMode(
  strictCustomVisual: boolean | undefined
): CustomVisualValidationMode {
  if (strictCustomVisual === true) return "strict";
  if (strictCustomVisual === false) return "warn";
  const envVal = (process.env.MCP_CUSTOM_VISUAL_VALIDATION || "").toLowerCase().trim();
  if (envVal === "off" || envVal === "false" || envVal === "0") return "off";
  if (envVal === "warn" || envVal === "warning") return "warn";
  if (envVal === "strict" || envVal === "on" || envVal === "1") return "strict";
  return "strict";
}

export interface CustomVisualCheckOutcome {
  proceed: boolean;
  mode: CustomVisualValidationMode;
  /** visualTypes that look custom but aren't registered in publicCustomVisuals. */
  unregistered: string[];
  /** What IS registered, for the error hint. */
  registered: string[];
}

/**
 * Check a batch of visualTypes (e.g. every spec in an add_visual call, or the
 * single target type in change_visual_type) against the report's registered
 * custom visuals. Native types (anything not matching the GUID-suffix
 * convention) always pass — this only ever gates genuine custom visuals.
 */
export function checkCustomVisualsAvailable(
  project: PbirProject,
  visualTypes: string[],
  strictCustomVisual: boolean | undefined
): CustomVisualCheckOutcome {
  const mode = resolveCustomVisualValidationMode(strictCustomVisual);
  const registered = getRegisteredCustomVisuals(project);
  if (mode === "off") {
    return { proceed: true, mode, unregistered: [], registered };
  }
  const registeredSet = new Set(registered);
  const unregistered = [
    ...new Set(
      visualTypes.filter((vt) => isCustomVisualType(vt) && !registeredSet.has(vt))
    ),
  ];
  if (unregistered.length === 0) {
    return { proceed: true, mode, unregistered: [], registered };
  }
  return { proceed: mode !== "strict", mode, unregistered, registered };
}
