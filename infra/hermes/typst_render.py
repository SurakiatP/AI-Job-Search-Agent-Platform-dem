"""Turn Markdown into a Typst document made only of string literals (no markup injection)."""
from __future__ import annotations
import sys
from pathlib import Path

def _lit(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'

def markdown_to_typst(text: str) -> str:
    lang = "th" if any("฀" <= ch <= "๿" for ch in text) else "en"
    out = ['#set page(paper: "a4", margin: 2cm)',
           f'#set text(font: ("Open Sans", "Noto Sans Thai"), size: 10.5pt, lang: "{lang}")',
           "#set par(justify: false)"]
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        stripped = line.lstrip("#")
        level = len(line) - len(stripped)
        if level and (not stripped or stripped[0] == " "):
            out.append(f"#heading(level: {min(level, 3)})[#{_lit(stripped.strip())}]")
        elif line[:2] in ("- ", "* "):
            out.append(f"#list[#{_lit(line[2:].strip())}]")
        else:
            out.append(f"#par[#{_lit(line)}]")
    return "\n".join(out) + "\n"

if __name__ == "__main__":
    Path(sys.argv[2]).write_text(markdown_to_typst(Path(sys.argv[1]).read_text(encoding="utf-8")), encoding="utf-8")
