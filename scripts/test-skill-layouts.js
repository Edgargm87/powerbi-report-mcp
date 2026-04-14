// Historical: audit the pre-v2.0 skills/wireframes.md layouts.
//
// Before v2.0 (2026-04-14), skills/wireframes.md used 10px margins and
// 10px gaps, with a "header bar" at x:10 y:10 w:1260 h:40 that was not
// exempt from margins (unlike a real banner). Running this script shows
// every layout fails with ~14-22 errors, which is exactly what drove
// the rewrite to match docs/wireframes.md (20px margins, 5px gaps,
// banner at x:0 y:0 w:1280 h:52).
//
// Kept as a diagnostic / regression artifact — run it any time you
// suspect skill doc drift.

const { validateWireframe, formatReport } = require("../dist/wireframe-validator.js");

function audit(name, visuals) {
  const r = validateWireframe(visuals);
  const icon = r.ok ? "✓" : "✗";
  console.log(`\n${icon} ${name} — ${r.stats.errors} errors, ${r.stats.warnings} warnings`);
  if (!r.ok) {
    r.issues.filter(i => i.severity === "error").slice(0, 3).forEach(i => {
      console.log(`    ✗ [${i.code}] ${i.message}`);
    });
    if (r.issues.filter(i => i.severity === "error").length > 3) {
      console.log(`    … and ${r.issues.filter(i => i.severity === "error").length - 3} more errors`);
    }
  }
}

// --- Layout 1 — Basic Grid ---
audit("L1 Basic Grid", [
  { id:"card1",visualType:"card",x:10,y:10,width:307,height:140},
  { id:"card2",visualType:"card",x:327,y:10,width:307,height:140},
  { id:"card3",visualType:"card",x:644,y:10,width:307,height:140},
  { id:"card4",visualType:"card",x:961,y:10,width:307,height:140},
  { id:"leftHalf",visualType:"barChart",x:10,y:160,width:625,height:260},
  { id:"rightHalf",visualType:"barChart",x:645,y:160,width:625,height:260},
  { id:"third1",visualType:"tableEx",x:10,y:430,width:413,height:270},
  { id:"third2",visualType:"tableEx",x:433,y:430,width:413,height:270},
  { id:"third3",visualType:"tableEx",x:856,y:430,width:413,height:270},
]);

// --- Layout 2 — Classic Dashboard ---
audit("L2 Classic Dashboard", [
  { id:"header",visualType:"shape",x:10,y:10,width:1260,height:40},
  { id:"kpi1",visualType:"card",x:10,y:60,width:300,height:100},
  { id:"kpi2",visualType:"card",x:320,y:60,width:300,height:100},
  { id:"kpi3",visualType:"card",x:630,y:60,width:300,height:100},
  { id:"kpi4",visualType:"card",x:940,y:60,width:330,height:100},
  { id:"cl",visualType:"barChart",x:10,y:170,width:625,height:240},
  { id:"cr",visualType:"barChart",x:645,y:170,width:625,height:240},
  { id:"b1",visualType:"tableEx",x:10,y:420,width:405,height:290},
  { id:"b2",visualType:"tableEx",x:425,y:420,width:405,height:290},
  { id:"b3",visualType:"tableEx",x:840,y:420,width:430,height:290},
]);

// --- Layout 6 — F-Layout ---
audit("L6 F-Layout", [
  { id:"header",visualType:"shape",x:10,y:10,width:1260,height:40},
  { id:"c1",visualType:"card",x:10,y:60,width:238,height:110},
  { id:"c2",visualType:"card",x:258,y:60,width:238,height:110},
  { id:"c3",visualType:"card",x:506,y:60,width:238,height:110},
  { id:"c4",visualType:"card",x:754,y:60,width:238,height:110},
  { id:"c5",visualType:"card",x:1002,y:60,width:268,height:110},
  { id:"wide",visualType:"barChart",x:10,y:180,width:840,height:230},
  { id:"cr",visualType:"barChart",x:860,y:180,width:410,height:230},
  { id:"bl",visualType:"tableEx",x:10,y:420,width:615,height:290},
  { id:"sm1",visualType:"card",x:635,y:420,width:300,height:135},
  { id:"sm2",visualType:"card",x:635,y:565,width:300,height:145},
  { id:"tr",visualType:"tableEx",x:945,y:420,width:325,height:290},
]);

// --- Layout 10 — 3x3 Grid ---
audit("L10 3x3 Grid", [
  { id:"header",visualType:"shape",x:10,y:10,width:1260,height:40},
  { id:"t1",visualType:"card",x:10,y:60,width:413,height:210},
  { id:"t2",visualType:"card",x:433,y:60,width:413,height:210},
  { id:"t3",visualType:"card",x:856,y:60,width:414,height:210},
  { id:"t4",visualType:"card",x:10,y:280,width:413,height:210},
  { id:"t5",visualType:"card",x:433,y:280,width:413,height:210},
  { id:"t6",visualType:"card",x:856,y:280,width:414,height:210},
  { id:"t7",visualType:"card",x:10,y:500,width:413,height:210},
  { id:"t8",visualType:"card",x:433,y:500,width:413,height:210},
  { id:"t9",visualType:"card",x:856,y:500,width:414,height:210},
]);

// --- Layout 11 — Top-Down Narrative (the tallest one, likely overflows) ---
audit("L11 Top-Down Narrative", [
  { id:"header",visualType:"shape",x:10,y:10,width:1260,height:40},
  { id:"title",visualType:"textbox",x:10,y:60,width:1260,height:55},
  { id:"m1",visualType:"card",x:10,y:125,width:240,height:90},
  { id:"m2",visualType:"card",x:260,y:125,width:240,height:90},
  { id:"m3",visualType:"card",x:510,y:125,width:240,height:90},
  { id:"m4",visualType:"card",x:760,y:125,width:240,height:90},
  { id:"m5",visualType:"card",x:1010,y:125,width:260,height:90},
  { id:"wide",visualType:"barChart",x:10,y:225,width:1260,height:195},
  { id:"dl",visualType:"tableEx",x:10,y:430,width:620,height:155},
  { id:"dr",visualType:"tableEx",x:640,y:430,width:630,height:155},
  { id:"foot",visualType:"textbox",x:10,y:595,width:1260,height:115},
]);
