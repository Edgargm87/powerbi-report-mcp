"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_PRESETS = void 0;
// --- Theme presets ---
exports.THEME_PRESETS = {
    dark: {
        containerFormat: [
            { category: "title", properties: { fontSize: 10, fontFamily: "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif" } },
            { category: "background", properties: { show: true, color: "#161B22", transparency: 0 } },
            { category: "border", properties: { show: true, color: "#30363D", radius: 8 } },
            { category: "visualHeader", properties: { show: false } },
        ],
        slicerContainerFormat: [
            { category: "title", properties: { fontSize: 8 } },
            { category: "background", properties: { show: true, color: "#0D1117", transparency: 0 } },
            { category: "border", properties: { show: true, color: "#30363D", radius: 6 } },
            { category: "visualHeader", properties: { show: false } },
        ],
        dataColors: ["#58A6FF", "#3FB950", "#D29922", "#F85149", "#BC8CFF", "#79C0FF", "#56D364", "#E3B341", "#FF7B72", "#D2A8FF"],
    },
    light: {
        containerFormat: [
            { category: "title", properties: { fontSize: 10, fontFamily: "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif" } },
            { category: "background", properties: { show: true, color: "#FFFFFF", transparency: 0 } },
            { category: "border", properties: { show: true, color: "#E0E0E0", radius: 8 } },
            { category: "visualHeader", properties: { show: false } },
            { category: "dropShadow", properties: { show: true, position: "Outer" } },
        ],
        dataColors: ["#4A90D9", "#50B748", "#F5A623", "#D0021B", "#9013FE", "#417505", "#BD10E0", "#B8E986", "#7ED321", "#4A4A4A"],
    },
    corporate: {
        containerFormat: [
            { category: "title", properties: { fontSize: 10, fontFamily: "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif" } },
            { category: "background", properties: { show: true, color: "#FFFFFF", transparency: 0 } },
            { category: "border", properties: { show: true, color: "#D1D5DB", radius: 6 } },
            { category: "visualHeader", properties: { show: false } },
            { category: "padding", properties: { top: 6, bottom: 6, left: 8, right: 8 } },
        ],
        dataColors: ["#1F3864", "#2E75B6", "#4BACC6", "#9BBB59", "#F79646", "#8064A2", "#C0504D", "#4F81BD", "#C4BD97", "#3B3838"],
    },
    "blue-purple": {
        containerFormat: [
            { category: "title", properties: { fontSize: 10, fontFamily: "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif" } },
            { category: "background", properties: { show: true, color: "#FFFFFF", transparency: 0 } },
            { category: "border", properties: { show: true, color: "#6C63FF", radius: 10 } },
            { category: "visualHeader", properties: { show: false } },
            { category: "dropShadow", properties: { show: true, position: "Outer" } },
        ],
        dataColors: ["#6C63FF", "#A78BFA", "#3B82F6", "#818CF8", "#C084FC", "#6366F1", "#8B5CF6", "#4338CA", "#7C3AED", "#2563EB"],
    },
};
