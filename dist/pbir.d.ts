export declare function generateId(): string;
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
        Expression: {
            SourceRef: {
                Entity: string;
            };
        };
        Property: string;
    };
    Aggregation?: {
        Expression: {
            Column: {
                Expression: {
                    SourceRef: {
                        Entity: string;
                    };
                };
                Property: string;
            };
        };
        Function: number;
    };
    Measure?: {
        Expression: {
            SourceRef: {
                Entity: string;
            };
        };
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
    visualInteractions?: Array<{
        source: string;
        target: string;
        type: string;
    }>;
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
export declare const AggregationFunction: Record<string, number>;
export declare const VISUAL_BUCKETS: Record<string, string[]>;
export declare class PbirProject {
    reportPath: string;
    constructor(reportPath: string);
    get definitionPath(): string;
    get reportJsonPath(): string;
    get pagesPath(): string;
    get pagesJsonPath(): string;
    get versionJsonPath(): string;
    pagePath(pageId: string): string;
    pageJsonPath(pageId: string): string;
    visualsPath(pageId: string): string;
    visualPath(pageId: string, visualId: string): string;
    visualJsonPath(pageId: string, visualId: string): string;
    readJson<T>(filePath: string): T;
    writeJson(filePath: string, data: unknown): void;
    getReport(): ReportDefinition;
    getPagesMetadata(): PagesMetadata;
    getPage(pageId: string): PageDefinition;
    getVisual(pageId: string, visualId: string): VisualDefinition;
    listPageIds(): string[];
    listVisualIds(pageId: string): string[];
    savePagesMetadata(meta: PagesMetadata): void;
    savePage(pageId: string, page: PageDefinition): void;
    saveVisual(pageId: string, visualId: string, visual: VisualDefinition): void;
    saveReport(report: ReportDefinition): void;
    deletePage(pageId: string): void;
    deleteVisual(pageId: string, visualId: string): void;
    get bookmarksPath(): string;
    get bookmarksJsonPath(): string;
    bookmarkPath(bookmarkId: string): string;
    bookmarkJsonPath(bookmarkId: string): string;
    getBookmarksMetadata(): BookmarksMetadata;
    saveBookmarksMetadata(meta: BookmarksMetadata): void;
    getBookmark(bookmarkId: string): BookmarkDefinition;
    saveBookmark(bookmarkId: string, bookmark: BookmarkDefinition): void;
    deleteBookmark(bookmarkId: string): void;
    get registeredResourcesPath(): string;
    saveRegisteredResource(filename: string, data: unknown): void;
    readRegisteredResource(filename: string): unknown | null;
    listRegisteredResources(): string[];
    deleteRegisteredResource(filename: string): void;
    get reportExtensionsPath(): string;
    getReportExtensions(): any | null;
    saveReportExtensions(extensions: any): void;
}
export declare function columnRef(entity: string, property: string): FieldRef;
export declare function aggregationRef(entity: string, property: string, func?: number): FieldRef;
export declare function measureRef(entity: string, property: string): FieldRef;
export declare function buildQueryRef(field: FieldRef): string;
export declare function buildNativeQueryRef(field: FieldRef): string;
export declare function buildAutoFilters(queryState: QueryState): FilterItem[];
