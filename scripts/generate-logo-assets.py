#!/usr/bin/env python3
"""Generate every Nabor brand asset from the master logo artwork.

Background: the supplied logo arrived with the design tool's "transparency
checkerboard" flattened into its pixels — an RGB PNG with a light-grey/white
checkerboard baked into the background. Dropped straight onto the dark
(``#0f0f0f``) welcome screen, that renders as a bright checkerboard square.

This script rebuilds a *real* alpha channel from the icon's rounded-square
geometry (dropping the old background, including the 1-3px halo the checkerboard
left behind), stores the cleaned result at full resolution as
``scripts/nabor-logo-master.png`` and then derives every size the app,
``index.html`` and the web manifest need. All published assets come from that
master, so repeated runs are byte-for-byte identical.

Usage:
    # Re-export the published assets from the stored master.
    python3 scripts/generate-logo-assets.py

    # Swap in new artwork: cleans it, refreshes the master, re-exports.
    python3 scripts/generate-logo-assets.py ~/Downloads/new-logo.png

Requires Pillow (``python3 -m pip install Pillow``).
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'scripts')
PUBLIC = os.path.join(ROOT, 'public')
ICONS = os.path.join(PUBLIC, 'icons')
MASTER = os.path.join(SCRIPTS, 'nabor-logo-master.png')

BLACK = (0, 0, 0, 255)
LOGO_SIZE = 512  # in-app logo / og:image — 4x the largest on-screen (128px) box
DARK = 60  # luminance below this = icon artwork
LIGHT = 150  # luminance above this = old checkerboard / shadow
SUPERSAMPLE = 4  # over-sample factor used to antialias the rebuilt mask


def _rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    """Antialiased alpha mask for a rounded square of ``size``."""
    w, h = size
    ss = SUPERSAMPLE
    big = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, w * ss - 1, h * ss - 1), radius=radius * ss, fill=255
    )
    return big.resize((w, h), Image.LANCZOS)


def _corner_radius(luma: Image.Image, box: tuple[int, int, int, int]) -> int:
    """Corner radius, read from where the top row of the icon turns dark."""
    x0, y0, x1, _ = box
    px = luma.load()
    for x in range(x0, x1):
        if px[x, y0] < DARK:
            return x - x0
    return 0


def is_clean(im: Image.Image) -> bool:
    """True when the image already carries real transparency."""
    return 'A' in im.getbands() and im.getchannel('A').getextrema()[0] < 250


def strip_background(im: Image.Image) -> Image.Image:
    """Return a tight RGBA icon with the flattened checkerboard removed."""
    if is_clean(im):  # already transparent -> just crop to the artwork
        return im.convert('RGBA').crop(im.getchannel('A').getbbox())

    rgb = im.convert('RGB')
    luma = rgb.convert('L')

    box = luma.point(lambda v: 255 if v < DARK else 0).getbbox()
    if box is None:
        raise SystemExit('No dark icon artwork found in the master image.')

    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0)
    left = int(round(max(0, min(im.width - side, cx - side / 2))))
    top = int(round(max(0, min(im.height - side, cy - side / 2))))

    icon = rgb.crop((left, top, left + side, top + side))
    mask = _rounded_mask(icon.size, _corner_radius(luma, box))

    # Pixels hugging the outer edge that are still light belong to the old
    # checkerboard (JPEG ringing around the old edge), never to the artwork —
    # paint them the icon's own background colour so no halo survives.
    edge_band = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(7)))
    halo = ImageChops.multiply(
        icon.convert('L').point(lambda v: 255 if v > LIGHT else 0), edge_band
    )
    icon.paste((0, 0, 0), mask=halo)

    out = icon.convert('RGBA')
    out.putalpha(mask)
    # Flush the dead pixels that sit under alpha=0 (the old checkerboard) to
    # black — invisible either way, but it keeps the files small and clean.
    # NB: the colour must carry the alpha channel too, otherwise PIL expands
    # (0, 0, 0) to (0, 0, 0, 255) and re-opaques the transparent corners.
    out.paste((0, 0, 0, 0), mask=mask.point(lambda v: 255 if v == 0 else 0))
    return out


def save(icon: Image.Image, size: int, path: str, background: tuple | None = None) -> None:
    out = icon.resize((size, size), Image.LANCZOS)
    if background is not None:
        out = Image.alpha_composite(Image.new('RGBA', out.size, background), out).convert('RGB')
    out.save(path, optimize=True)
    print(
        '  %-36s %4dx%-4d %6.1f KB'
        % (os.path.relpath(path, ROOT), size, size, os.path.getsize(path) / 1024)
    )


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else MASTER
    if not os.path.exists(src):
        raise SystemExit('Logo source not found: %s' % src)

    raw = Image.open(src)
    clean = is_clean(raw)
    logo = strip_background(raw)

    os.makedirs(ICONS, exist_ok=True)
    print('Brand assets generated from %s' % os.path.relpath(src, ROOT))

    # New artwork: keep the clean full-resolution master so every future export
    # starts from the same pixels (no generational quality loss).
    if not clean:
        logo.save(MASTER, optimize=True)
        print(
            '  %-36s %4dx%-4d %6.1f KB'
            % (
                os.path.relpath(MASTER, ROOT),
                logo.width,
                logo.height,
                os.path.getsize(MASTER) / 1024,
            )
        )

    # In-app logo (welcome screen) — transparent corners.
    save(logo, LOGO_SIZE, os.path.join(PUBLIC, 'nabor-logo.png'))
    # Browser tab icon — transparent corners.
    save(logo, 64, os.path.join(PUBLIC, 'favicon.png'))
    # iOS home screen — iOS ignores transparency, so flatten onto the icon's
    # own black background and let iOS apply its own corner rounding.
    save(logo, 180, os.path.join(PUBLIC, 'apple-touch-icon.png'), background=BLACK)
    # Manifest icons — "any" keeps the rounded shape, "maskable" is full-bleed
    # so launchers can crop it to whatever shape they need.
    for size in (192, 512):
        save(logo, size, os.path.join(ICONS, 'icon-%d.png' % size))
        save(logo, size, os.path.join(ICONS, 'maskable-%d.png' % size), background=BLACK)


if __name__ == '__main__':
    main()
