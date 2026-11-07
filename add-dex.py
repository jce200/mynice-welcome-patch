#!/usr/bin/env python3
"""Adds classes2.dex (the native layer com.nice.patch) to an APK built by apktool.
The existing files stay byte-for-byte the same and keep their compression (resources.arsc stays 'stored').
Usage: python add-dex.py <apk-in> <classes2.dex> <apk-out>"""
import sys
import zipfile

if len(sys.argv) != 4:
    sys.exit(__doc__)
src_path, dex_path, dst_path = sys.argv[1:]
with zipfile.ZipFile(src_path) as src:
    if "classes2.dex" in src.namelist():
        sys.exit("classes2.dex is already present")
    with zipfile.ZipFile(dst_path, "w") as dst:
        for item in src.infolist():
            dst.writestr(item, src.read(item.filename), compress_type=item.compress_type)
        with open(dex_path, "rb") as f:
            dst.writestr("classes2.dex", f.read(), compress_type=zipfile.ZIP_DEFLATED)
print("classes2.dex added ->", dst_path)
