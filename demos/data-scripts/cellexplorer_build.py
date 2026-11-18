#!/usr/bin/env python3
"""Build the cell explorer's image and organelle outlines from the cached chunks.

Run by hand after cellexplorer_fetch.py (not part of `make`):

    python3 -I demos/data-scripts/cellexplorer_build.py --cache <scratch dir> \
        --preview <scratch dir>/preview

Writes (committed):
    demos/assets/cellexplorer/hela-plane.jpg     the EM plane, square pixels
    demos/src/cellexplorer/outlines.json         simplified polygons per organelle class

The input chunks are untrusted downloaded data: they are only decompressed (blosc, gzip)
into numeric arrays with fixed, checked shapes.

Data: OpenOrganelle / Janelia COSEM, dataset jrc_hela-2 (HeLa cell, FIB-SEM), CC BY 4.0.
Heinrich et al., Nature 599:141 (2021); Xu et al., Nature 599:147 (2021).
"""
import argparse, gzip, json, os, struct
import numpy as np
import cv2
from numcodecs import Blosc

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
EM = "jrc_hela-2.zarr/recon-1/em/fibsem-uint8/s1"
LAB = "jrc_hela-2.n5/labels"

Y_NM = 1554.0          # the plane (must match cellexplorer_fetch.py)
NM_PER_PX = 12.0       # output pixel size
# Crop (nm) in the x-z plane: x along the image width, z along the image height.
CROP_X = (0.0, 48000.0)
CROP_Z = (3000.0, 29000.0)
JPEG_QUALITY = 78
# A band of damaged FIB-SEM slices (vertical streaks) crosses the plane here. These rows
# are removed from the image and the masks (about 0.2 µm); the page says so.
BAD_Z_NM = (12285.0, 12495.0)


def bad_rows():
    r0 = int(round((BAD_Z_NM[0] - CROP_Z[0]) / NM_PER_PX))
    r1 = int(round((BAD_Z_NM[1] - CROP_Z[0]) / NM_PER_PX))
    return np.arange(max(0, r0), max(0, r1))


def cut(a: np.ndarray) -> np.ndarray:
    return np.delete(a, bad_rows(), axis=0)

# Output classes: id, source label layer(s), minimum area (px at NM_PER_PX), simplification (px)
CLASSES = [
    ("pm", ["pm"], 150, 1.5),          # membrane band of every cell in the plane
    ("nucleus", ["nucleus"], 2000, 2.0),
    ("ne", [], 0, 1.0),                # a band along the nucleus outline (see below)
    ("nucleolus", ["nucleolus"], 300, 1.5),
    ("er", ["er"], 60, 1.2),
    ("golgi", ["golgi"], 40, 1.2),
    ("mito", ["mito"], 120, 1.2),
    ("endolyso", ["endo", "lyso"], 200, 1.0),   # smaller predictions are mostly vesicles
    ("ld", ["ld"], 40, 1.0),
    ("cent", ["cent"], 10, 1.0),
]


# ---------------------------------------------------------------- readers
def read_em_plane(cache: str) -> np.ndarray:
    """One x-z plane of the s1 EM (8 nm in x, 10.48 nm in z) -> uint8 (z, x)."""
    with open(os.path.join(cache, EM, ".zarray")) as f:
        za = json.load(f)
    nz, ny, nx = za["shape"]; cz, cy, cx = za["chunks"]
    assert za["dtype"] == "|u1" and za["order"] == "C"
    yi = int(round((Y_NM - 2.0) / 8.0))
    out = np.zeros((nz, nx), np.uint8)
    codec = Blosc()
    for z in range(-(-nz // cz)):
        for x in range(-(-nx // cx)):
            p = os.path.join(cache, EM, str(z), str(yi // cy), str(x))
            if not os.path.exists(p):
                continue
            with open(p, "rb") as f:
                raw = codec.decode(f.read())
            blk = np.frombuffer(raw, np.uint8)
            assert blk.size == cz * cy * cx
            blk = blk.reshape(cz, cy, cx)[:, yi % cy, :]
            t = out[z * cz:(z + 1) * cz, x * cx:(x + 1) * cx]
            t[...] = blk[:t.shape[0], :t.shape[1]]
    return out


def read_label_plane(cache: str, cls: str) -> np.ndarray:
    """One x-z plane of an s2 N5 label volume (16 nm in x, 20.96 nm in z) -> uint32 (z, x)."""
    base = os.path.join(cache, LAB, cls + "_seg", "s2")
    with open(os.path.join(base, "attributes.json")) as f:
        at = json.load(f)
    dx, dy, dz = at["dimensions"]; bx, by, bz = at["blockSize"]
    dt = np.dtype(at["dataType"]).newbyteorder(">")
    assert at["compression"]["type"] == "gzip"
    yl = int(round((Y_NM - 6.0) / 16.0))
    out = np.zeros((dz, dx), np.uint32)
    for x in range(-(-dx // bx)):
        for z in range(-(-dz // bz)):
            p = os.path.join(base, str(x), str(yl // by), str(z))
            if not os.path.exists(p):
                continue
            with open(p, "rb") as f:
                raw = f.read()
            mode, nd = struct.unpack(">HH", raw[:4])
            assert nd == 3 and mode in (0, 1)
            dims = struct.unpack(">III", raw[4:16])
            off = 16 + (4 if mode == 1 else 0)
            n = dims[0] * dims[1] * dims[2]
            data = np.frombuffer(gzip.decompress(raw[off:]), dt)[:n]
            assert data.size == n
            blk = data.reshape(dims[2], dims[1], dims[0])[:, yl % by, :]
            t = out[z * bz:z * bz + dims[2], x * bx:x * bx + dims[0]]
            t[...] = blk[:t.shape[0], :t.shape[1]]
    return out


# ---------------------------------------------------------------- resampling
def crop_resample(a: np.ndarray, sx: float, sz: float, ox: float, oz: float, interp: int) -> np.ndarray:
    """Crop to CROP_X/CROP_Z (nm) and resample to NM_PER_PX square pixels."""
    W = int(round((CROP_X[1] - CROP_X[0]) / NM_PER_PX))
    H = int(round((CROP_Z[1] - CROP_Z[0]) / NM_PER_PX))
    # output pixel centre (nm) -> source index
    xs = (CROP_X[0] + (np.arange(W) + 0.5) * NM_PER_PX - ox) / sx
    zs = (CROP_Z[0] + (np.arange(H) + 0.5) * NM_PER_PX - oz) / sz
    if interp == cv2.INTER_AREA:
        # area-average first to roughly the output pitch, then remap
        fx, fz = sx / NM_PER_PX, sz / NM_PER_PX
        small = cv2.resize(a, None, fx=fx, fy=fz, interpolation=cv2.INTER_AREA)
        xs = xs * (small.shape[1] / a.shape[1]); zs = zs * (small.shape[0] / a.shape[0])
        a = small
        interp = cv2.INTER_LINEAR
    mx, mz = np.meshgrid(xs.astype(np.float32), zs.astype(np.float32))
    return cv2.remap(a, mx, mz, interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def destripe(img: np.ndarray, sigma: float = 40.0) -> np.ndarray:
    """Remove horizontal bands (slow brightness changes between FIB milling steps): subtract
    the high-pass part of each row's median brightness."""
    f = img.astype(np.float32)
    rows = np.median(f, axis=1)
    smooth = cv2.GaussianBlur(rows.reshape(-1, 1), (1, 0), sigmaX=0.1, sigmaY=sigma).ravel()
    return f - (rows - smooth)[:, None]


def enhance(f: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(f, [0.5, 99.7])
    g = np.clip((f - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    return cv2.createCLAHE(clipLimit=1.6, tileGridSize=(12, 8)).apply(g)


# ---------------------------------------------------------------- outlines
def smooth_mask(lab: np.ndarray, keep=None) -> np.ndarray:
    """Binary label mask upsampled with linear interpolation, then thresholded (smooth edges)."""
    m = (lab > 0) if keep is None else np.isin(lab, keep)
    f = crop_resample(m.astype(np.float32), 16.0, 20.96, 6.0, 7.86, cv2.INTER_LINEAR)
    return cut((f > 0.5).astype(np.uint8))


def polygons(mask: np.ndarray, min_area: float, eps: float):
    """Connected components -> list of shapes; each shape is [outer ring, hole rings...]."""
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    shapes = []
    if hier is None:
        return shapes
    hier = hier[0]
    for i, c in enumerate(cs):
        if hier[i][3] != -1:           # a hole; added with its parent
            continue
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        rings = [cv2.approxPolyDP(c, eps, True)]
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(cs[j]) >= max(min_area, 30):
                rings.append(cv2.approxPolyDP(cs[j], eps, True))
            j = hier[j][0]
        rings = [r.reshape(-1, 2).tolist() for r in rings if len(r) >= 3]
        if rings:
            shapes.append({"area": round(area), "rings": rings})
    return shapes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--preview", help="directory for QA previews (outside the repo)")
    ap.add_argument("--fixes", default=os.path.join(HERE, "cellexplorer_fixes.json"),
                    help="hand corrections after teacher QA")
    args = ap.parse_args()

    em = read_em_plane(args.cache)
    img = crop_resample(em, 8.0, 10.48, 2.0, 2.62, cv2.INTER_AREA)
    img = enhance(destripe(img))
    img = cut(img)
    H, W = img.shape
    out_img = os.path.join(REPO, "demos/assets/cellexplorer/hela-plane.jpg")
    os.makedirs(os.path.dirname(out_img), exist_ok=True)
    cv2.imwrite(out_img, img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY, cv2.IMWRITE_JPEG_PROGRESSIVE, 1,
                               cv2.IMWRITE_JPEG_OPTIMIZE, 1])
    print(f"image {W}x{H}, {os.path.getsize(out_img) / 1e6:.2f} MB")

    labs = {}
    def lab(name):
        if name not in labs:
            labs[name] = read_label_plane(args.cache, name)
        return labs[name]

    with open(args.fixes) as f:
        fixes = json.load(f)
    result = {}
    # Main cell: the nucleus instance nearest the image centre identifies the cell.
    nuc = lab("nucleus")
    nuc_up = cut(crop_resample(nuc.astype(np.float32), 16.0, 20.96, 6.0, 7.86, cv2.INTER_NEAREST).astype(np.uint32))
    ids, counts = np.unique(nuc_up[H // 3: 2 * H // 3, W // 3: 2 * W // 3], return_counts=True)
    main_nuc = int(ids[ids > 0][np.argmax(counts[ids > 0])])
    nucleus_mask = (nuc_up == main_nuc).astype(np.uint8)
    nucleus_mask = cv2.morphologyEx(nucleus_mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    # The plane also cuts neighbouring cells at its edges; their organelles are kept too.
    # The plasma membrane is kept as the segmented membrane band (all cells).

    for cid, sources, min_area, eps in CLASSES:
        if cid == "pm":
            m = smooth_mask(lab("pm"))
        elif cid == "nucleus":
            m = nucleus_mask
        elif cid == "ne":
            # The ne prediction is fragmented in this plane; draw the envelope as a band
            # (about 70 nm) on the nucleus boundary instead, including the deep fold.
            m = cv2.dilate(nucleus_mask, np.ones((5, 5), np.uint8)) - cv2.erode(nucleus_mask, np.ones((3, 3), np.uint8))
        else:
            m = np.zeros((H, W), np.uint8)
            for s in sources:
                m |= smooth_mask(lab(s))
            if cid == "nucleolus":
                m &= nucleus_mask
        shapes = polygons(m, min_area, eps)
        if cid == "nucleus":
            shapes = sorted(shapes, key=lambda s: -s["area"])[:1]
        if cid in fixes.get("keep_near", {}):
            pts = np.array(fixes["keep_near"][cid], float)
            shapes = [s for s in shapes
                      if np.min(np.hypot(*(pts - np.mean(s["rings"][0], axis=0)).T)) < 40]
        if cid in fixes.get("replace", []):
            shapes = []
        for x, y, r in fixes.get("add_circle", {}).get(cid, []):
            ring = [[round(x + r * np.cos(t)), round(y + r * np.sin(t))] for t in np.linspace(0, 2 * np.pi, 16, endpoint=False)]
            shapes.append({"area": round(np.pi * r * r), "rings": [ring]})
        result[cid] = shapes
        npts = sum(len(r) for s in shapes for r in s["rings"])
        print(f"{cid:10s} {len(shapes):4d} shapes {npts:6d} points")

    out = {
        "source": "OpenOrganelle jrc_hela-2 (Janelia COSEM), CC BY 4.0",
        "planeYnm": Y_NM, "cropXnm": CROP_X, "cropZnm": CROP_Z,
        "removedRows": [int(bad_rows()[0]), int(len(bad_rows()))],
        "nmPerPx": NM_PER_PX, "width": W, "height": H,
        "shapes": {k: [s["rings"] for s in v] for k, v in result.items()},
    }
    out_json = os.path.join(REPO, "demos/src/cellexplorer/outlines.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"outlines {os.path.getsize(out_json) / 1e3:.0f} kB")

    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        colours = dict(pm="#8a6a12", nucleus="#6b4fa0", ne="#b39ddb", nucleolus="#3d2a66", er="#2a7f8f",
                       golgi="#d9822b", mito="#a8324a", endolyso="#2e8b57", ld="#c9a400",
                       cent="#ff00ff")
        rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        allc = rgb.copy()
        for cid, shapes in result.items():
            col = tuple(int(colours[cid][i:i + 2], 16) for i in (5, 3, 1))
            one = rgb.copy()
            for k, s in enumerate(shapes):
                pts = [np.array(r, np.int32) for r in s["rings"]]
                cv2.polylines(one, pts, True, col, 3)
                cv2.polylines(allc, pts, True, col, 3)
                x, y = pts[0][0]
                if cid not in ("er",):
                    cv2.putText(one, str(k), (int(x), int(y)), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
            cv2.imwrite(os.path.join(args.preview, f"{cid}.jpg"), one, [cv2.IMWRITE_JPEG_QUALITY, 80])
        cv2.imwrite(os.path.join(args.preview, "all.jpg"), allc, [cv2.IMWRITE_JPEG_QUALITY, 80])
        cv2.imwrite(os.path.join(args.preview, "all_small.jpg"), cv2.resize(allc, (W // 2, H // 2), interpolation=cv2.INTER_AREA))


if __name__ == "__main__":
    main()
