import zipfile, re, sys
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
print(f'Total entries: {len(names)}')
print('---First 5 raw repr:')
for n in names[:5]:
    print(repr(n))
bs = [n for n in names if '\\' in n]
print(f'\nEntries containing backslash: {len(bs)}')
for n in bs[:8]:
    print('  ', repr(n))
invalid = [n for n in names if re.search(r'[:*?"<>|]', n)]
print(f'\nEntries with windows-invalid chars: {len(invalid)}')
for n in invalid[:5]:
    print('  ', repr(n))
nonascii = [n for n in names if not n.isascii()]
print(f'\nNon-ASCII entries: {len(nonascii)}')
for n in nonascii[:5]:
    print('  ', repr(n))
