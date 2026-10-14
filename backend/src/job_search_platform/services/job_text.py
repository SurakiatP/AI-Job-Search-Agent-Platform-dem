"""Upstream job HTML to plain markdown (stdlib only). Output is untrusted text, like all job content."""
from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser

_DROP = {"script", "style", "iframe", "noscript", "svg", "head"}
_BLOCK = {"p", "div", "section", "article", "br", "tr", "table"}


class _Converter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.href: list[str | None] = []

    def handle_starttag(self, tag, attrs):
        if tag in _DROP:
            self.skip += 1
        elif self.skip:
            return
        elif tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n" + "#" * min(int(tag[1]), 3) + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag == "a":
            href = dict(attrs).get("href") or ""
            self.href.append(href if href.startswith(("https://", "http://")) else None)
        elif tag in _BLOCK or tag in ("ul", "ol"):
            self.out.append("\n\n")

    def handle_endtag(self, tag):
        if tag in _DROP:
            self.skip = max(0, self.skip - 1)
        elif self.skip:
            return
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag == "a" and self.href:
            href = self.href.pop()
            if href:
                self.out.append(f" ({href})")
        elif tag in _BLOCK or tag in ("h1", "h2", "h3", "h4", "ul", "ol"):
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))


def html_to_markdown(source: str) -> str:
    if "&lt;" in source and "<" not in source:  # Greenhouse returns entity-escaped HTML
        source = html_lib.unescape(source)
    parser = _Converter()
    parser.feed(source)
    parser.close()
    text = "".join(parser.out)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n- \n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
