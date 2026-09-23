#!/usr/bin/env python3
"""Report ELF section sizes and compressed size of a native library.

Used to compare builds of libmatrix_sdk_ffi.so across slimming stages. Pass one
path for a single report, or two paths (A B) to also print the delta.

    python3 scripts/report-so-size.py <old.so> [<new.so>]

`.text` is the metric to compare across differently-stripped copies: stripping
removes symbol tables, not code. `gzip -9` approximates what the library
contributes to APK/AAB download size, which is roughly a third of its size on
disk -- comparing raw file sizes overstates the user-visible win.
"""
import gzip
import os
import re
import subprocess
import sys

MB = 1048576.0
DELTA_KEYS = [
    "__file__",
    "__gzip__",
    ".text",
    ".rodata",
    ".eh_frame",
    ".gcc_except_table",
    ".data.rel.ro",
]


def find_readelf():
    """llvm-readelf from the Android NDK; falls back to whatever is on PATH."""
    ndk = os.environ.get("ANDROID_NDK_HOME", "")
    if ndk:
        for host in ("darwin-x86_64", "linux-x86_64"):
            candidate = os.path.join(
                ndk, "toolchains/llvm/prebuilt", host, "bin/llvm-readelf"
            )
            if os.path.exists(candidate):
                return candidate
    return "llvm-readelf"


def sections(readelf, path):
    out = subprocess.run(
        [readelf, "-S", "--wide", path], capture_output=True, text=True, check=True
    ).stdout
    rows = []
    for line in out.splitlines():
        m = re.match(r"\s*\[\s*\d+\]\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", line)
        if m and m.group(2) == "PROGBITS":
            rows.append((m.group(1), int(m.group(5), 16)))
    return rows


def report(readelf, path):
    rows = sorted(sections(readelf, path), key=lambda r: -r[1])
    raw = os.path.getsize(path)
    with open(path, "rb") as fh:
        comp = len(gzip.compress(fh.read(), 9))

    print(f"== {path}")
    print(f"{'file on disk':<26}{raw / MB:9.2f} MB")
    print(f"{'gzip -9 (APK proxy)':<26}{comp / MB:9.2f} MB")
    print("-" * 36)
    for name, size in rows[:10]:
        print(f"{name:<26}{size / MB:9.2f} MB")
    print("-" * 36)
    print(f"{'sum PROGBITS':<26}{sum(s for _, s in rows) / MB:9.2f} MB\n")

    result = dict(rows)
    result["__file__"] = raw
    result["__gzip__"] = comp
    return result


def main():
    paths = sys.argv[1:]
    if not 1 <= len(paths) <= 2:
        print(__doc__)
        return 2

    readelf = find_readelf()
    reports = [report(readelf, p) for p in paths]

    if len(reports) == 2:
        a, b = reports
        print("== delta (B - A)")
        for key in DELTA_KEYS:
            av, bv = a.get(key, 0), b.get(key, 0)
            if av or bv:
                pct = (bv - av) / av * 100 if av else 0.0
                print(f"{key:<26}{av / MB:8.2f} -> {bv / MB:8.2f} MB  ({pct:+.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
