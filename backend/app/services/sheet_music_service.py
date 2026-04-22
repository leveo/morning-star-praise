"""Sheet-music-to-PPT alignment.

Phase 1: user uploads a sheet-music image or PDF; we detect staff systems,
split the original image into per-slide regions so each slide's crop shows
the portion of sheet that corresponds to its lyric chunk.

``oemer`` (pure-Python OMR) is used to detect staff systems — we only need
the pixel bounding boxes of each staff line system, NOT the full MusicXML.
The ORIGINAL image pixels are what gets shipped to the PPT, so OMR accuracy
only affects where we *slice*, never what the user sees.

oemer does not OCR lyric text, so phase 1 uses an equal-split heuristic:
distribute the detected staff systems evenly across the user's N lyric
chunks. Phase 1.5 will add optional lyric-to-staff matching by OCR'ing the
text band below each staff.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class StaffBox:
    """Pixel bounding box of a single staff line system on the source image."""
    page: int  # 0-based page index (PDF pages or multi-image uploads)
    y_top: int
    y_bottom: int
    x_left: int
    x_right: int


@dataclass(frozen=True, slots=True)
class CropRegion:
    """Pixel region of the original image to show on one PPT slide."""
    page: int
    y_top: int
    y_bottom: int
    x_left: int
    x_right: int


class OmrBackend(Protocol):
    """Identify staff systems + (optionally) bind lyrics to them.

    Implementations return raw staff boxes in source-image pixel coordinates.
    The caller decides how to split those across lyric chunks.
    """

    def detect_staffs(self, image_paths: list[Path]) -> list[StaffBox]:
        ...


# --------------------------------------------------------------------------
# homr backend (preferred). Runs via a separate Poetry venv in
# third_party/homr/ because homr isn't pip-installable into our main
# backend env. Produces MusicXML which we render with Verovio for a clean
# result. Dramatically better grand-staff + time/key/measure accuracy than
# oemer on printed hymnals.
# --------------------------------------------------------------------------


def _homr_dir() -> Path | None:
    candidate = Path(__file__).resolve().parents[3] / "third_party" / "homr"
    return candidate if (candidate / "pyproject.toml").exists() else None


def _poetry_bin() -> str | None:
    import shutil
    for explicit in (
        Path.home() / ".local" / "bin" / "poetry",
        Path("/opt/homebrew/bin/poetry"),
        Path("/usr/local/bin/poetry"),
    ):
        if explicit.exists():
            return str(explicit)
    found = shutil.which("poetry")
    return found


def run_homr(image_path: Path, work_dir: Path) -> Path | None:
    """Shell out to homr's CLI. Returns the resulting ``.musicxml`` path or
    None if homr isn't installed / the run fails. homr writes output next
    to its input, so we stage a copy inside ``work_dir``."""
    import shutil
    import subprocess

    homr_dir = _homr_dir()
    poetry = _poetry_bin()
    if homr_dir is None or poetry is None:
        logger.info("homr unavailable: homr_dir=%s poetry=%s", homr_dir, poetry)
        return None

    work_dir.mkdir(parents=True, exist_ok=True)
    # Sanitise the staged filename — homr sometimes struggles with Unicode /
    # spaces in paths; use a hashed ascii name.
    import hashlib
    digest = hashlib.sha1(str(image_path.resolve()).encode()).hexdigest()[:12]
    staged = work_dir / f"sheet_{digest}{image_path.suffix}"
    if not staged.exists():
        shutil.copy2(image_path, staged)

    try:
        proc = subprocess.run(
            [poetry, "run", "homr", str(staged)],
            cwd=str(homr_dir),
            timeout=360,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.warning("homr subprocess error: %s", e)
        return None

    if proc.returncode != 0:
        logger.warning("homr failed (%d): %s", proc.returncode, proc.stderr[-400:])
        return None
    out_xml = staged.with_suffix(".musicxml")
    return out_xml if out_xml.exists() else None


def render_musicxml_to_pngs(musicxml_path: Path, output_dir: Path) -> list[Path]:
    """Render a MusicXML file to one PNG per Verovio page."""
    import cairosvg
    import verovio

    output_dir.mkdir(parents=True, exist_ok=True)
    tk = verovio.toolkit()
    tk.setOptions({
        "pageHeight": 2970, "pageWidth": 2100, "scale": 60,
        "footer": "none", "header": "none", "breaks": "auto",
    })
    if not tk.loadFile(str(musicxml_path)):
        return []
    pages: list[Path] = []
    for page_idx in range(1, tk.getPageCount() + 1):
        svg = tk.renderToSVG(page_idx)
        out = output_dir / f"{musicxml_path.stem}_p{page_idx:02d}.png"
        cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            write_to=str(out),
            background_color="white",
        )
        pages.append(out)
    return pages


def detect_systems_on_clean_render(image_path: Path) -> list[StaffBox]:
    """Segment a Verovio-rendered clean PNG into visual staff systems.

    Verovio emits a full-A4 page whose bottom is usually a huge blank band
    (if the music doesn't fill the page). We crop to the content area first,
    then split on blank runs WITHIN the content area — that lets us use a
    small absolute gap threshold (≈20 rows) without treating trailing
    whitespace as a "system". Grand-staff braces keep treble + bass visually
    connected with zero blank rows between them, so we never split inside
    a grand staff.
    """
    import numpy as np
    from PIL import Image

    im = Image.open(image_path).convert("L")
    arr = np.asarray(im)
    h, w = arr.shape
    row_has_content = np.any(arr < 150, axis=1)

    # Clip to actual content — Verovio pages leave lots of trailing whitespace.
    content_rows = np.flatnonzero(row_has_content)
    if content_rows.size == 0:
        return []
    y_first, y_last = int(content_rows[0]), int(content_rows[-1])

    # Absolute threshold: between Verovio systems sits a visible gap of
    # roughly 20-40 rows; an intra-grand-staff "gap" is zero rows because
    # the brace glyph touches both staves.
    MIN_GAP = 18
    systems: list[tuple[int, int]] = []
    in_sys = False
    start = y_first
    blank = 0
    for y in range(y_first, y_last + 1):
        if row_has_content[y]:
            if not in_sys:
                start = y
                in_sys = True
            blank = 0
        else:
            blank += 1
            if in_sys and blank >= MIN_GAP:
                end = y - blank + 1
                systems.append((start, end))
                in_sys = False
    if in_sys:
        systems.append((start, y_last))

    return [
        StaffBox(page=0, y_top=max(0, s - 8), y_bottom=min(h - 1, e + 8), x_left=0, x_right=w)
        for s, e in systems
    ]


class HomrBackend:
    """homr + Verovio — produces a clean re-rendered sheet (no scan
    artefacts, no printed lyrics) and segments it by blank y-bands."""

    def detect_staffs(self, image_paths: list[Path]) -> list[StaffBox]:
        boxes: list[StaffBox] = []
        for page_idx, img_path in enumerate(image_paths):
            # The "image_paths" at this point are already Verovio-rendered
            # clean PNGs (the caller pre-renders), so we only need blank-band
            # segmentation. If somehow a raw scan was passed we'll return
            # whatever the segmentation finds — still valid, just coarser.
            for b in detect_systems_on_clean_render(img_path):
                boxes.append(StaffBox(
                    page=page_idx,
                    y_top=b.y_top, y_bottom=b.y_bottom,
                    x_left=b.x_left, x_right=b.x_right,
                ))
        return boxes


# --------------------------------------------------------------------------
# oemer backend — lazy-imports the model because loading the CNN is slow and
# the dependency is optional for users who don't want sheet-music support.
# --------------------------------------------------------------------------


def _apply_oemer_numpy_shim() -> None:
    """oemer 0.1.5 uses ``np.int`` / ``np.float`` / ``np.bool`` which numpy
    removed in 1.24. Alias them back to the builtins so staffline_extraction
    can run against modern numpy without monkey-patching site-packages."""
    import numpy as np

    for name, builtin in (("int", int), ("float", float), ("bool", bool), ("object", object)):
        if not hasattr(np, name):
            setattr(np, name, builtin)


def _ensure_oemer_weights() -> None:
    """Replicate oemer.ete.main's download check — generate_pred doesn't
    trigger it, so calling the API directly 404s on a fresh install."""
    import os
    from oemer.ete import MODULE_PATH, CHECKPOINTS_URL, download_file

    chk_path = os.path.join(MODULE_PATH, "checkpoints/unet_big/model.onnx")
    if os.path.exists(chk_path):
        return
    logger.warning("oemer weights missing — downloading (~500 MB, one-time)")
    for title, url in CHECKPOINTS_URL.items():
        save_dir = "unet_big" if title.startswith("1st") else "seg_net"
        save_dir = os.path.join(MODULE_PATH, "checkpoints", save_dir)
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, title.split("_", 1)[1])
        if os.path.exists(save_path):
            continue
        download_file(title, url, save_path)


class OemerBackend:
    """oemer-based OMR. Exposes staff bounding boxes in the original image
    coordinate system. Model weights (~500 MB) download on first use."""

    def detect_staffs(self, image_paths: list[Path]) -> list[StaffBox]:
        import tempfile

        _apply_oemer_numpy_shim()
        _ensure_oemer_weights()
        from oemer import layers
        from oemer.ete import generate_pred
        from oemer.staffline_extraction import extract as staff_extract
        import cv2

        boxes: list[StaffBox] = []
        for page_idx, img_path in enumerate(image_paths):
            with tempfile.TemporaryDirectory():
                # Each image is an independent pipeline run. ``layers`` is a
                # module-level registry in oemer; we reset it between pages.
                layers._layers = {}  # type: ignore[attr-defined]
                staff, symbols, stems_rests, notehead, clefs_keys = generate_pred(
                    str(img_path)
                )
                image = cv2.imread(str(img_path))
                image = cv2.resize(image, (staff.shape[1], staff.shape[0]))
                layers.register_layer("staff_pred", staff)
                layers.register_layer("symbols_pred", symbols + clefs_keys + stems_rests)
                layers.register_layer("stems_rests_pred", stems_rests)
                layers.register_layer("clefs_keys_pred", clefs_keys)
                layers.register_layer("notehead_pred", notehead)
                layers.register_layer("original_image", image)

                try:
                    staffs, _zones = staff_extract()
                except Exception as exc:
                    # oemer crashes with "max() iterable is empty" when its
                    # CNN finds no staves (clean synthetic images, photos
                    # without sheet content). Treat as "no staves" and keep
                    # going to the next page instead of 500-ing the request.
                    logger.info("oemer staff_extract failed on page %d: %s", page_idx, exc)
                    continue
                # oemer returns staves flat — e.g. for a hymnal sheet with 3
                # visual systems (each treble+bass) we get 6 staves. We want
                # one box per *visual system*, not per staff line, so we
                # group staves whose vertical gap is smaller than a typical
                # inter-system gap.
                import numpy as np
                flat = [s for s in np.asarray(staffs).ravel() if s is not None]
                if not flat:
                    continue
                page_systems = _group_staves_into_systems(flat)
                for group in page_systems:
                    boxes.append(StaffBox(
                        page=page_idx,
                        y_top=int(min(m.y_upper for m in group)),
                        y_bottom=int(max(m.y_lower for m in group)),
                        x_left=int(min(m.x_left for m in group)),
                        x_right=int(max(m.x_right for m in group)),
                    ))
        return boxes


def _group_staves_into_systems(staves: list) -> list[list]:
    """Cluster detected staff lines into visual systems by vertical proximity.

    Hymnals put treble + lyrics + bass in one "system"; oemer reports each
    staff separately. We sort by y, find the median gap between consecutive
    staves, and split into groups whenever a gap is noticeably larger than
    that median. For a sheet where all staves are equidistant (e.g. a single
    voice line per system) every stave ends up alone — that's correct too.
    """
    ordered = sorted(staves, key=lambda s: s.y_upper)
    if len(ordered) <= 1:
        return [ordered]

    gaps = [
        ordered[i + 1].y_upper - ordered[i].y_lower
        for i in range(len(ordered) - 1)
    ]
    median_gap = sorted(gaps)[len(gaps) // 2]
    # A gap > 1.4× the median signals "new system". Threshold is defensive —
    # hymnals tend to have inter-voice gaps ≈ inter-system gaps, so most of
    # the clusters happen at 1.0–1.3× and we don't want to split mid-system.
    split_threshold = max(median_gap * 1.4, 40)

    groups: list[list] = [[ordered[0]]]
    for i, gap in enumerate(gaps):
        if gap > split_threshold:
            groups.append([ordered[i + 1]])
        else:
            groups[-1].append(ordered[i + 1])

    # If we still ended up with an odd count that doesn't match a common
    # voice-per-system pattern, pair-merge consecutive single-member groups
    # so a treble/bass pair doesn't get split by a noisy median threshold.
    return _pair_singletons(groups)


def _pair_singletons(groups: list[list]) -> list[list]:
    """Fold consecutive groups into pairs when the group count is even.

    This handles the standard hymnal / choral layout of "treble staff + lyrics
    + bass staff" per visual system — oemer returns the treble and bass as
    separate groups even when they read as one. For single-voice scores with
    an even number of systems this over-merges, but the common case matters
    more; single-voice users can pre-split their sheet or we add a UI toggle
    later.
    """
    if len(groups) <= 1 or len(groups) % 2 != 0:
        return groups
    merged: list[list] = []
    for i in range(0, len(groups), 2):
        merged.append(groups[i] + groups[i + 1])
    return merged


# --------------------------------------------------------------------------
# Public API — input preparation + chunk splitting.
# --------------------------------------------------------------------------


def prepare_pages(upload_path: Path) -> list[Path]:
    """Normalize an upload to a list of page images.

    Images pass through; PDFs are rasterized into per-page PNGs next to the
    original file. Returns paths in reading order (page 1, 2, ...).
    """
    suffix = upload_path.suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return [upload_path]
    if suffix == ".pdf":
        from pdf2image import convert_from_path

        parent = upload_path.parent
        stem = upload_path.stem
        pages = convert_from_path(str(upload_path), dpi=200)
        out: list[Path] = []
        for i, page in enumerate(pages):
            p = parent / f"{stem}_page{i + 1:02d}.png"
            page.save(p, "PNG")
            out.append(p)
        return out
    raise ValueError(f"Unsupported sheet file type: {suffix}")


# Staff systems narrower than this fraction of the image width are dropped as
# likely artifacts (page-edge ledger lines, scanning noise). Anything real is
# at least a third of the page wide.
_MIN_STAFF_WIDTH_FRAC = 0.33


def _filter_and_sort_staffs(
    staffs: list[StaffBox], image_widths: dict[int, int],
) -> list[StaffBox]:
    filtered = [
        s for s in staffs
        if (s.x_right - s.x_left) >= _MIN_STAFF_WIDTH_FRAC * image_widths.get(s.page, 1)
    ]
    # Reading order: page first, then top-to-bottom.
    return sorted(filtered, key=lambda s: (s.page, s.y_top))


def split_across_chunks(
    staffs: list[StaffBox], num_chunks: int, image_widths: dict[int, int],
    *, ordered: list[StaffBox] | None = None, tight_crop: bool = False,
) -> list[CropRegion]:
    """Equal-distribute detected staff systems across ``num_chunks`` slides.

    ``tight_crop=True`` excludes the ~80px lyrics band typically printed
    under the staff — use this in crop mode where the scan contains
    printed lyrics we don't want bled into the slide (lyrics go in a
    separate PPT text box). In rebuild mode the Verovio render has no
    lyrics so the extra padding is harmless whitespace.
    """
    if num_chunks <= 0:
        return []
    if ordered is None:
        ordered = _filter_and_sort_staffs(staffs, image_widths)
    if not ordered:
        return []

    # When there are at least as many staff systems as chunks, greedy-split:
    # each chunk gets the next ceil(remaining / remaining_chunks) staffs so
    # sizes stay close to equal. When there are FEWER systems than chunks
    # (the hymnal case — 3 systems containing 4 verses' worth of lyrics for
    # ~12 slides), loop: each chunk i shows the staff system at ``i % N``
    # so every slide has a sheet fragment instead of trailing empties.
    def _to_region(group: list[StaffBox]) -> CropRegion | None:
        by_page: dict[int, list[StaffBox]] = {}
        for s in group:
            by_page.setdefault(s.page, []).append(s)
        # Emit one region per page present; hymnal case has a single page so
        # this degenerates to one region per call.
        out: list[CropRegion] = []
        for page, page_staffs in sorted(by_page.items()):
            if tight_crop and len(page_staffs) > 1:
                # Hymnal grand-staff systems are treble + bass with the
                # printed lyrics sandwiched between them; _pair_singletons
                # groups them as one system. Keeping only the topmost staff
                # excludes the lyric band entirely from the crop.
                page_staffs = [min(page_staffs, key=lambda s: s.y_top)]
            y_top = max(0, min(s.y_top for s in page_staffs) - 24)
            y_bottom = max(s.y_bottom for s in page_staffs) + (12 if tight_crop else 80)
            width = image_widths.get(page, page_staffs[0].x_right)
            out.append(CropRegion(
                page=page,
                y_top=y_top,
                y_bottom=y_bottom,
                x_left=0,
                x_right=width,
            ))
        return out[0] if out else None

    regions: list[CropRegion] = []
    if len(ordered) >= num_chunks:
        remaining = list(ordered)
        remaining_chunks = num_chunks
        while remaining_chunks > 0 and remaining:
            take = max(1, -(-len(remaining) // remaining_chunks))
            r = _to_region(remaining[:take])
            if r is not None:
                regions.append(r)
            remaining = remaining[take:]
            remaining_chunks -= 1
    else:
        # Cycle: chunk i → system i % len(ordered)
        per_system: list[CropRegion] = []
        for s in ordered:
            r = _to_region([s])
            if r is not None:
                per_system.append(r)
        if per_system:
            regions = [per_system[i % len(per_system)] for i in range(num_chunks)]

    return regions


def crop_region(source_image: Path, region: CropRegion, output: Path) -> Path:
    """Save a PNG crop of ``region`` from ``source_image`` to ``output``."""
    from PIL import Image

    with Image.open(source_image) as im:
        w, h = im.size
        box = (
            max(0, region.x_left),
            max(0, region.y_top),
            min(w, region.x_right),
            min(h, region.y_bottom),
        )
        im.crop(box).save(output, "PNG")
    return output


# --------------------------------------------------------------------------
# Module-level helpers so callers can use the feature without knowing about
# backends.
# --------------------------------------------------------------------------


def render_clean_pages(upload_pages: list[Path], work_dir: Path) -> list[Path]:
    """Run the OMR → MusicXML → Verovio render → clean PNG pipeline.

    Tries homr first (dramatically better grand-staff + measure accuracy on
    printed hymnals). Falls back to oemer when homr isn't installed or its
    subprocess fails — graceful degradation means pip-only users still get
    SOMETHING from the sheet-music feature.

    Returns the clean PNGs in page order. Empty list on total failure;
    caller then falls back to cropping the original scan.
    """
    import types

    work_dir.mkdir(parents=True, exist_ok=True)
    clean_pages: list[Path] = []

    for page_idx, page_path in enumerate(upload_pages):
        xml_path: Path | None = None

        # Primary: homr.
        homr_work = work_dir / "homr"
        xml_path = run_homr(page_path, homr_work)

        # Fallback: oemer. Keep the app usable when homr isn't set up.
        if xml_path is None:
            try:
                _apply_oemer_numpy_shim()
                _ensure_oemer_weights()
                from oemer.ete import extract as oemer_extract
                args = types.SimpleNamespace(
                    img_path=str(page_path),
                    output_path=str(work_dir),
                    use_tf=False,
                    save_cache=True,
                    without_deskew=False,
                )
                xml_path = Path(oemer_extract(args))
            except Exception:
                logger.exception("oemer fallback also failed for %s", page_path)
                continue

        page_dir = work_dir / f"p{page_idx:02d}"
        rendered = render_musicxml_to_pngs(xml_path, page_dir)
        clean_pages.extend(rendered)

    return clean_pages


SheetMode = Literal["rebuild", "crop"]


# In-memory cache of the expensive OMR output keyed by (upload_path, mode).
# OMR on a 2-page PDF costs ~2 min of oemer CPU; a session typically triggers
# 2-3 /analyze calls back-to-back (probe at num_chunks=1, full at final count,
# mode toggle), and without caching each pays the full toll. Cleared on
# backend restart — bounded by the upload sessions still on disk.
_OMR_CACHE: dict[tuple[str, str], tuple[list[Path], list[StaffBox], dict[int, int], list[StaffBox]]] = {}


def _cached_omr(
    upload_path: Path, mode: SheetMode,
) -> tuple[list[Path], list[StaffBox], dict[int, int], list[StaffBox]]:
    """Run the OMR pipeline once per (file, mode) and memoize the result."""
    from PIL import Image

    key = (str(upload_path.resolve()), mode)
    hit = _OMR_CACHE.get(key)
    if hit is not None:
        return hit

    original_pages = prepare_pages(upload_path)
    pages: list[Path] = []
    from_clean_render = False
    if mode == "rebuild":
        work_dir = upload_path.parent / "clean"
        pages = render_clean_pages(original_pages, work_dir)
        from_clean_render = bool(pages)
    if not pages:
        pages = original_pages

    widths: dict[int, int] = {}
    for i, p in enumerate(pages):
        with Image.open(p) as im:
            widths[i] = im.size[0]

    # Classical-CV blank-band segmentation on clean renders; oemer's pixel
    # detector on raw scans.
    backend: OmrBackend = HomrBackend() if from_clean_render else OemerBackend()
    staffs = backend.detect_staffs(pages)
    ordered = _filter_and_sort_staffs(staffs, widths)

    _OMR_CACHE[key] = (pages, staffs, widths, ordered)
    return pages, staffs, widths, ordered


def analyze(
    upload_path: Path, num_chunks: int, *, mode: SheetMode = "rebuild",
) -> tuple[list[Path], list[CropRegion], int]:
    """End-to-end: image/PDF → page images + per-chunk crop regions.

    Two modes:
      - ``rebuild`` (default, "扒谱"): homr → MusicXML → Verovio → clean PNG.
        Crops are from the freshly rendered notation — no scan artefacts,
        no printed lyrics bleeding in. OMR errors become visible on the
        slide; see Sheet-music pipeline in README for the tradeoff.
      - ``crop`` (literal "截图"): oemer → staff bounding boxes in original
        image coordinates → crop the user's original scan pixels. Preserves
        the source exactly (watermarks, printed lyrics and all); best when
        the user cares more about pixel fidelity than clean typography.

    On rebuild-mode failure (homr not installed, Verovio crash, ...) we
    transparently fall back to crop mode using the original scan — the
    request still succeeds with SOMETHING usable.

    Returns ``(page_image_paths, regions, system_count)``.
    """
    pages, staffs, widths, ordered = _cached_omr(upload_path, mode)
    regions = split_across_chunks(
        staffs, num_chunks, widths,
        ordered=ordered,
        tight_crop=(mode == "crop"),
    )
    return pages, regions, len(ordered)
