"""Cross-platform clean zip for the .plugin file.
PowerShell's Compress-Archive emits DOS-host zips that some validators
(notably Cowork) reject. Python's zipfile emits Unix-host zips with
forward slashes and no spurious dir entries — accepted everywhere.

Usage: python zip-plugin.py <build_dir> <output_path>
"""
import sys, os, zipfile

build_dir = os.path.abspath(sys.argv[1])
out_path = os.path.abspath(sys.argv[2])

# Remove existing
if os.path.exists(out_path):
    os.remove(out_path)

with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(build_dir):
        # Sort for deterministic output
        dirs.sort()
        files.sort()
        for fname in files:
            fpath = os.path.join(root, fname)
            arcname = os.path.relpath(fpath, build_dir).replace(os.sep, "/")
            # Force Unix-style entries (no DOS, no dir markers)
            zi = zipfile.ZipInfo(arcname)
            zi.create_system = 3  # Unix
            zi.external_attr = 0o644 << 16  # rw-r--r--
            zi.compress_type = zipfile.ZIP_DEFLATED
            with open(fpath, "rb") as f:
                zf.writestr(zi, f.read())

size = os.path.getsize(out_path)
print(f"Wrote {out_path} ({size / 1024:.1f} KB)")
