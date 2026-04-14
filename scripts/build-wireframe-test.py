#!/usr/bin/env python3
"""
Build Wires A–E into wireframe test.Report using the validated layouts from
scripts/test-wireframe-validator.js, emitted as PBIR files with the full
shape-text schema (objects.text branch with font, size, color, alignment).

Each shape carries a label describing the visual type it's standing in for,
so the page is self-documenting: BANNER / CARD / SLICER / CHART / TABLE etc.
"""
import json
import os
import random
import shutil
import string

ROOT = (
    r"C:\Users\jonathan\OneDrive\FunDev\powerbi-report-mcp"
    r"\pbi report\wireframe test.Report\definition"
)
PAGES_DIR = os.path.join(ROOT, "pages")

# --- color scheme (consistent across all 5 pages) -------------------------
BANNER_FILL = "#1B2A4A"    # navy
BANNER_TEXT = "#FFFFFF"    # white
CARD_FILL   = "#E8EEF4"    # light blue
CHART_FILL  = "#D6E4F0"    # medium blue
TABLE_FILL  = "#E4F0E8"    # light green
SLICER_FILL = "#F0E4D6"    # light tan
NAV_FILL    = "#F5F5F5"    # light gray

SCHEMA_PAGE   = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json"
SCHEMA_VISUAL = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json"

TITLE_CONTAINER = {
    "title": [
        {
            "properties": {
                "fontSize":   {"expr": {"Literal": {"Value": "8D"}}},
                "fontFamily": {
                    "expr": {"Literal": {"Value": "''Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif'"}}
                },
            }
        }
    ]
}


def gen_id():
    return "".join(random.choices(string.hexdigits.lower()[:16], k=20))


def dax_lit(value):
    return {"expr": {"Literal": {"Value": f"'{str(value)}'"}}}


def dax_bool(value):
    return {"expr": {"Literal": {"Value": "true" if value else "false"}}}


def dax_int(value):
    return {"expr": {"Literal": {"Value": f"{int(value)}L"}}}


def dax_double(value):
    return {"expr": {"Literal": {"Value": f"{value}D"}}}


def font_family_literal(name):
    """Wrap a friendly font name as a DAX fontFamily literal."""
    stacks = {
        "Segoe UI":       "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif",
        "Segoe UI Bold":  "'Segoe UI Bold', wf_segoe-ui_bold, helvetica, arial, sans-serif",
        "Segoe UI Semibold": "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif",
        "DIN":            "wf_standard-font, helvetica, arial, sans-serif",
    }
    stack = stacks.get(name, name)
    escaped = stack.replace("'", "''")
    return {"expr": {"Literal": {"Value": f"'{escaped}'"}}}


def build_text_block(
    text,
    *,
    color=None,
    halign="center",
    valign="middle",
    bold=False,
    italic=False,
    underline=False,
    font=None,
    size=None,
    padding=None,
):
    """Build the two-entry objects.text array."""
    escaped = str(text).replace("'", "''")
    props = {"text": {"expr": {"Literal": {"Value": f"'{escaped}'"}}}}
    if color:
        props["fontColor"] = {
            "solid": {"color": {"expr": {"Literal": {"Value": f"'{color}'"}}}}
        }
    else:
        props["fontColor"] = {
            "solid": {
                "color": {"expr": {"ThemeDataColor": {"ColorId": 1, "Percent": 0}}}
            }
        }
    if halign:
        props["horizontalAlignment"] = dax_lit(halign)
    if valign:
        props["verticalAlignment"] = dax_lit(valign)
    if size:
        props["fontSize"] = dax_double(size)
    if font:
        props["fontFamily"] = font_family_literal(font)
    if bold:
        props["bold"] = dax_bool(True)
    if italic:
        props["italic"] = dax_bool(True)
    if underline:
        props["underline"] = dax_bool(True)
    if padding is not None:
        props["leftMargin"]   = dax_int(padding)
        props["topMargin"]    = dax_int(padding)
        props["rightMargin"]  = dax_int(padding)
        props["bottomMargin"] = dax_int(padding)
    return [
        {"properties": {"show": dax_bool(True)}},
        {"properties": props, "selector": {"id": "default"}},
    ]


def build_shape_visual(*, x, y, w, h, z, fill, label, text_opts):
    vid = gen_id()
    visual = {
        "$schema": SCHEMA_VISUAL,
        "name": vid,
        "position": {
            "x": x, "y": y, "z": z,
            "height": h, "width": w, "tabOrder": z,
        },
        "visual": {
            "visualType": "shape",
            "objects": {
                "shape": [{"properties": {"tileShape": dax_lit("rectangle")}}],
                "rotation": [{"properties": {"shapeAngle": dax_int(0)}}],
                "fill": [
                    {
                        "properties": {
                            "fillColor": {
                                "solid": {
                                    "color": {
                                        "expr": {"Literal": {"Value": f"'{fill}'"}}
                                    }
                                }
                            }
                        },
                        "selector": {"id": "default"},
                    }
                ],
                "outline": [{"properties": {"show": dax_bool(False)}}],
                "text": build_text_block(label, **text_opts),
            },
            "drillFilterOtherVisuals": True,
            "visualContainerObjects": TITLE_CONTAINER,
        },
    }
    return vid, visual


# ── Layout definitions ──────────────────────────────────────────────────────
# Each entry: (x, y, w, h, fill, label, text_opts)
# text_opts defaults to centered + middle + no decoration unless overridden.

def banner(label):
    return (
        0, 0, 1280, 52,
        BANNER_FILL,
        label,
        dict(color=BANNER_TEXT, bold=True, font="Segoe UI Bold", size=14),
    )


def big_label(text, *, font="Segoe UI Semibold", size=11):
    return dict(font=font, size=size, bold=True)


# Canvas 1280x720 with 6px bottom margin → max bottom edge y = 714.

LAYOUT_A = [
    banner("WIRE A — DASHBOARD (5 cards + 2 charts + 3 details)"),
    (20,   57,  244, 90,  CARD_FILL,  "CARD 1\n(card)",              big_label("CARD 1")),
    (269,  57,  244, 90,  CARD_FILL,  "CARD 2\n(card)",              big_label("CARD 2")),
    (518,  57,  244, 90,  CARD_FILL,  "CARD 3\n(card)",              big_label("CARD 3")),
    (767,  57,  244, 90,  CARD_FILL,  "CARD 4\n(card)",              big_label("CARD 4")),
    (1016, 57,  244, 90,  SLICER_FILL,"SLICER\n(slicer)",            big_label("SLICER")),
    (20,   152, 617, 280, CHART_FILL, "CHART LEFT\n(columnChart)",   big_label("CHART")),
    (642,  152, 618, 280, CHART_FILL, "CHART RIGHT\n(lineChart)",    big_label("CHART")),
    (20,   437, 410, 277, TABLE_FILL, "DETAIL 1\n(tableEx)",         big_label("TABLE")),
    (435,  437, 410, 277, TABLE_FILL, "DETAIL 2\n(tableEx)",         big_label("TABLE")),
    (850,  437, 410, 277, TABLE_FILL, "DETAIL 3\n(matrix)",          big_label("TABLE")),
]

LAYOUT_B = [
    banner("WIRE B — ANALYSIS (3 slicers + chart+KPI + table)"),
    (20,  57,  410, 40,  SLICER_FILL, "SLICER 1\n(slicer)", big_label("SLICER")),
    (435, 57,  410, 40,  SLICER_FILL, "SLICER 2\n(slicer)", big_label("SLICER")),
    (850, 57,  410, 40,  SLICER_FILL, "SLICER 3\n(slicer)", big_label("SLICER")),
    (20,  102, 823, 380, CHART_FILL,  "MAIN CHART\n(comboChart)", big_label("CHART")),
    (848, 102, 412, 93,  CARD_FILL,   "KPI 1\n(card)", big_label("KPI 1")),
    (848, 200, 412, 93,  CARD_FILL,   "KPI 2\n(card)", big_label("KPI 2")),
    (848, 298, 412, 93,  CARD_FILL,   "KPI 3\n(card)", big_label("KPI 3")),
    (848, 396, 412, 86,  CARD_FILL,   "KPI 4\n(card)", big_label("KPI 4")),
    (20,  487, 1240, 227, TABLE_FILL, "TABLE\n(tableEx)", big_label("TABLE")),
]

LAYOUT_C = [
    banner("WIRE C — KPI SUMMARY (6 cards + wide chart)"),
    (20,  57,  410, 120, CARD_FILL,  "CARD 1\n(card)", big_label("CARD 1")),
    (435, 57,  410, 120, CARD_FILL,  "CARD 2\n(card)", big_label("CARD 2")),
    (850, 57,  410, 120, CARD_FILL,  "CARD 3\n(card)", big_label("CARD 3")),
    (20,  182, 410, 120, CARD_FILL,  "CARD 4\n(card)", big_label("CARD 4")),
    (435, 182, 410, 120, CARD_FILL,  "CARD 5\n(card)", big_label("CARD 5")),
    (850, 182, 410, 120, CARD_FILL,  "CARD 6\n(card)", big_label("CARD 6")),
    (20,  307, 1240, 407, CHART_FILL, "WIDE CHART\n(barChart)", big_label("CHART")),
]

LAYOUT_D = [
    banner("WIRE D — SIDEBAR NAV (160 rail + 4 KPI + 2 charts + table)"),
    (20,  57,  160, 657, NAV_FILL,   "NAV RAIL\n(slicer)",            big_label("NAV")),
    (185, 57,  265, 90,  CARD_FILL,  "KPI 1\n(card)",                 big_label("KPI 1")),
    (455, 57,  265, 90,  CARD_FILL,  "KPI 2\n(card)",                 big_label("KPI 2")),
    (725, 57,  265, 90,  CARD_FILL,  "KPI 3\n(card)",                 big_label("KPI 3")),
    (995, 57,  265, 90,  CARD_FILL,  "KPI 4\n(card)",                 big_label("KPI 4")),
    (185, 152, 535, 280, CHART_FILL, "CHART LEFT\n(barChart)",        big_label("CHART")),
    (725, 152, 535, 280, CHART_FILL, "CHART RIGHT\n(lineChart)",      big_label("CHART")),
    (185, 437, 1075, 277, TABLE_FILL, "DETAIL TABLE\n(tableEx)",      big_label("TABLE")),
]

LAYOUT_E = [
    banner("WIRE E — 3×3 TILE GRID (9 uniform tiles)"),
    (20,  57,  410, 215, CARD_FILL, "TILE 1\n(card)",     big_label("TILE 1")),
    (435, 57,  410, 215, CARD_FILL, "TILE 2\n(card)",     big_label("TILE 2")),
    (850, 57,  410, 215, CARD_FILL, "TILE 3\n(card)",     big_label("TILE 3")),
    (20,  277, 410, 215, CARD_FILL, "TILE 4\n(card)",     big_label("TILE 4")),
    (435, 277, 410, 215, CARD_FILL, "TILE 5\n(card)",     big_label("TILE 5")),
    (850, 277, 410, 215, CARD_FILL, "TILE 6\n(card)",     big_label("TILE 6")),
    (20,  497, 410, 215, CARD_FILL, "TILE 7\n(card)",     big_label("TILE 7")),
    (435, 497, 410, 215, CARD_FILL, "TILE 8\n(card)",     big_label("TILE 8")),
    (850, 497, 410, 215, CARD_FILL, "TILE 9\n(card)",     big_label("TILE 9")),
]

PAGES = [
    ("Wire A — Dashboard",   LAYOUT_A),
    ("Wire B — Analysis",    LAYOUT_B),
    ("Wire C — KPI Summary", LAYOUT_C),
    ("Wire D — Sidebar Nav", LAYOUT_D),
    ("Wire E — 3×3 Tiles",   LAYOUT_E),
]


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def existing_wire_ids():
    """Scan pages/ and return {displayName: page_id} for pages whose
    displayName starts with 'Wire '. Used to update in place so we don't
    churn page IDs, orphan dirs, or hit OneDrive rmtree locks."""
    result = {}
    if not os.path.isdir(PAGES_DIR):
        return result
    for entry in os.listdir(PAGES_DIR):
        page_dir = os.path.join(PAGES_DIR, entry)
        page_json = os.path.join(page_dir, "page.json")
        if not os.path.isfile(page_json):
            continue
        try:
            with open(page_json, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        display_name = meta.get("displayName", "")
        if display_name.startswith("Wire "):
            result[display_name] = meta.get("name", entry)
    return result


def purge_visuals_dir(visuals_dir):
    """Remove every child of visuals_dir. Tolerates OneDrive locks by
    retrying each file individually and warning on failures."""
    if not os.path.isdir(visuals_dir):
        return
    for name in os.listdir(visuals_dir):
        path = os.path.join(visuals_dir, name)
        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
        except PermissionError as e:
            print(f"  ! could not remove {path}: {e}")


def build_page(display_name, layout, existing_id=None):
    page_id = existing_id or gen_id()
    page_dir = os.path.join(PAGES_DIR, page_id)
    visuals_dir = os.path.join(page_dir, "visuals")
    # If we're reusing an existing page, wipe its visuals first so stale
    # placements from prior builds don't linger.
    if existing_id:
        purge_visuals_dir(visuals_dir)
    os.makedirs(visuals_dir, exist_ok=True)

    page_obj = {
        "$schema": SCHEMA_PAGE,
        "name": page_id,
        "displayName": display_name,
        "displayOption": "FitToPage",
        "height": 720,
        "width": 1280,
    }
    write_json(os.path.join(page_dir, "page.json"), page_obj)

    for i, entry in enumerate(layout):
        x, y, w, h, fill, label, text_opts = entry
        z = 1000 * (i + 1)
        vid, visual = build_shape_visual(
            x=x, y=y, w=w, h=h, z=z,
            fill=fill, label=label, text_opts=text_opts,
        )
        write_json(
            os.path.join(visuals_dir, vid, "visual.json"),
            visual,
        )

    return page_id


def main():
    random.seed()
    reused = existing_wire_ids()
    built_ids = []
    for display_name, layout in PAGES:
        existing = reused.get(display_name)
        pid = build_page(display_name, layout, existing_id=existing)
        built_ids.append((display_name, pid, existing is not None))
        tag = "updated" if existing else "created"
        print(f"  {display_name:25}  {pid}  ({len(layout)} visuals, {tag})")

    # Update pages.json. Keep any non-Wire pages in their original order,
    # then append Wire A–E (in the order listed in PAGES) using the IDs we
    # just built. Active page = Wire A.
    pages_json_path = os.path.join(PAGES_DIR, "pages.json")
    with open(pages_json_path, "r", encoding="utf-8") as f:
        pages_meta = json.load(f)

    new_wire_ids = [pid for _, pid, _ in built_ids]
    existing_order = pages_meta.get("pageOrder", [])
    non_wire = [pid for pid in existing_order if pid not in new_wire_ids]
    pages_meta["pageOrder"] = non_wire + new_wire_ids
    pages_meta["activePageName"] = new_wire_ids[0]
    write_json(pages_json_path, pages_meta)
    print(f"\nWrote {len(new_wire_ids)} wire pages. Active: {new_wire_ids[0]} (Wire A)")


if __name__ == "__main__":
    main()
