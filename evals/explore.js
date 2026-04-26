#!/usr/bin/env node
// Drives read-only MCP tool handlers against the fixture so we can see
// exactly what an LLM would see while answering eval questions.
// Used during question-authoring; not part of the eval runner.
const path = require("path");
const { PbirProject } = require("../dist/pbir.js");
const { registerReportTools } = require("../dist/tools/report.js");
const { registerVisualTools } = require("../dist/tools/visuals.js");
const { registerThemeTools } = require("../dist/tools/themes.js");
const { registerFilterTools } = require("../dist/tools/filters.js");
const { registerBookmarkTools } = require("../dist/tools/bookmarks.js");
const { registerThemeLookupTool } = require("../dist/tools/themeLookup.js");
const { registerModelUsageTool } = require("../dist/model-usage.js");
const { invalidateAll } = require("../dist/helpers/readCache.js");

const FIXTURE = path.resolve(__dirname, "fixtures", "sample.Report");
let liveProject = new PbirProject(FIXTURE);
const ctx = {
  getReportPath: () => FIXTURE,
  connectReport: (p) => { liveProject = new PbirProject(p); return { success: true, reportPath: p }; },
};
Object.defineProperty(ctx, "project", { get: () => liveProject, configurable: true });

const handlers = {};
const fakeServer = {
  tool: (name, _desc, _schema, annOrHandler, handler) => { handlers[name] = handler ?? annOrHandler; },
  resource: () => {},
};
registerReportTools(fakeServer, ctx);
registerVisualTools(fakeServer, ctx);
registerThemeTools(fakeServer, ctx);
registerFilterTools(fakeServer, ctx);
registerBookmarkTools(fakeServer, ctx);
registerThemeLookupTool(fakeServer);
registerModelUsageTool(fakeServer, ctx);

async function call(name, args = {}) {
  invalidateAll();
  const env = await handlers[name](args);
  return JSON.parse(env.content[0].text);
}

(async () => {
  const target = process.argv[2];
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  if (!target) {
    console.log("Available:", Object.keys(handlers).sort().join(", "));
    return;
  }
  const out = await call(target, args);
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
