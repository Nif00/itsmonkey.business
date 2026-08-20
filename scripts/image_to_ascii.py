"""Convert a raster image to luminance-based ASCII art.

Requires Pillow. The default aspect correction is tuned for monospace text whose
line height is roughly twice its character width.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def image_to_ascii(
    image_path: Path,
    width: int,
    characters: str,
    aspect: float,
    trim: bool,
) -> list[str]:
    image = Image.open(image_path).convert("L")
    image = ImageOps.autocontrast(image)
    height = max(1, round(image.height / image.width * width * aspect))
    image = image.resize((width, height), Image.Resampling.LANCZOS)

    lines = []
    max_index = len(characters) - 1
    for row in range(image.height):
        line = "".join(
            characters[round(image.getpixel((column, row)) / 255 * max_index)]
            for column in range(image.width)
        )
        lines.append(line.rstrip())

    if trim:
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()

    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--width", type=int, default=58)
    parser.add_argument("--characters", default=" .:-=+*#%@")
    parser.add_argument("--aspect", type=float, default=0.58)
    parser.add_argument("--trim", action="store_true")
    args = parser.parse_args()

    if args.width < 1:
        parser.error("--width must be at least 1")
    if len(args.characters) < 2:
        parser.error("--characters must contain at least two characters")

    print("\n".join(image_to_ascii(
        args.image,
        args.width,
        args.characters,
        args.aspect,
        args.trim,
    )))


if __name__ == "__main__":
    main()
