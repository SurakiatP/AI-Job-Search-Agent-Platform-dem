from job_search_platform.services.job_text import html_to_markdown


def test_keeps_structure_drops_unsafe():
    html = ('<h2>Role</h2><p>Build <b>APIs</b> &amp; <i>tools</i>.</p><ul><li>Python</li><li>SQL</li></ul>'
            '<p><a href="https://x.test/apply" onclick="evil()">Apply</a></p>'
            '<script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>')
    md = html_to_markdown(html)
    assert md == "## Role\n\nBuild **APIs** & *tools*.\n\n- Python\n- SQL\n\nApply (https://x.test/apply)"


def test_escaped_html_from_greenhouse_is_unescaped_once():
    assert html_to_markdown("&lt;p&gt;Hello&lt;/p&gt;") == "Hello"


def test_javascript_links_drop_url():
    assert html_to_markdown('<a href="javascript:alert(1)">x</a>') == "x"
