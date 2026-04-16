#!/usr/bin/env python3
"""
One-shot cleanup for Wire A — Dashboard in wireframe test.Report.

- Moves every shape's label into objects.text (the branch Power BI Desktop
  actually renders) using the schema the user demonstrated.
- Replaces placeholder 'test' labels with their real role names, picked
  from the shape's x/y position.
- Moves the banner label out of the textbox overlay and into the banner
  shape itself, then deletes the textbox overlay.
- Also moves the single shape that was written with the old general.paragraphs
  text structure onto the correct branch.
"""
import json
import os
import shutil

PAGE_DIR = (
    r"C:\Users\jonathan\OneDrive\FunDev\powerbi-report-mcp"
    r"\pbi report\wireframe test.Report\definition\pages"
    r"\79607a4e6f8358681f20\visuals"
)

# Role map keyed by (x, y) — positions are stable across Wire A.
ROLE_BY_POS = {
    (0, 0):      ("BANNER — Wire A Dashboard", "#FFFFFF", "center", "middle"),
    (20, 57):    ("CARD 1", None, "center", "middle"),
    (269, 57):   ("CARD 2", None, "center", "middle"),
    (518, 57):   ("CARD 3", None, "center", "middle"),
    (767, 57):   ("CARD 4", None, "center", "middle"),
    (1016, 57):  ("CARD 5", None, "center", "middle"),
    (20, 152):   ("CHART LEFT (columnChart)", None, "center", "middle"),
    (642, 152):  ("CHART RIGHT (lineChart)", None, "center", "middle"),
    (20, 437):   ("DETAIL 1 (table)", None, "center", "middle"),
    (435, 437):  ("DETAIL 2 (tableEx)", None, "center", "middle"),
    (850, 437):  ("DETAIL 3 (matrix)", None, "center", "middle"),
}


def make_text_block(text, color, halign, valign):
    escaped = text.replace("'", "''")
    props = {
        "text": {"expr": {"Literal": {"Value": f"'{escaped}'"}}},
    }
    if color:
        props["fontColor"] = {
            "solid": {"color": {"expr": {"Literal": {"Value": f"'{color}'"}}}}
        }
    else:
        props["fontColor"] = {
            "solid": {"color": {"expr": {"ThemeDataColor": {"ColorId": 1, "Percent": 0}}}}
        }
    props["horizontalAlignment"] = {"expr": {"Literal": {"Value": f"'{halign}'"}}}
    props["verticalAlignment"] = {"expr": {"Literal": {"Value": f"'{valign}'"}}}
    return [
        {"properties": {"show": {"expr": {"Literal": {"Value": "true"}}}}},
        {"properties": props, "selector": {"id": "default"}},
    ]


def process_shape(path, pos, role):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    text, color, halign, valign = role
    objects = data["visual"].setdefault("objects", {})

    # Drop any stale general.paragraphs text that slipped into the shape
    # via the old createVisual.ts path.
    objects.pop("general", None)

    objects["text"] = make_text_block(text, color, halign, valign)

    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")


def main():
    deleted_overlays = []
    updated_shapes = []

    for vid in sorted(os.listdir(PAGE_DIR)):
        vpath = os.path.join(PAGE_DIR, vid, "visual.json")
        if not os.path.isfile(vpath):
            continue
        with open(vpath, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        vtype = data["visual"].get("visualType")
        pos = (data["position"]["x"], data["position"]["y"])

        if vtype == "textbox":
            # The banner textbox overlay at (0, 0) — delete it; the banner
            # shape will carry the label instead.
            if pos == (0, 0):
                shutil.rmtree(os.path.join(PAGE_DIR, vid))
                deleted_overlays.append(vid)
            continue

        if vtype != "shape":
            continue

        role = ROLE_BY_POS.get(pos)
        if not role:
            print(f"  ! no role mapping for {vid} at {pos}")
            continue

        process_shape(vpath, pos, role)
        updated_shapes.append((vid, pos, role[0]))

    print("Updated shapes:")
    for vid, pos, label in updated_shapes:
        print(f"  {vid}  {pos}  {label}")
    print(f"Deleted textbox overlays: {deleted_overlays}")


if __name__ == "__main__":
    main()
