export declare const CANVAS: {
    readonly width: 1280;
    readonly height: 720;
    readonly marginLeft: 20;
    readonly marginRight: 20;
    readonly marginTop: 0;
    readonly marginBottom: 6;
    readonly usableWidth: 1240;
    readonly usableHeight: 714;
    readonly gap: 5;
    readonly bannerHeight: 52;
    readonly bannerY: 0;
    readonly firstContentRowY: 57;
};
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
    code: "OUT_OF_BOUNDS" | "OVERLAP" | "LEFT_MARGIN" | "RIGHT_MARGIN" | "BOTTOM_MARGIN" | "WRONG_GAP_H" | "WRONG_GAP_V" | "BANNER_POSITION" | "BANNER_WIDTH" | "SILENT_DEFAULT" | "COLUMN_MISALIGN" | "ROW_MISALIGN" | "NEGATIVE_DIMENSION" | "ROUNDING_OVERFLOW";
    message: string;
    visuals: string[];
}
export interface WireframeReport {
    ok: boolean;
    issues: WireframeIssue[];
    stats: {
        visualCount: number;
        errors: number;
        warnings: number;
        coverage: number;
        bottomEdge: number;
        rightEdge: number;
    };
}
export declare function validateWireframe(visuals: WireframeVisual[]): WireframeReport;
export declare function formatReport(report: WireframeReport): string;
