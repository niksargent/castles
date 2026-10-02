"""
Tapestry asset weaver.

Reads world/photos.json and the source photos in photos/, and writes everything the
browser world needs into world/generated/:

  photos/<id>.dat        projector images (2400 px), tile-scrambled - not viewable as image files
  thumbs/<id>.dat        small scrambled images for the atlas UI
  masks/<id>.png         sky mask (white = sky / infinitely far) from the skyline polyline
  sky/<id>.jpg           360-degree upper-hemisphere sky panorama woven from the photo's clouds
  swatches/<name>.jpg    seamless material tiles re-woven from photo crops (image quilting)
  grades.png             one 256-px gradient-map row per photo (luminance -> photo colour)
  grain/<id>.jpg         the photo's own surface texture (grain / canvas / grunge), high-passed
  world.json             merged manifest + derived lighting data the runtime reads

Usage:  python tools/build_assets.py [--only swatches,sky,...] [--photos id1,id2]
"""
import json, os, sys, math, argparse, time
import numpy as np
from PIL import Image, ImageOps, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "photos")
OUT = os.path.join(ROOT, "world", "generated")
MANIFEST = os.path.join(ROOT, "world", "photos.json")

Image.MAX_IMAGE_PIXELS = None
rng = np.random.default_rng(7)


def ensure(*p):
    d = os.path.join(OUT, *p)
    os.makedirs(d, exist_ok=True)
    return d


_cache = {}


def load_photo(fname):
    if fname not in _cache:
        im = Image.open(os.path.join(PHOTOS, fname))
        im = ImageOps.exif_transpose(im).convert("RGB")
        _cache[fname] = im
    return _cache[fname]


def to_f(im):
    return np.asarray(im, dtype=np.float32) / 255.0


def to_im(a):
    return Image.fromarray(np.clip(a * 255.0 + 0.5, 0, 255).astype(np.uint8))


def crop_pct(im, r):
    W, H = im.size
    return im.crop((int(W * r[0] / 100), int(H * r[1] / 100), int(W * r[2] / 100), int(H * r[3] / 100)))


# ---------------------------------------------------------------- quilting
def _min_cut_path(err):
    """err: (h, w) overlap error, returns for each row the column index of the cut (vertical seam)."""
    h, w = err.shape
    cost = err.copy()
    for i in range(1, h):
        prev = cost[i - 1]
        left = np.r_[np.inf, prev[:-1]]
        right = np.r_[prev[1:], np.inf]
        cost[i] += np.minimum(np.minimum(left, prev), right)
    path = np.zeros(h, dtype=np.int32)
    path[-1] = int(np.argmin(cost[-1]))
    for i in range(h - 2, -1, -1):
        j = path[i + 1]
        lo, hi = max(0, j - 1), min(w, j + 2)
        path[i] = lo + int(np.argmin(cost[i, lo:hi]))
    return path


def quilt(src, out_h, out_w, patch=64, overlap=None, candidates=250, guide=None, guide_tol=0.12, rotate=False, feather=0):
    """Efros-Freeman image quilting.
    guide: optional function(out_row_frac) -> preferred source row fraction (keeps vertical structure, used for skies).
    rotate: patches may be taken from the source rotated by 90/180/270 degrees (isotropic ground textures)."""
    if overlap is None:
        overlap = patch // 5
    sh, sw, _ = src.shape
    if sh < patch + 2 or sw < patch + 2:
        s = (patch + 2) / min(sh, sw)
        src = to_f(to_im(src).resize((int(sw * s) + 1, int(sh * s) + 1), Image.LANCZOS))
        sh, sw, _ = src.shape
    if rotate:
        variants = [src, np.rot90(src, 1).copy(), np.rot90(src, 2).copy(), np.rot90(src, 3).copy()]
        out = _quilt_multi(variants, out_h, out_w, patch, overlap, candidates)
        return out
    step = patch - overlap
    ny = int(math.ceil((out_h - overlap) / step))
    nx = int(math.ceil((out_w - overlap) / step))
    H = ny * step + overlap
    W = nx * step + overlap
    out = np.zeros((H, W, 3), np.float32)
    maxy, maxx = sh - patch, sw - patch
    for iy in range(ny):
        for ix in range(nx):
            y, x = iy * step, ix * step
            if guide is not None:
                f = guide((y + patch / 2) / H)
                cy = f * sh - patch / 2
                lo = int(np.clip(cy - guide_tol * sh, 0, maxy))
                hi = int(np.clip(cy + guide_tol * sh, 0, maxy))
                if hi <= lo:
                    hi = min(maxy, lo + 1)
                ys = rng.integers(lo, hi + 1, candidates)
            else:
                ys = rng.integers(0, maxy + 1, candidates)
            xs = rng.integers(0, maxx + 1, candidates)
            if iy == 0 and ix == 0:
                k = 0
            else:
                errs = np.zeros(candidates, np.float32)
                if ix > 0:
                    tgt = out[y:y + patch, x:x + overlap]
                    for c in range(candidates):
                        d = src[ys[c]:ys[c] + patch, xs[c]:xs[c] + overlap] - tgt
                        errs[c] += np.sum(d * d)
                if iy > 0:
                    tgt = out[y:y + overlap, x:x + patch]
                    for c in range(candidates):
                        d = src[ys[c]:ys[c] + overlap, xs[c]:xs[c] + patch] - tgt
                        errs[c] += np.sum(d * d)
                m = errs.min()
                good = np.nonzero(errs <= m * 1.1 + 1e-6)[0]
                k = int(rng.choice(good))
            p = src[ys[k]:ys[k] + patch, xs[k]:xs[k] + patch].copy()
            mask = np.ones((patch, patch), bool)
            if ix > 0:
                e = np.sum((p[:, :overlap] - out[y:y + patch, x:x + overlap]) ** 2, axis=2)
                path = _min_cut_path(e)
                for r in range(patch):
                    mask[r, :path[r]] = False
            if iy > 0:
                e = np.sum((p[:overlap, :] - out[y:y + overlap, x:x + patch]) ** 2, axis=2)
                path = _min_cut_path(e.T)
                for cc in range(patch):
                    mask[:path[cc], cc] = False
            region = out[y:y + patch, x:x + patch]
            if feather and (ix > 0 or iy > 0):
                from scipy.ndimage import gaussian_filter
                m = gaussian_filter(mask.astype(np.float32), feather)
                if ix == 0: m[:, :] = np.where(np.arange(patch)[:, None] >= 0, m, m)
                m = m[..., None]
                region[:] = region * (1 - m) + p * m
            else:
                region[mask] = p[mask]
    return out[:out_h, :out_w]


def _quilt_multi(variants, out_h, out_w, patch, overlap, candidates):
    step = patch - overlap
    ny = int(math.ceil((out_h - overlap) / step))
    nx = int(math.ceil((out_w - overlap) / step))
    H, W = ny * step + overlap, nx * step + overlap
    out = np.zeros((H, W, 3), np.float32)
    for iy in range(ny):
        for ix in range(nx):
            y, x = iy * step, ix * step
            vs = rng.integers(0, len(variants), candidates)
            cands = []
            for c in range(candidates):
                v = variants[vs[c]]
                yy = rng.integers(0, v.shape[0] - patch + 1)
                xx = rng.integers(0, v.shape[1] - patch + 1)
                cands.append((vs[c], yy, xx))
            if iy == 0 and ix == 0:
                k = 0
            else:
                errs = np.zeros(candidates, np.float32)
                for c, (vi, yy, xx) in enumerate(cands):
                    v = variants[vi]
                    if ix > 0:
                        d = v[yy:yy + patch, xx:xx + overlap] - out[y:y + patch, x:x + overlap]
                        errs[c] += np.sum(d * d)
                    if iy > 0:
                        d = v[yy:yy + overlap, xx:xx + patch] - out[y:y + overlap, x:x + patch]
                        errs[c] += np.sum(d * d)
                m = errs.min()
                k = int(rng.choice(np.nonzero(errs <= m * 1.1 + 1e-6)[0]))
            vi, yy, xx = cands[k]
            p = variants[vi][yy:yy + patch, xx:xx + patch].copy()
            mask = np.ones((patch, patch), bool)
            if ix > 0:
                e = np.sum((p[:, :overlap] - out[y:y + patch, x:x + overlap]) ** 2, axis=2)
                path = _min_cut_path(e)
                for r in range(patch):
                    mask[r, :path[r]] = False
            if iy > 0:
                e = np.sum((p[:overlap, :] - out[y:y + overlap, x:x + patch]) ** 2, axis=2)
                path = _min_cut_path(e.T)
                for cc in range(patch):
                    mask[:path[cc], cc] = False
            region = out[y:y + patch, x:x + patch]
            region[mask] = p[mask]
    return out[:out_h, :out_w]


def flatten_lowfreq(a, sigma=40, strength=1.0):
    """Even out broad light/dark patches (sun streaks, shadow bands) while keeping texture detail and
    the overall colour: divide by a wrapped large-scale blur of the luminance."""
    from scipy.ndimage import gaussian_filter
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    low = gaussian_filter(lum, sigma, mode="wrap")
    mean = lum.mean()
    gain = (mean / np.maximum(low, 1e-3)) ** strength
    out = a * gain[..., None]
    # also pull the large-scale hue toward the average
    for c in range(3):
        lc = gaussian_filter(out[..., c], sigma, mode="wrap")
        out[..., c] += (out[..., c].mean() - lc) * 0.6 * strength
    return np.clip(out, 0, 1)


def make_seamless(a, axes=(0, 1), band=0.22):
    """Make the texture wrap: per axis, blend with a copy rolled by half along that axis only
    (so the copy's own seam sits where the original is used). Irregular, variance-preserving
    blend so the transition doesn't read as a soft cross-fade."""
    out = a
    for ax in (1, 0):
        if ax not in axes:
            continue
        h, w, _ = out.shape
        r = np.roll(out, (w if ax == 1 else h) // 2, axis=ax)
        n = w if ax == 1 else h
        t = np.linspace(0, 1, n)
        d = np.minimum(t, 1 - t)
        d = d[None, :] if ax == 1 else d[:, None]
        noise = to_f(Image.fromarray((rng.random((max(4, h // 40), max(4, w // 40))) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC))
        d = d + (noise - 0.5) * band * 0.6
        wgt = np.clip((d - band * 0.3) / (band * 0.5), 0, 1)[..., None]
        mean = out.reshape(-1, 3).mean(0)
        norm = np.sqrt(wgt ** 2 + (1 - wgt) ** 2)
        out = np.clip(mean + ((out - mean) * wgt + (r - mean) * (1 - wgt)) / norm, 0, 1)
    return out


# ---------------------------------------------------------------- geometry helpers
def poly_mask(size, skyline, feather=3):
    W, H = size
    pts = [(x * W / 100.0, y * H / 100.0) for x, y in skyline]
    poly = [(0, 0)] + [(pts[0][0] * 0, pts[0][1])] + pts + [(W, pts[-1][1]), (W, 0)]
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return m


def refined_mask(img, p, mw=1024):
    """Sky mask from the hand-drawn skyline, refined by colour inside a narrow band around it:
    each band pixel goes to whichever is closer — the sky just above or the solid just below."""
    W0, H0 = img.size
    mh = int(round(mw * H0 / W0))
    a = to_f(img.resize((mw, mh), Image.LANCZOS))
    prior = to_f(poly_mask((mw, mh), p["skyline"], feather=0)) > 0.5
    # skyline row per column from the prior (first solid pixel from the top)
    solid = ~prior
    first = np.where(solid.any(0), solid.argmax(0), mh)
    b = max(3, int(mh * p.get("maskBand", 0.035)))
    out = prior.copy()
    win = 6
    rows = first.astype(np.float32).copy()
    pocket = np.zeros_like(prior)
    for x in range(mw):
        y0 = int(first[x])
        if y0 <= 2 or y0 >= mh - 2:
            continue
        x0, x1 = max(0, x - win), min(mw, x + win + 1)
        sa, sb = max(0, y0 - 3 * b), max(1, y0 - b)
        ga, gb = min(mh - 1, y0 + b), min(mh, y0 + 3 * b)
        if sb - sa < 2 or gb - ga < 2:
            continue
        sky = np.median(a[sa:sb, x0:x1].reshape(-1, 3), 0)
        gnd = np.median(a[ga:gb, x0:x1].reshape(-1, 3), 0)
        if np.sum((sky - gnd) ** 2) < 0.004:
            continue  # indistinguishable: keep the drawn line
        ya, yb = max(0, y0 - b), min(mh, y0 + b)
        band = a[ya:yb, x]
        skyish = (np.sum((band - sky) ** 2, 1) < np.sum((band - gnd) ** 2, 1)).astype(np.int32)
        # single best split row k: sky above, solid below (fewest disagreements)
        n = len(skyish)
        above_bad = np.concatenate([[0], np.cumsum(1 - skyish)])        # non-sky pixels above k
        below_bad = np.concatenate([np.cumsum(skyish[::-1])[::-1], [0]])  # sky-like pixels at/below k
        cost = (above_bad + below_bad).astype(np.float32)
        # the hand-drawn line is close: allow the split to move up freely but only a little down
        kmax = min(n, (y0 - ya) + max(2, b // 3))
        cost[kmax + 1:] = 1e9
        k = int(np.argmin(cost))
        rows[x] = ya + k
        # sky pockets below the boundary (gaps between chimneys / dormers): only clear matches
        pa, pb = max(0, ya + k), min(mh, y0 + 2 * b)
        if pb > pa:
            seg = a[pa:pb, x]
            dS = np.sum((seg - sky) ** 2, 1); dG = np.sum((seg - gnd) ** 2, 1)
            pocket[pa:pb, x] = (dS < 0.06 * dG) & (dS < 0.0025)
    # smooth the boundary across columns (median) but keep sharp verticals of towers
    from scipy.ndimage import median_filter
    rows = median_filter(rows, size=5, mode="nearest")
    yy = np.arange(mh)[:, None]
    refined = yy < rows[None, :]
    # only override the prior inside the band (columns that had a boundary)
    has = (first > 2) & (first < mh - 2)
    out[:, has] = refined[:, has] | (prior[:, has] & (yy < (first[None, has] - b)))
    # keep only pockets that are blobs, not single noisy pixels
    from scipy.ndimage import binary_opening
    out |= binary_opening(pocket, structure=np.ones((3, 3)))
    # region growing: let the sky creep into neighbouring pixels of the same colour as the local sky
    from scipy.ndimage import binary_dilation, gaussian_filter, distance_transform_edt
    zone = distance_transform_edt(~prior) < mh * p.get("growZone", 0.035)
    for _ in range(int(mh * 0.09)):
        sk = out.astype(np.float32)
        wsum = gaussian_filter(sk, 5) + 1e-4
        est = np.stack([gaussian_filter(a[..., c] * sk, 5) / wsum for c in range(3)], -1)
        cand = binary_dilation(out) & ~out & zone
        if not cand.any():
            break
        d = np.sum((a - est) ** 2, -1)
        acc = cand & (d < p.get("growThresh", 0.004))
        if not acc.any():
            break
        out |= acc
    # clean up: sky must hang from the top of the band (no floating specks), smooth edges
    m = Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    return m.filter(ImageFilter.GaussianBlur(0.8))


def cam_basis(yaw, pitch):
    y, p = math.radians(yaw), math.radians(pitch)
    fwd = np.array([math.sin(y) * math.cos(p), math.sin(p), -math.cos(y) * math.cos(p)])
    right = np.array([math.cos(y), 0.0, math.sin(y)])
    up = np.cross(right, fwd)
    return fwd, right, up


# ---------------------------------------------------------------- stages
PHOTO_EDGE = 2400      # long edge of the published projector images
THUMB_EDGE = 640
TILE = 64              # scramble tile size (multiple of the JPEG 16 px MCU, so tiles never bleed)
NOTICE = b"(c) Nik Sargent - all rights reserved. Not for reuse."


def _mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nxt


def _seed_for(name):
    h = 2166136261
    for ch in name.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


def write_scrambled(img, path, name, quality=90):
    """Publish a photograph as a tile-shuffled, header-obfuscated .dat (not a viewable image).
    Format: b'TPS1' | u16 width | u16 height | u16 tile | u16 cols | u16 rows | u32 seed |
            u16 notice length | notice | u32 jpeg length | jpeg bytes (first 2 KB XOR-masked)."""
    import io, struct
    W, H = img.size
    cols, rows = -(-W // TILE), -(-H // TILE)
    canvas = Image.new("RGB", (cols * TILE, rows * TILE))
    canvas.paste(img, (0, 0))
    # pad by edge-extension so padded tiles compress cleanly
    a = np.asarray(canvas).copy()
    a[H:, :W] = a[H - 1:H, :W]
    a[:, W:] = a[:, W - 1:W]
    canvas = Image.fromarray(a)
    seed = _seed_for(name)
    rnd = _mulberry32(seed)
    n = cols * rows
    perm = list(range(n))
    for i in range(n - 1, 0, -1):
        j = int(rnd() * (i + 1))
        perm[i], perm[j] = perm[j], perm[i]
    out = Image.new("RGB", canvas.size)
    for i, src in enumerate(perm):
        sx, sy = (src % cols) * TILE, (src // cols) * TILE
        dx, dy = (i % cols) * TILE, (i // cols) * TILE
        out.paste(canvas.crop((sx, sy, sx + TILE, sy + TILE)), (dx, dy))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=quality)
    jpg = bytearray(buf.getvalue())
    k = _mulberry32(seed ^ 0x5A5A5A5A)
    for i in range(min(2048, len(jpg))):
        jpg[i] ^= int(k() * 256)
    with open(path, "wb") as f:
        f.write(b"TPS1" + struct.pack("<HHHHHI", W, H, TILE, cols, rows, seed))
        f.write(struct.pack("<H", len(NOTICE)) + NOTICE)
        f.write(struct.pack("<I", len(jpg)) + bytes(jpg))


def stage_photos(cfg, ids):
    dp, dt, dm = ensure("photos"), ensure("thumbs"), ensure("masks")
    for p in cfg["photos"]:
        if ids and p["id"] not in ids:
            continue
        im = load_photo(p["file"])
        big = im.copy()
        big.thumbnail((PHOTO_EDGE, PHOTO_EDGE), Image.LANCZOS)
        write_scrambled(big, os.path.join(dp, p["id"] + ".dat"), p["id"])
        th = im.copy()
        th.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.LANCZOS)
        write_scrambled(th, os.path.join(dt, p["id"] + ".dat"), p["id"] + "/thumb", quality=85)
        # no plain copies are published
        for d in (dp, dt):
            old = os.path.join(d, p["id"] + ".jpg")
            if os.path.exists(old):
                os.remove(old)
        m = refined_mask(big, p)
        m.save(os.path.join(dm, p["id"] + ".png"))
        print("photo", p["id"], big.size)


def stage_swatches(cfg, names):
    d = ensure("swatches")
    photos = {p["id"]: p for p in cfg["photos"]}
    for name, sw in cfg["swatches"].items():
        if name.startswith("_"):
            continue
        if names and name not in names:
            continue
        t0 = time.time()
        im = load_photo(photos[sw["photo"]]["file"])
        c = crop_pct(im, sw["rect"])
        if sw.get("vstretch"):
            # undo perspective foreshortening of ground seen at a grazing angle
            c = c.resize((c.size[0], int(c.size[1] * sw["vstretch"])), Image.LANCZOS)
        # keep native detail but cap the source so quilting stays quick
        maxside = sw.get("maxsrc", 900)
        if max(c.size) > maxside:
            c.thumbnail((maxside, maxside), Image.LANCZOS)
        src = to_f(c)
        size = sw.get("size", 1024)
        patch = sw.get("patch", 96)
        q = quilt(src, size, size, patch=sw.get("patch", 64 if sw.get("rotate") else patch), candidates=200, rotate=sw.get("rotate", False))
        q = make_seamless(q)
        if sw.get("flatten"):
            q = flatten_lowfreq(q, sigma=sw.get("flattenSigma", 40), strength=sw["flatten"])
        to_im(q).save(os.path.join(d, name + ".jpg"), quality=90)
        print(f"swatch {name}: src {c.size} -> {size} in {time.time()-t0:.1f}s")


def stage_grades(cfg):
    rows = []
    stats = {}
    for p in cfg["photos"]:
        im = load_photo(p["file"]).copy()
        im.thumbnail((700, 700), Image.LANCZOS)
        a = to_f(im).reshape(-1, 3)
        lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        bins = np.clip((lum * 255).astype(int), 0, 255)
        cnt = np.bincount(bins, minlength=256).astype(np.float32)
        row = np.zeros((256, 3), np.float32)
        for ch in range(3):
            row[:, ch] = np.bincount(bins, weights=a[:, ch], minlength=256)
        valid = cnt > 3
        xs = np.arange(256)
        for ch in range(3):
            v = np.where(valid, row[:, ch] / np.maximum(cnt, 1), np.nan)
            good = ~np.isnan(v)
            if good.sum() < 2:
                v = xs / 255.0
            else:
                v = np.interp(xs, xs[good], v[good])
            row[:, ch] = v
        # beyond the photo's tonal range, extend towards black / the photo's brightest tone
        lo, hi = xs[valid].min(), xs[valid].max()
        for i in range(lo):
            row[i] = row[lo] * (i / max(lo, 1))
        for i in range(hi + 1, 256):
            t = (i - hi) / max(255 - hi, 1)
            row[i] = row[hi] * (1 - t) + np.array([1, 1, 1]) * t * row[hi].max() / max(row[hi].mean(), 1e-3) * row[hi].mean()
        # smooth
        k = np.exp(-np.linspace(-2, 2, 15) ** 2)
        k /= k.sum()
        for ch in range(3):
            row[:, ch] = np.convolve(np.pad(row[:, ch], 7, mode="edge"), k, mode="valid")
        rows.append(row)
        # cumulative luminance histogram (for tone matching)
        cdf = np.cumsum(cnt) / cnt.sum()
        pct = [float(np.searchsorted(cdf, q) / 255.0) for q in (0.05, 0.5, 0.95)]
        stats[p["id"]] = {"lum_p05": pct[0], "lum_p50": pct[1], "lum_p95": pct[2]}
    img = np.stack(rows, 0)
    to_im(img).save(os.path.join(OUT, "grades.png"))
    return stats


def mean_rect(im, r, mask=None):
    c = to_f(crop_pct(im, r))
    return c.reshape(-1, 3).mean(0)


def stage_light(cfg):
    """Derive per-photo lighting: sky colours, fog colour, sun direction (brightest sky blob)."""
    out = {}
    for p in cfg["photos"]:
        im = load_photo(p["file"]).copy()
        im.thumbnail((600, 600), Image.LANCZOS)
        W, H = im.size
        a = to_f(im)
        m = to_f(poly_mask((W, H), p["skyline"], feather=0))
        m = m > 0.5
        hz = p["horizon"] / 100.0
        rows = np.arange(H)[:, None] / H
        skyw = m.astype(np.float32)
        # zenith-ish (top 20%) and horizon band (just above the skyline)
        top = a[: int(H * 0.15)].reshape(-1, 3).mean(0)
        band = m & (rows > 0.0)
        # horizon colour: sky pixels in the lowest 30% of the sky region per column
        hcol = []
        for x in range(0, W, 4):
            col = np.nonzero(m[:, x])[0]
            if len(col) > 5:
                lowest = col[-max(3, len(col) // 4):]
                hcol.append(a[lowest, x].mean(0))
        horizon = np.mean(hcol, 0) if hcol else top
        # ground colour: below the horizon line
        ground = a[int(H * min(0.95, hz + 0.05)):].reshape(-1, 3).mean(0)
        # brightest sky blob -> sun direction
        lum = (a @ np.array([0.2126, 0.7152, 0.0722], np.float32)) * skyw
        blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(W / 25)), np.float32)
        yy, xx = np.unravel_index(np.argmax(blur), blur.shape)
        sun_col = a[max(0, yy - 6):yy + 6, max(0, xx - 6):xx + 6].reshape(-1, 3).mean(0)
        cam = p["camera"]
        vf = math.radians(cam["vfov"])
        aspect = W / H
        hf = 2 * math.atan(math.tan(vf / 2) * aspect)
        nx = (xx / W - 0.5) * 2
        ny = (0.5 - yy / H) * 2
        fwd, right, up = cam_basis(cam["yaw"], cam["pitch"])
        d = fwd + right * nx * math.tan(hf / 2) + up * ny * math.tan(vf / 2)
        d /= np.linalg.norm(d)
        # keep the sun reasonably high so the scene is lit, but in the photo's direction
        el = max(math.degrees(math.asin(d[1])), 14)
        az = math.degrees(math.atan2(d[0], -d[2]))
        out[p["id"]] = {
            "skyTop": top.tolist(), "skyHorizon": horizon.tolist(), "ground": ground.tolist(),
            "sunColor": sun_col.tolist(), "sunAz": az, "sunEl": el,
            "mean": a.reshape(-1, 3).mean(0).tolist(),
        }
        if p.get("water"):
            out[p["id"]]["water"] = mean_rect(im, p["water"]).tolist()
        # hill colour: solid pixels in a band just below the skyline, outside the castle's columns
        cx = p.get("castleX", [40, 60])
        solid = ~m
        firstSolid = np.where(solid.any(0), solid.argmax(0), H)
        cols = []
        band = max(4, int(H * 0.12))
        for x in range(W):
            xp = x / W * 100
            if cx[0] - 3 <= xp <= cx[1] + 3:
                continue
            y0 = int(firstSolid[x])
            if y0 >= H - 2:
                continue
            seg = a[y0 + 2:min(H, y0 + band), x]
            if len(seg):
                cols.append(seg)
        if cols:
            hp = np.concatenate(cols, 0)
            # favour the more saturated half (heather, bracken) over grey haze
            sat = hp.max(1) - hp.min(1)
            keep = sat >= np.median(sat)
            out[p["id"]]["hill"] = hp[keep].mean(0).tolist()
        print("light", p["id"], "sun az %.0f el %.0f" % (az, el))
    return out


def stage_sky(cfg, ids):
    """A seamless cloud tile per photo, cut from its largest clean sky region at its natural
    aspect (wrapping in both directions). The sky shader lays it on a plane overhead, so the
    clouds recede naturally to the horizon without stretching."""
    d = ensure("sky")
    for p in cfg["photos"]:
        if ids and p["id"] not in ids:
            continue
        t0 = time.time()
        im = load_photo(p["file"])
        rects = sorted(p["sky"], key=lambda r: -(r[2] - r[0]) * (r[3] - r[1]))
        c = crop_pct(im, rects[0])
        w, h = c.size
        # keep the clouds' native pixel scale (no stretching). Build a taller tile by stacking
        # three horizontally-offset copies of the photo's own cloud strip with soft blends.
        scale = min(1.0, 2400 / w, 900 / h)
        if h * scale < 200:
            scale = 200 / h
        W, H = int(w * scale), int(h * scale)
        strip = make_seamless(to_f(c.resize((W, H), Image.LANCZOS)), axes=(1,), band=0.2)
        copies = [strip, np.roll(strip[:, ::-1], W // 3, axis=1), np.roll(strip, (2 * W) // 3, axis=1)]
        if H > 600:
            copies = copies[:1]
        ov = int(H * 0.38)
        tile = copies[0]
        for cpy in copies[1:]:
            t = np.linspace(0, 1, ov)[:, None, None]
            t = t * t * (3 - 2 * t)
            blend = tile[-ov:] * (1 - t) + cpy[:ov] * t
            tile = np.concatenate([tile[:-ov], blend, cpy[ov:]], 0)
        a = make_seamless(tile, axes=(0,), band=0.3)
        to_im(a).save(os.path.join(d, p["id"] + ".jpg"), quality=90)
        print(f"sky {p['id']} {W}x{H} in {time.time()-t0:.1f}s")


def stage_grain(cfg, ids):
    """The photo's own surface: high-pass of a sky region, as a seamless greyscale tile."""
    d = ensure("grain")
    for p in cfg["photos"]:
        if ids and p["id"] not in ids:
            continue
        im = load_photo(p["file"])
        r = p["sky"][0]
        c = crop_pct(im, r)
        c.thumbnail((1400, 1400), Image.LANCZOS)
        g = np.asarray(c.convert("L"), np.float32) / 255
        low = np.asarray(c.convert("L").filter(ImageFilter.GaussianBlur(6)), np.float32) / 255
        hp = g - low
        hp = hp / (np.std(hp) * 6 + 1e-4) + 0.5
        hp = np.clip(hp, 0, 1)
        h, w = hp.shape
        side = min(h, w, 512)
        hp = hp[:side, :side] if h >= side and w >= side else np.asarray(Image.fromarray((hp * 255).astype(np.uint8)).resize((512, 512)), np.float32) / 255
        t = make_seamless(np.repeat(hp[..., None], 3, 2))
        to_im(t).convert("L").save(os.path.join(d, p["id"] + ".jpg"), quality=90)


def stage_seaweed(cfg):
    """Floating weed on the loch: colour from photo crop, alpha from how un-water-like it is."""
    d = ensure("swatches")
    sw = cfg["swatches"]["seaweed_water"]
    photos = {p["id"]: p for p in cfg["photos"]}
    im = load_photo(photos[sw["photo"]]["file"])
    c = crop_pct(im, sw["rect"])
    c.thumbnail((1024, 1024), Image.LANCZOS)
    a = to_f(c)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # weed is warm (r,g > b); water is cool
    warm = np.clip(((r + g) * 0.5 - b) * 6.0 - 0.15, 0, 1)
    warm = np.asarray(Image.fromarray((warm * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1)), np.float32) / 255
    rgba = np.dstack([a, warm])
    # make seamless (alpha too)
    rgb = make_seamless(rgba[..., :3])
    al = make_seamless(np.repeat(rgba[..., 3:4], 3, 2))[..., 0]
    out = np.dstack([rgb, al])
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(d, "seaweed.png"))
    print("seaweed", c.size)


def contact_sheet():
    d = os.path.join(OUT, "swatches")
    files = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
    n = len(files)
    cols = 6
    rows = (n + cols - 1) // cols
    S = 256
    sheet = Image.new("RGB", (cols * S, rows * (S + 18)), (20, 20, 20))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(d, f)).convert("RGB").resize((S, S))
        x, y = (i % cols) * S, (i // cols) * (S + 18)
        sheet.paste(im, (x, y + 18))
        dr.text((x + 4, y + 3), f[:-4], fill=(255, 255, 0))
    sheet.save(os.path.join(OUT, "_swatches_sheet.jpg"), quality=85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="photos,swatches,grades,light,sky,grain,seaweed,world")
    ap.add_argument("--photos", default="")
    ap.add_argument("--swatches", default="")
    args = ap.parse_args()
    stages = set(args.only.split(","))
    ids = set(filter(None, args.photos.split(",")))
    names = set(filter(None, args.swatches.split(",")))
    cfg = json.load(open(MANIFEST, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    derived_path = os.path.join(OUT, "_derived.json")
    derived = json.load(open(derived_path)) if os.path.exists(derived_path) else {}
    if "photos" in stages:
        stage_photos(cfg, ids)
    if "swatches" in stages:
        stage_swatches(cfg, names)
        contact_sheet()
    if "seaweed" in stages:
        stage_seaweed(cfg)
    if "grades" in stages:
        derived["tone"] = stage_grades(cfg)
    if "light" in stages:
        derived["light"] = stage_light(cfg)
    if "sky" in stages:
        stage_sky(cfg, ids)
    if "grain" in stages:
        stage_grain(cfg, ids)
    json.dump(derived, open(derived_path, "w"), indent=1)
    if "world" in stages or True:
        world = {"photos": [], "swatches": [k for k in cfg["swatches"] if not k.startswith("_")]}
        for i, p in enumerate(cfg["photos"]):
            q = {k: v for k, v in p.items() if k not in ("skyline", "file")}
            q["index"] = i
            im = load_photo(p["file"])
            q["aspect"] = im.size[0] / im.size[1]
            q["light"] = derived.get("light", {}).get(p["id"], {})
            q["tone"] = derived.get("tone", {}).get(p["id"], {})
            world["photos"].append(q)
        means = {}
        for k in world["swatches"]:
            f = os.path.join(OUT, "swatches", k + ".jpg")
            if os.path.exists(f):
                means[k] = (np.asarray(Image.open(f).convert("RGB").resize((64, 64)), np.float32) / 255).reshape(-1, 3).mean(0).round(4).tolist()
        world["swatchMeans"] = means
        json.dump(world, open(os.path.join(OUT, "world.json"), "w"), indent=1)
        print("world.json written:", len(world["photos"]), "photos")


if __name__ == "__main__":
    main()
