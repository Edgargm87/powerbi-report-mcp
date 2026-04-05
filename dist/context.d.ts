import type { PbirProject } from "./pbir.js";
export interface ConnectResult {
    success: boolean;
    reportPath?: string;
    error?: string;
}
export interface ServerContext {
    /** Returns the currently-connected report path, or null if not set */
    getReportPath: () => string | null;
    /** Connect (or switch) to a new report folder */
    connectReport: (targetPath: string) => ConnectResult;
    /** Proxy to PbirProject — throws if no report is connected */
    project: PbirProject;
}
