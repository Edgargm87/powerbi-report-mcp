import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// --- ID generation ---
export function generateId(): string {
  return crypto.randomBytes(10).toString("hex"); // 20 hex chars like PBI uses
}

// --- Types ---
export interface Position {
  x: number;
  y: number;
  z: number;
  height: number;
  width: number;
  tabOrder: number;
}

export interface FieldRef {
  Column?: {
    Expression: { SourceRef: { Entity: string } };
    Property: string;
  };
  Aggregation?: {
    Expression: {
      Column: {
        Expression: { SourceRef: { Entity: string } };
        Property: string;
      };
    };
    Function: number;
  };
  Measure?: {
    Expression: { SourceRef: { Entity: string } };
    Property: string;
  };
}

export interface Projection {
  field: FieldRef;
  queryRef: string;
  nativeQueryRef: string;
  active?: boolean;
}

export interface QueryState {
  [bucket: string]: {
    projections: Projection[];
  };
}

export interface SortItem {
  field: FieldRef;
  direction: "Ascending" | "Descending";
}

export interface FilterItem {
  name: string;
  field: FieldRef;
  type: "Categorical" | "Advanced" | "TopN" | "RelativeDate";
  filter?: Record<string, unknown>;
  /** Marks the filter as a drillthrough "all" filter. */
  isAllFilter?: boolean;
}

export interface VisualDefinition {
  $schema: string;
  name: string;
  position: Position;
  visual: {
    visualType: string;
    query?: {
      queryState: QueryState;
      sortDefinition?: {
        sort: SortItem[];
        isDefaultSort?: boolean;
      };
    };
    objects?: Record<string, unknown>;
    visualContainerObjects?: Record<string, unknown>;
    drillFilterOtherVisuals?: boolean;
  };
  filterConfig?: {
    filters: FilterItem[];
  };
  /** Set to "InsertVisualButton" for actionButton and pageNavigator visuals */
  howCreated?: string;
}

export interface PageDefinition {
  $schema: string;
  name: string;
  displayName: string;
  displayOption: string;
  height: number;
  width: number;
  /** "HiddenInViewMode" = hidden from page nav. Omit for visible (default). */
  visibility?: string;
  /** Page type — "Tooltip" for tooltip pages. Omit for standard pages. */
  type?: string;
  /** Page-level config — e.g. { visibility: "HiddenInViewMode" } for tooltip pages. */
  config?: Record<string, unknown>;
  filterConfig?: {
    filters: FilterItem[];
  };
  /** Page-level objects — background, wallpaper, outspacePane, filterCard, etc. */
  objects?: Record<string, unknown>;
  /** Cross-filter/cross-highlight interactions between visuals on this page. */
  visualInteractions?: Array<{ source: string; target: string; type: string }>;
}

export interface BookmarkDefinition {
  $schema: string;
  name: string;
  displayName: string;
  explorationState: Record<string, unknown>;
}

export interface BookmarksMetadata {
  $schema: string;
  bookmarkOrder: string[];
}

export interface PagesMetadata {
  $schema: string;
  pageOrder: string[];
  activePageName: string;
}

export interface ReportDefinition {
  $schema: string;
  themeCollection?: Record<string, unknown>;
  objects?: Record<string, unknown>;
  resourcePackages?: unknown[];
  settings?: Record<string, unknown>;
}

// --- Aggregation function mapping ---
export const AggregationFunction: Record<string, number> = {
  Sum: 0,
  Avg: 1,
  Count: 2,
  Min: 3,
  Max: 4,
  CountNonNull: 5,
  Median: 6,
  StandardDeviation: 7,
  Variance: 8,
};

// --- Visual type buckets mapping ---
// Maps visualType to their expected data role buckets
export const VISUAL_BUCKETS: Record<string, string[]> = {
  // --- Bar / Column charts ---
  barChart: ["Category", "Y", "Series", "Gradient"],
  stackedBarChart: ["Category", "Y", "Series"],            // explicit stacked bar (alias in PBI)
  clusteredBarChart: ["Category", "Y", "Series", "Gradient"],
  hundredPercentStackedBarChart: ["Category", "Y", "Series"],
  columnChart: ["Category", "Y", "Series", "Gradient"],
  clusteredColumnChart: ["Category", "Y", "Series", "Gradient"],
  hundredPercentStackedColumnChart: ["Category", "Y", "Series"],
  // --- Line / Area charts ---
  lineChart: ["Category", "Y", "Y2", "Series"],
  areaChart: ["Category", "Y", "Y2", "Series"],
  stackedAreaChart: ["Category", "Y", "Series"],
  hundredPercentStackedAreaChart: ["Category", "Y", "Series"],
  // --- Combo charts — use Y / Y2 (verified against fabric schema v2.7.0
  // and the data-goblin reference scaffolds). Column series = Y,
  // line series = Y2. Do NOT use ColumnY / LineY — those are not
  // recognised by Desktop's PBIR reader.
  lineClusteredColumnComboChart: ["Category", "Y", "Y2", "Series"],
  lineStackedColumnComboChart: ["Category", "Y", "Y2", "Series"],
  // --- Other charts ---
  ribbonChart: ["Category", "Y", "Series"],
  waterfallChart: ["Category", "Y", "Breakdown"],
  // --- Scatter — dimension bucket is "Category" (verified against
  // fabric schema v2.7.0 and data-goblin reference). Earlier revisions
  // used "Details" — that was wrong and caused bindings to be ignored
  // by Desktop.
  scatterChart: ["Category", "X", "Y", "Size", "Series"],
  pieChart: ["Category", "Y", "Series"],
  donutChart: ["Category", "Y", "Series"],
  funnelChart: ["Category", "Y"],                          // correct PBI type name
  funnel: ["Category", "Y"],                               // legacy alias kept for compatibility
  treemap: ["Group", "Values", "Details"],
  ribbonChart2: ["Category", "Y", "Series"],               // future-proofing alias
  // --- Maps ---
  map: ["Category", "Size", "Series"],
  filledMap: ["Location", "Legend", "Values"],
  azureMap: ["Category", "Size"],                          // Azure Maps visual
  // --- Tables / Matrix ---
  pivotTable: ["Rows", "Columns", "Values"],
  tableEx: ["Values"],
  // --- Cards ---
  card: ["Values"],
  cardVisual: ["Data", "Rows"],
  cardNew: ["Fields"],                                     // new card visual (Fields bucket)
  multiRowCard: ["Values"],
  // --- KPI / Gauge ---
  kpi: ["Indicator", "TrendLine", "Goal"],
  gauge: ["Y", "MinValue", "MaxValue", "TargetValue"],
  // --- AI / Advanced ---
  decompositionTreeVisual: ["Analyze", "ExplainBy"],
  // --- Slicers ---
  slicer: ["Values"],
  listSlicer: ["Values"],
  textSlicer: ["Values"],
  advancedSlicerVisual: ["Rows"],  // advancedSlicerVisual uses "Rows", not "Values" (verified against fabric 2.7.0 + data-goblin reference)
  // --- No data binding ---
  textbox: [],
  basicShape: [],
  shape: [],
  image: [],
  actionButton: [],    // container-only, howCreated: "InsertVisualButton"
  pageNavigator: [],   // container-only, howCreated: "InsertVisualButton"
};

// --- PBIR path helpers ---
export class PbirProject {
  constructor(public reportPath: string) {}

  /**
   * In-memory visual.json cache keyed by absolute path.
   * Avoids repeated disk reads when list_visuals / bulk ops touch the same
   * visual multiple times. Invalidated on save, delete, and mtime change.
   */
  private visualCache = new Map<string, { mtimeMs: number; data: VisualDefinition }>();

  private invalidateVisualCacheEntry(filePath: string): void {
    this.visualCache.delete(filePath);
  }

  public invalidateVisualCache(): void {
    this.visualCache.clear();
  }

  get definitionPath(): string {
    return path.join(this.reportPath, "definition");
  }

  get reportJsonPath(): string {
    return path.join(this.definitionPath, "report.json");
  }

  get pagesPath(): string {
    return path.join(this.definitionPath, "pages");
  }

  get pagesJsonPath(): string {
    return path.join(this.pagesPath, "pages.json");
  }

  get versionJsonPath(): string {
    return path.join(this.definitionPath, "version.json");
  }

  pagePath(pageId: string): string {
    return path.join(this.pagesPath, pageId);
  }

  pageJsonPath(pageId: string): string {
    return path.join(this.pagePath(pageId), "page.json");
  }

  visualsPath(pageId: string): string {
    return path.join(this.pagePath(pageId), "visuals");
  }

  visualPath(pageId: string, visualId: string): string {
    return path.join(this.visualsPath(pageId), visualId);
  }

  visualJsonPath(pageId: string, visualId: string): string {
    return path.join(this.visualPath(pageId, visualId), "visual.json");
  }

  // --- Read operations ---

  readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  writeJson(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  getReport(): ReportDefinition {
    return this.readJson(this.reportJsonPath);
  }

  getPagesMetadata(): PagesMetadata {
    return this.readJson(this.pagesJsonPath);
  }

  getPage(pageId: string): PageDefinition {
    return this.readJson(this.pageJsonPath(pageId));
  }

  getVisual(pageId: string, visualId: string): VisualDefinition {
    const filePath = this.visualJsonPath(pageId, visualId);
    // mtime-keyed cache: stat is ~20× cheaper than readFileSync+JSON.parse.
    try {
      const mtimeMs = fs.statSync(filePath).mtimeMs;
      const hit = this.visualCache.get(filePath);
      if (hit && hit.mtimeMs === mtimeMs) return hit.data;
      const data = this.readJson<VisualDefinition>(filePath);
      this.visualCache.set(filePath, { mtimeMs, data });
      return data;
    } catch {
      // Any stat error (missing file, permission) — fall back to a plain read
      // so the caller still sees the original ENOENT/parse error.
      return this.readJson<VisualDefinition>(filePath);
    }
  }

  listPageIds(): string[] {
    return this.getPagesMetadata().pageOrder;
  }

  listVisualIds(pageId: string): string[] {
    const visualsDir = this.visualsPath(pageId);
    if (!fs.existsSync(visualsDir)) return [];
    return fs
      .readdirSync(visualsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  // --- Write operations ---

  savePagesMetadata(meta: PagesMetadata): void {
    this.writeJson(this.pagesJsonPath, meta);
  }

  savePage(pageId: string, page: PageDefinition): void {
    this.writeJson(this.pageJsonPath(pageId), page);
  }

  saveVisual(
    pageId: string,
    visualId: string,
    visual: VisualDefinition
  ): void {
    const filePath = this.visualJsonPath(pageId, visualId);
    this.writeJson(filePath, visual);
    // Refresh cache entry with the new mtime so the next getVisual() is a hit.
    try {
      this.visualCache.set(filePath, { mtimeMs: fs.statSync(filePath).mtimeMs, data: visual });
    } catch {
      this.invalidateVisualCacheEntry(filePath);
    }
  }

  saveReport(report: ReportDefinition): void {
    this.writeJson(this.reportJsonPath, report);
  }

  deletePage(pageId: string): void {
    fs.rmSync(this.pagePath(pageId), { recursive: true, force: true });
    // Page delete takes all its visuals with it — drop any cached entries
    // under that page's visuals directory.
    const prefix = this.visualsPath(pageId);
    for (const key of this.visualCache.keys()) {
      if (key.startsWith(prefix)) this.visualCache.delete(key);
    }
  }

  deleteVisual(pageId: string, visualId: string): void {
    const filePath = this.visualJsonPath(pageId, visualId);
    fs.rmSync(this.visualPath(pageId, visualId), {
      recursive: true,
      force: true,
    });
    this.invalidateVisualCacheEntry(filePath);
  }

  // --- Bookmark helpers ---

  get bookmarksPath(): string {
    return path.join(this.definitionPath, "bookmarks");
  }

  get bookmarksJsonPath(): string {
    return path.join(this.bookmarksPath, "bookmarks.json");
  }

  bookmarkPath(bookmarkId: string): string {
    return path.join(this.bookmarksPath, bookmarkId);
  }

  bookmarkJsonPath(bookmarkId: string): string {
    return path.join(this.bookmarkPath(bookmarkId), "bookmark.json");
  }

  getBookmarksMetadata(): BookmarksMetadata {
    if (!fs.existsSync(this.bookmarksJsonPath)) {
      return {
        $schema:
          "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/bookmarks/2.0.0/schema.json",
        bookmarkOrder: [],
      };
    }
    return this.readJson(this.bookmarksJsonPath);
  }

  saveBookmarksMetadata(meta: BookmarksMetadata): void {
    this.writeJson(this.bookmarksJsonPath, meta);
  }

  getBookmark(bookmarkId: string): BookmarkDefinition {
    return this.readJson(this.bookmarkJsonPath(bookmarkId));
  }

  saveBookmark(bookmarkId: string, bookmark: BookmarkDefinition): void {
    this.writeJson(this.bookmarkJsonPath(bookmarkId), bookmark);
  }

  deleteBookmark(bookmarkId: string): void {
    fs.rmSync(this.bookmarkPath(bookmarkId), { recursive: true, force: true });
  }

  // --- StaticResources / theme helpers ---

  get registeredResourcesPath(): string {
    return path.join(this.reportPath, "StaticResources", "RegisteredResources");
  }

  /**
   * Resolve a registered-resource filename to an absolute path, with strict
   * path-traversal protection. Accepts only a bare filename matching
   * `<alnum/_-/space/dot>+.<json|svg|png|jpg|jpeg>` and verifies the joined
   * path stays inside registeredResourcesPath. Throws on any suspicious input.
   */
  private resolveRegisteredResourcePath(filename: string): string {
    // Reject path separators, parent-directory traversal, and absolute paths
    // outright. path.basename() is the final belt; the regex is the braces.
    if (!/^[\w\-. ()]+\.(json|svg|png|jpg|jpeg)$/i.test(filename)) {
      throw new Error(
        `Invalid resource filename: ${filename} (allowed: alphanumerics, space, ._-() with .json/.svg/.png/.jpg extension)`
      );
    }
    const safe = path.basename(filename);
    const dir = this.registeredResourcesPath;
    const resolved = path.resolve(path.join(dir, safe));
    const dirResolved = path.resolve(dir);
    // Ensure the resolved path is strictly inside the resources dir. Guards
    // against Unicode / symlink trickery even though basename+regex already
    // cover the common case.
    if (!resolved.startsWith(dirResolved + path.sep) && resolved !== dirResolved) {
      throw new Error(`Resource path escape detected: ${filename}`);
    }
    return resolved;
  }

  saveRegisteredResource(filename: string, data: unknown): void {
    const target = this.resolveRegisteredResourcePath(filename);
    const dir = this.registeredResourcesPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, JSON.stringify(data, null, 2), "utf-8");
  }

  readRegisteredResource(filename: string): unknown | null {
    const filePath = this.resolveRegisteredResourcePath(filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  listRegisteredResources(): string[] {
    const dir = this.registeredResourcesPath;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
  }

  deleteRegisteredResource(filename: string): void {
    const filePath = this.resolveRegisteredResourcePath(filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  // --- Extension measures (reportExtensions.json) ---

  get reportExtensionsPath(): string {
    return path.join(this.definitionPath, "reportExtensions.json");
  }

  getReportExtensions(): any | null {
    if (!fs.existsSync(this.reportExtensionsPath)) return null;
    return this.readJson(this.reportExtensionsPath);
  }

  saveReportExtensions(extensions: any): void {
    // CRITICAL: delete file if no entities/measures to avoid PBI Desktop crash
    if (!extensions?.entities?.length) {
      if (fs.existsSync(this.reportExtensionsPath)) {
        fs.unlinkSync(this.reportExtensionsPath);
      }
      return;
    }
    this.writeJson(this.reportExtensionsPath, extensions);
  }
}

// --- Field reference builders ---

export function columnRef(entity: string, property: string): FieldRef {
  return {
    Column: {
      Expression: { SourceRef: { Entity: entity } },
      Property: property,
    },
  };
}

export function aggregationRef(
  entity: string,
  property: string,
  func: number = 0
): FieldRef {
  return {
    Aggregation: {
      Expression: {
        Column: {
          Expression: { SourceRef: { Entity: entity } },
          Property: property,
        },
      },
      Function: func,
    },
  };
}

export function measureRef(entity: string, property: string): FieldRef {
  return {
    Measure: {
      Expression: { SourceRef: { Entity: entity } },
      Property: property,
    },
  };
}

// Build a queryRef string from a field
export function buildQueryRef(field: FieldRef): string {
  if (field.Column) {
    return `${field.Column.Expression.SourceRef.Entity}.${field.Column.Property}`;
  }
  if (field.Aggregation) {
    const funcName =
      Object.entries(AggregationFunction).find(
        ([, v]) => v === field.Aggregation!.Function
      )?.[0] || "Sum";
    const col = field.Aggregation.Expression.Column;
    return `${funcName}(${col.Expression.SourceRef.Entity}.${col.Property})`;
  }
  if (field.Measure) {
    return `${field.Measure.Expression.SourceRef.Entity}.${field.Measure.Property}`;
  }
  return "";
}

// Build a nativeQueryRef (display name) from a field
export function buildNativeQueryRef(field: FieldRef): string {
  if (field.Column) {
    return field.Column.Property;
  }
  if (field.Aggregation) {
    const funcName =
      Object.entries(AggregationFunction).find(
        ([, v]) => v === field.Aggregation!.Function
      )?.[0] || "Sum";
    return `${funcName} of ${field.Aggregation.Expression.Column.Property}`;
  }
  if (field.Measure) {
    return field.Measure.Property;
  }
  return "";
}

// Build auto-filters for a visual based on its field bindings
export function buildAutoFilters(queryState: QueryState): FilterItem[] {
  const filters: FilterItem[] = [];
  for (const bucket of Object.values(queryState)) {
    for (const proj of bucket.projections) {
      const filterType = proj.field.Aggregation ? "Advanced" : "Categorical";
      filters.push({
        name: generateId(),
        field: JSON.parse(JSON.stringify(proj.field)),
        type: filterType,
      });
    }
  }
  return filters;
}
