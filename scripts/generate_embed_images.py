"""Generate 1200x630 Open Graph preview images for the static site.

The script discovers the root index, the blogposts index, and numbered article
files. It reads each page's title, description, article number, eyebrow, and
tags, then renders a consistent link-preview card into assets/embeds/.
"""

from __future__ import annotations

import argparse
import base64
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from html import escape
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_ORIGIN = "https://itsmonkey.business"
CARD_CSS = (ROOT / "scripts" / "embed-card.css").read_text(encoding="utf-8")
LUNAR_REACH_DATA_URI = (
    "data:image/png;base64,"
    + base64.b64encode(
        (ROOT / "scripts" / "embed-lunar-reach.png").read_bytes()
    ).decode("ascii")
)
WIDTH = 1200
HEIGHT = 630


def clean(value: str) -> str:
    return " ".join(value.split())


def shorten(value: str, limit: int) -> str:
    value = clean(value)
    if len(value) <= limit:
        return value
    clipped = value[: limit - 1].rsplit(" ", 1)[0]
    return f"{clipped}…"


class PageMetadataParser(HTMLParser):
    """Read only the metadata needed to build a preview card."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.article_number = ""
        self.eyebrow = ""
        self.tags: list[str] = []
        self._captures: list[list[object]] = []

    def _begin_capture(self, kind: str, tag: str) -> None:
        self._captures.append([kind, tag, []])

    def _finish_capture(self, tag: str) -> None:
        for index in range(len(self._captures) - 1, -1, -1):
            kind, capture_tag, parts = self._captures[index]
            if capture_tag != tag:
                continue
            value = clean("".join(parts))
            self._captures.pop(index)
            if kind == "title":
                self.title = value
            elif kind == "article_number":
                self.article_number = value
            elif kind == "eyebrow":
                self.eyebrow = value
            elif kind == "tag" and value and value not in self.tags:
                self.tags.append(value)
            return

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key: value or "" for key, value in attrs}
        if tag == "title":
            self._begin_capture("title", tag)
        elif tag == "meta":
            name = attributes.get("name", "").lower()
            property_name = attributes.get("property", "").lower()
            if name == "description" or property_name == "og:description":
                self.description = attributes.get("content", "")
        elif tag == "link" and "canonical" in attributes.get("rel", "").lower().split():
            self.canonical = attributes.get("href", "")

        classes = set(attributes.get("class", "").split())
        if "article-number" in classes:
            self._begin_capture("article_number", tag)
        elif "eyebrow" in classes:
            self._begin_capture("eyebrow", tag)
        elif "tag" in classes:
            self._begin_capture("tag", tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        self._finish_capture(tag)

    def handle_data(self, data: str) -> None:
        for capture in self._captures:
            capture[2].append(data)


@dataclass(frozen=True)
class Preview:
    source: Path
    output: Path
    public_url: str
    kind: str
    marker: str
    fallback_kicker: str
    fallback_tags: tuple[str, ...]


def parse_page(path: Path) -> PageMetadataParser:
    parser = PageMetadataParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def article_number(path: Path, metadata: PageMetadataParser) -> str:
    if metadata.article_number:
        return metadata.article_number
    match = re.match(r"(\d+)", path.stem)
    return match.group(1).zfill(2) if match else ""


def discover_previews() -> list[Preview]:
    previews = [
        Preview(
            source=ROOT / "index.html",
            output=ROOT / "assets" / "embeds" / "index.png",
            public_url=f"{SITE_ORIGIN}/",
            kind="directory",
            marker="INDEX",
            fallback_kicker="DIRECTORY / BLOG",
            fallback_tags=("directory", "blog"),
        ),
        Preview(
            source=ROOT / "blogposts" / "index.html",
            output=ROOT / "assets" / "embeds" / "blogposts-index.png",
            public_url=f"{SITE_ORIGIN}/blogposts/",
            kind="directory",
            marker="DIR",
            fallback_kicker="DIRECTORY / BLOGPOSTS",
            fallback_tags=("directory", "archive"),
        ),
    ]

    article_paths = sorted(
        path
        for path in (ROOT / "blogposts").glob("*.html")
        if path.name != "index.html"
        and not path.name.startswith("_")
        and re.match(r"\d+", path.stem)
    )
    for path in article_paths:
        number = article_number(path, parse_page(path))
        if not number:
            continue
        relative = path.relative_to(ROOT).as_posix()
        previews.append(
            Preview(
                source=path,
                output=ROOT / "assets" / "embeds" / f"article-{number}.png",
                public_url=f"{SITE_ORIGIN}/{relative}",
                kind="article",
                marker=number,
                fallback_kicker=f"ARTICLE {number}",
                fallback_tags=("article",),
            )
        )
    return previews


def card_markup(preview: Preview) -> str:
    metadata = parse_page(preview.source)
    title = clean(metadata.title)
    title = re.sub(r"\s*(?:\||—)\s*It's Monkey Business\s*$", "", title)
    if preview.kind == "article":
        prefix = f"{preview.marker}:"
        if title.startswith(prefix):
            title = title[len(prefix):].strip()

    description = metadata.description or "Notes and analysis from It's Monkey Business."
    kicker = metadata.eyebrow or preview.fallback_kicker
    tags = metadata.tags[:4] or list(preview.fallback_tags)
    status = f"ARTICLE {preview.marker}" if preview.kind == "article" else title.upper()
    public_url = metadata.canonical or preview.public_url
    footer_url = re.sub(r"^https?://", "", public_url).rstrip("/") or "itsmonkey.business"

    tag_markup = "".join(
        f'<span class="embed-tag">{escape(shorten(tag, 24))}</span>'
        for tag in tags
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>{CARD_CSS}</style>
</head>
<body>
<div class="embed-card">
  <img class="embed-lunar-reach" src="{LUNAR_REACH_DATA_URI}" alt="" aria-hidden="true">
  <header class="embed-header">
    <span class="embed-brand">It's Monkey Business</span>
    <span class="embed-status">{escape(status)}</span>
  </header>
  <main class="embed-main">
    <div class="embed-kicker">{escape(shorten(kicker, 54))}</div>
    <h1 class="embed-title">{escape(shorten(title, 58))}</h1>
    <p class="embed-description">{escape(shorten(description, 156))}</p>
    <div class="embed-tags">{tag_markup}</div>
  </main>
  <footer class="embed-footer">
    <strong>itsmonkey.business</strong>
    <span class="embed-url">{escape(footer_url)}</span>
  </footer>
</div>
</body>
</html>
"""


def renderer_candidates() -> list[Path]:
    candidates = []
    configured = os.environ.get("HTML_TO_PNG_RENDERER")
    if configured:
        candidates.append(Path(configured))
    candidates.extend(
        [
            ROOT / "scripts" / "html_to_png.py",
            Path(r"C:\Users\Rig2\.codex\skills\html-to-png\scripts\html_to_png.py"),
        ]
    )
    return candidates


def find_renderer(configured: Path | None) -> Path:
    candidates = [configured] if configured else renderer_candidates()
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    searched = ", ".join(str(candidate) for candidate in candidates)
    raise SystemExit(
        "Could not find html_to_png.py. Set HTML_TO_PNG_RENDERER or pass "
        f"--renderer. Searched: {searched}"
    )


def render_preview(preview: Preview, renderer: Path) -> None:
    preview.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="embed-card-") as temporary:
        html_path = Path(temporary) / "card.html"
        html_path.write_text(card_markup(preview), encoding="utf-8")
        command = [
            sys.executable,
            str(renderer),
            str(html_path),
            str(preview.output),
            "--width",
            str(WIDTH),
            "--height",
            str(HEIGHT),
            "--wait-until",
            "load",
            "--wait-ms",
            "100",
        ]
        subprocess.run(command, check=True)


def main() -> None:
    previews = discover_previews()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--page",
        choices=["all", *[preview.output.stem for preview in previews]],
        default="all",
        help="Generate one preview or all discovered previews.",
    )
    parser.add_argument("--renderer", type=Path, help="Path to html_to_png.py.")
    args = parser.parse_args()

    selected = previews if args.page == "all" else [
        preview for preview in previews if preview.output.stem == args.page
    ]
    renderer = find_renderer(args.renderer)
    for preview in selected:
        render_preview(preview, renderer)
        print(f"wrote {preview.output.relative_to(ROOT)} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
