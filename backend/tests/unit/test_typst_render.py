from importlib import util
from pathlib import Path

_path = Path(__file__).resolve().parents[3] / "infra" / "hermes" / "typst_render.py"
_spec = util.spec_from_file_location("typst_render", _path)
_mod = util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
render = _mod.markdown_to_typst


def _body(md):
    return render(md).splitlines()[3:]


def test_headings_paragraphs_bullets_and_empty_lines_dropped():
    assert _body("# A\n\n## B\n### C\n#### D\n\ntext\n- one\n* two\n") == [
        '#heading(level: 1)[#"A"]', '#heading(level: 2)[#"B"]', '#heading(level: 3)[#"C"]',
        '#heading(level: 3)[#"D"]', '#par[#"text"]', '#list[#"one"]', '#list[#"two"]']


def test_quote_and_backslash_escaped():
    assert _body('say "hi" \\ x') == ['#par[#"say \\"hi\\" \\\\ x"]']


def test_markup_characters_stay_inside_string_literals():
    for ch in "#[]$@*_`":
        line = _body(f"a{ch}b")[0]
        assert line == f'#par[#"a{ch}b"]'
    assert _body("#hashtag") == ['#par[#"#hashtag"]']  # no space: not a heading
    assert _body('x"] #raw("y") ["')[0] == '#par[#"x\\"] #raw(\\"y\\") [\\""]'


def test_thai_preserved_and_lang_set():
    out = render("# สวัสดี\nประสบการณ์")
    assert '"สวัสดี"' in out and '"ประสบการณ์"' in out and 'lang: "th"' in out
    assert 'lang: "en"' in render("hello")


def test_font_list_is_installed_latin_then_thai():
    assert '#set text(font: ("Open Sans", "Noto Sans Thai")' in render("hello")


def _outside_literals(src):
    """Source with every "..." string literal (honouring backslash escapes) blanked out."""
    out, i, inside = [], 0, False
    while i < len(src):
        ch = src[i]
        if inside and ch == "\\":
            i += 2
            continue
        if ch == '"':
            inside = not inside
            out.append('"')
        elif not inside:
            out.append(ch)
        i += 1
    assert not inside, "unterminated string literal"
    return "".join(out)


def test_hostile_input_stays_inside_string_literals():
    hostile = ['x]#read("/etc/passwd")[', '#image("x")', '\\u{41}', 'a\x00b', 'a‮b', 'a #import "x"', "#include \"y\" " + "A" * 50_000]
    src = render("\n".join(hostile) + "\n# #read(\"h\")\n- #image(\"z\")")
    rest = _outside_literals(src)
    for bad in ("#read", "#image", "#import", "#include", "passwd", "u{41}", "\x00", "‮"):
        assert bad not in rest
    assert all(line.startswith(("#set", "#heading", "#list", "#par")) for line in src.splitlines())
