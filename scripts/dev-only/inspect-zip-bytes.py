"""Diagnose what 'invalid characters' Cowork is complaining about.
Check: backslashes in raw entry bytes, control chars, BOMs, dotted absolute paths."""
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
for info in z.infolist():
    raw = info.filename
    raw_bytes = raw.encode('utf-8', errors='replace')
    flags = []
    if '\\' in raw: flags.append('backslash')
    if raw.startswith('/'): flags.append('leading-slash')
    if '..' in raw.split('/'): flags.append('parent-ref')
    if any(ord(c) < 32 for c in raw): flags.append('control-char')
    if raw != raw.strip(): flags.append('whitespace')
    if any(c in raw for c in ':*?"<>|'): flags.append('win-invalid')
    # Check create-system + flags
    create_system = info.create_system  # 0=DOS/FAT, 3=Unix
    extract_version = info.extract_version
    flag_bits = info.flag_bits
    is_dir = info.is_dir()
    label = f"{raw}"
    extra = f" [sys={create_system} dir={is_dir}]"
    if flags:
        extra += f" FLAGS: {','.join(flags)}"
    if any(b > 127 for b in raw_bytes):
        extra += f" non-ascii-bytes={raw_bytes!r}"
    print(label + extra)
print(f"\nTotal: {len(z.infolist())} entries")
