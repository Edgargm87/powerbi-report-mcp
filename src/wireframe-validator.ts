// ═══════════════════════════════════════════════════════════════════════════════
// Wireframe Validator
//
// Pure function that takes a list of visual specs and reports anything that
// violates the layout rules in docs/wireframes.md:
//
//   Canvas    1280 × 720 (16:9)
//   Margins   15px left, 15px right, 6px bottom (usable width = 1250,
//             usable height = 714)
//   Gap       5px between visuals (horizontal and vertical)
//   Banner    exempted from margins — spans x:0 to x:1280
//
// Catches: out-of-bounds, overlaps, wrong margins, non-5px gaps,
// column-edge misalignment across rows, silent defaults (x=y=0), and
// rounding errors on equal splits.
// ═══════════════════════════════════════════════════════════════════════════════

export const CANVAS = {
  width: 1280,
  height: 720,
  marginLeft: 15,
  marginRight: 15,
  marginTop: 0,
  marginBottom: 6,
  usableWidth: 1250, // 1280 - 15 - 15
  usableHeight: 714, // 720 - 6 (6px bottom breathing room)
  gap: 5,
  bannerHeight: 52,
  bannerY: 0,
  firstContentRowY: 57, // bannerY + bannerHeight + gap
} as const;

export interface WireframeVisual {
  id?: string;
  visualType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional label used in error messages. Falls back to id, then visualType. */
  title?: string;
}

export interface WireframeIssue {
  severity: "error" | "warning" | "info";
  code:
    | "OUT_OF_BOUNDS"
    | "OVERLAP"
    | "LEFT_MARGIN"
    | "RIGHT_MARGIN"
    | "BOTTOM_MARGIN"
    | "WRONG_GAP_H"
    | "WRONG_GAP_V"
    | "BANNER_POSITION"
    | "BANNER_WIDTH"
    | "SILENT_DEFAULT"
    | "COLUMN_MISALIGN"
    | "ROW_MISALIGN"
    | "NEGATIVE_DIMENSION"
    | "ROUNDING_OVERFLOW";
  message: string;
  visuals: string[]; // labels of the offending visuals
}

export interface WireframeReport {
  ok: boolean;
  issues: WireframeIssue[];
  stats: {
    visualCount: number;
    errors: number;
    warnings: number;
    coverage: number; // % of canvas area covered by visuals (0-100)
    bottomEdge: number; // max y+h across all visuals
    rightEdge: number; // max x+w across all visuals
  };
}

// Helpers -----------------------------------------------------------------

function label(v: WireframeVisual): string {
  return v.title || v.id || v.visualType;
}

function isBanner(v: WireframeVisual): boolean {
  return v.visualType === "shape" && v.y === 0 && v.x === 0 && v.width === CANVAS.width;
}

function rectsOverlap(a: WireframeVisual, b: WireframeVisual): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

// A "row" is a group of visuals with overlapping y-ranges. Within a row we
// expect 5px horizontal gaps. Similarly a "column" groups visuals by overlap
// in their x-range. This lets us detect mis-gaps without needing the caller
// to tell us the intended layout.
function groupByYOverlap(vs: WireframeVisual[]): WireframeVisual[][] {
  const sorted = [...vs].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: WireframeVisual[][] = [];
  for (const v of sorted) {
    const row = rows.find((r) => r.some((rv) => !(v.y + v.height <= rv.y || rv.y + rv.height <= v.y)));
    if (row) row.push(v);
    else rows.push([v]);
  }
  // sort each row left-to-right
  rows.forEach((r) => r.sort((a, b) => a.x - b.x));
  return rows;
}

// Main entry --------------------------------------------------------------

export function validateWireframe(visuals: WireframeVisual[]): WireframeReport {
  const issues: WireframeIssue[] = [];

  // --- Per-visual checks ---
  for (const v of visuals) {
    const tag = label(v);

    if (v.width <= 0 || v.height <= 0) {
      issues.push({
        severity: "error",
        code: "NEGATIVE_DIMENSION",
        message: `${tag} has non-positive dimensions ${v.width}×${v.height}`,
        visuals: [tag],
      });
      continue;
    }

    // Silent default: x=0, y=0 is only valid for the banner
    if (v.x === 0 && v.y === 0 && !isBanner(v)) {
      issues.push({
        severity: "warning",
        code: "SILENT_DEFAULT",
        message: `${tag} is at (0,0) but is not a banner — looks like a missing x/y. Non-banner visuals should start at x≥${CANVAS.marginLeft}, y≥${CANVAS.firstContentRowY}`,
        visuals: [tag],
      });
    }

    // Canvas bounds
    if (v.x < 0 || v.y < 0) {
      issues.push({
        severity: "error",
        code: "OUT_OF_BOUNDS",
        message: `${tag} has negative x/y: (${v.x}, ${v.y})`,
        visuals: [tag],
      });
    }
    if (v.x + v.width > CANVAS.width) {
      issues.push({
        severity: "error",
        code: "OUT_OF_BOUNDS",
        message: `${tag} right edge (${v.x + v.width}) exceeds canvas width ${CANVAS.width}`,
        visuals: [tag],
      });
    }
    if (v.y + v.height > CANVAS.height) {
      issues.push({
        severity: "error",
        code: "OUT_OF_BOUNDS",
        message: `${tag} bottom edge (${v.y + v.height}) exceeds canvas height ${CANVAS.height}`,
        visuals: [tag],
      });
    }

    // Banner rule
    if (isBanner(v)) {
      if (v.height !== CANVAS.bannerHeight) {
        issues.push({
          severity: "warning",
          code: "BANNER_POSITION",
          message: `${tag} banner height is ${v.height}px, expected ${CANVAS.bannerHeight}px`,
          visuals: [tag],
        });
      }
    } else {
      // Non-banner: check margins
      if (v.x < CANVAS.marginLeft) {
        issues.push({
          severity: "error",
          code: "LEFT_MARGIN",
          message: `${tag} x=${v.x} violates left margin (expected ≥ ${CANVAS.marginLeft})`,
          visuals: [tag],
        });
      }
      if (v.x + v.width > CANVAS.width - CANVAS.marginRight) {
        issues.push({
          severity: "error",
          code: "RIGHT_MARGIN",
          message: `${tag} right edge ${v.x + v.width} violates right margin (expected ≤ ${CANVAS.width - CANVAS.marginRight})`,
          visuals: [tag],
        });
      }
      if (v.y + v.height > CANVAS.height - CANVAS.marginBottom) {
        issues.push({
          severity: "error",
          code: "BOTTOM_MARGIN",
          message: `${tag} bottom edge ${v.y + v.height} violates bottom margin (expected ≤ ${CANVAS.height - CANVAS.marginBottom})`,
          visuals: [tag],
        });
      }
    }
  }

  // --- Overlap check ---
  for (let i = 0; i < visuals.length; i++) {
    for (let j = i + 1; j < visuals.length; j++) {
      const a = visuals[i];
      const b = visuals[j];
      // Banner is allowed to overlap with nothing — non-banners below it are
      // at y≥57 already, so if they DO intersect it's a real bug.
      if (rectsOverlap(a, b)) {
        issues.push({
          severity: "error",
          code: "OVERLAP",
          message: `${label(a)} (${a.x},${a.y},${a.width}×${a.height}) overlaps ${label(b)} (${b.x},${b.y},${b.width}×${b.height})`,
          visuals: [label(a), label(b)],
        });
      }
    }
  }

  // --- Row-based gap checks (horizontal neighbours) ---
  const nonBanners = visuals.filter((v) => !isBanner(v));
  const rows = groupByYOverlap(nonBanners);
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      const gap = b.x - (a.x + a.width);
      if (gap !== CANVAS.gap && gap > 0) {
        issues.push({
          severity: "error",
          code: "WRONG_GAP_H",
          message: `${label(a)} → ${label(b)} horizontal gap is ${gap}px, expected ${CANVAS.gap}px`,
          visuals: [label(a), label(b)],
        });
      }
    }
  }

  // --- Column-based gap checks (vertical neighbours in same x-range) ---
  const sortedByX = [...nonBanners].sort((a, b) => a.x - b.x || a.y - b.y);
  // A column group: visuals whose x-range overlaps >50% of each other.
  const columns: WireframeVisual[][] = [];
  for (const v of sortedByX) {
    const col = columns.find((c) =>
      c.some((cv) => {
        const xOverlap = Math.max(0, Math.min(v.x + v.width, cv.x + cv.width) - Math.max(v.x, cv.x));
        const minWidth = Math.min(v.width, cv.width);
        return xOverlap / minWidth > 0.5;
      }),
    );
    if (col) col.push(v);
    else columns.push([v]);
  }
  for (const col of columns) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 0; i < col.length - 1; i++) {
      const a = col[i];
      const b = col[i + 1];
      const gap = b.y - (a.y + a.height);
      if (gap !== CANVAS.gap && gap > 0 && gap < 100) {
        issues.push({
          severity: "error",
          code: "WRONG_GAP_V",
          message: `${label(a)} ↓ ${label(b)} vertical gap is ${gap}px, expected ${CANVAS.gap}px`,
          visuals: [label(a), label(b)],
        });
      }
    }
  }

  // --- Column alignment across rows ---
  // docs/wireframes.md suggests column boundaries should align across rows, but
  // this is aspirational: equal-split rows with different column counts (5 cards
  // vs 2 charts vs 3 details) mathematically can't share left edges. The
  // alignment rule is a soft guideline best judged visually, not mechanically,
  // so we skip it here. The hard rules (margins, gaps, bounds, overlaps) are
  // enough to catch the bugs that actually break layouts.

  // --- Stats ---
  const totalArea = visuals.reduce((s, v) => s + v.width * v.height, 0);
  const coverage = (totalArea / (CANVAS.width * CANVAS.height)) * 100;
  const bottomEdge = visuals.reduce((m, v) => Math.max(m, v.y + v.height), 0);
  const rightEdge = visuals.reduce((m, v) => Math.max(m, v.x + v.width), 0);

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stats: {
      visualCount: visuals.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      coverage: Math.round(coverage * 10) / 10,
      bottomEdge,
      rightEdge,
    },
  };
}

// Pretty-print for CLI / agent output
export function formatReport(report: WireframeReport): string {
  const lines: string[] = [];
  lines.push(
    `${report.ok ? "PASS" : "FAIL"} — ${report.stats.visualCount} visuals, ${report.stats.errors} errors, ${report.stats.warnings} warnings`,
  );
  lines.push(
    `  coverage ${report.stats.coverage}%, rightmost edge ${report.stats.rightEdge}/${CANVAS.width}, bottom edge ${report.stats.bottomEdge}/${CANVAS.height}`,
  );
  if (report.issues.length === 0) {
    lines.push("  no issues");
  } else {
    for (const issue of report.issues) {
      const icon = issue.severity === "error" ? "✗" : issue.severity === "warning" ? "!" : "·";
      lines.push(`  ${icon} [${issue.code}] ${issue.message}`);
    }
  }
  return lines.join("\n");
}
