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
