#!/usr/bin/env python3
"""Download the chunks needed for one x-z plane of the OpenOrganelle HeLa cell jrc_hela-2.

Run by hand, once (not part of `make`):

    python3 -I demos/data-scripts/cellexplorer_fetch.py --cache <scratch dir>

Source: Janelia COSEM / OpenOrganelle, public S3 bucket `janelia-cosem-datasets`
(anonymous HTTPS access), licence CC BY 4.0. See cell-tour/credits.md.

The raw downloads (a few hundred MB) stay in --cache, never in the repository. Downloaded
bytes are treated as untrusted data: they are only decompressed into numeric arrays by
cellexplorer_build.py; nothing in them is executed or used as a path.
"""
import argparse, json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://janelia-cosem-datasets.s3.amazonaws.com/jrc_hela-2/"
EM = "jrc_hela-2.zarr/recon-1/em/fibsem-uint8/"    # OME-Zarr v2, axes (z, y, x), blosc
LAB = "jrc_hela-2.n5/labels/"                      # N5, axes (x, y, z) on disk, gzip

# Plane: fixed y (distance from the coverslip side of the volume), in nm.
Y_NM = 1554.0
EM_LEVEL = "s1"    # 8 x 8 x 10.48 nm
LAB_LEVEL = "s2"   # 16 x 16 x 20.96 nm
CLASSES = ["nucleus", "nucleolus", "er", "golgi", "mito", "endo", "lyso", "ld", "pm", "cent"]


def get(url: str, dest: str) -> bool:
    """Fetch url to dest unless cached. Returns False on HTTP 404/403 (missing chunk = empty)."""
    if os.path.exists(dest):
        return True
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read(64 * 1024 * 1024)   # chunks are small; cap the read
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return False
        raise
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dest)
    return True


def meta(key: str, cache: str) -> dict:
    dest = os.path.join(cache, key)
    get(BASE + key, dest)
    with open(dest) as f:
        return json.load(f)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="directory for raw downloads (outside the repo)")
    ap.add_argument("--workers", type=int, default=32)
    args = ap.parse_args()
    jobs = []

    # EM: zarr chunks s1/<z>/<y>/<x> for the y-chunk that holds the plane.
    za = meta(EM + EM_LEVEL + "/.zarray", args.cache)
    cz, cy, cx = za["chunks"]; nz, ny, nx = za["shape"]
    yi = int(round((Y_NM - 2.0) / 8.0))        # s1: scale 8 nm, translation 2 nm
    for z in range(-(-nz // cz)):
        for x in range(-(-nx // cx)):
            k = f"{EM}{EM_LEVEL}/{z}/{yi // cy}/{x}"
            jobs.append(k)

    # Labels: N5 blocks s2/<x>/<y>/<z>.
    for c in CLASSES:
        at = meta(f"{LAB}{c}_seg/{LAB_LEVEL}/attributes.json", args.cache)
        dx, dy, dz = at["dimensions"]; bx, by, bz = at["blockSize"]
        yl = int(round((Y_NM - 6.0) / 16.0))   # s2: scale 16 nm, translation 6 nm
        for x in range(-(-dx // bx)):
            for z in range(-(-dz // bz)):
                jobs.append(f"{LAB}{c}_seg/{LAB_LEVEL}/{x}/{yl // by}/{z}")

    print(f"{len(jobs)} chunks")
    with ThreadPoolExecutor(args.workers) as ex:
        found = list(ex.map(lambda k: get(BASE + k, os.path.join(args.cache, k)), jobs))
    print(f"done: {sum(found)} present, {len(found) - sum(found)} empty/missing")


if __name__ == "__main__":
    main()
