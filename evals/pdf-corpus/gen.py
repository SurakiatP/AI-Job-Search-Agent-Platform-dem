"""Synthetic CV PDF corpus (fictional content). Stdlib only for hand-built PDFs; typst runs in the sandbox image,
Chrome headless on the host. Usage: python gen.py [outdir=out] [image=<sandbox image digest>]"""
import hashlib, os, struct, subprocess, sys, zlib
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "out").resolve()
IMAGE = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("SANDBOX_IMAGE", "")
OUT.mkdir(exist_ok=True)
LINES = ["Somchai Example", "Senior Data Analyst, Bangkok", "somchai@example.invalid  +66 00 000 0000",
         "Experience", "2019-2024 Acme Analytics Co. - built SQL dashboards, led team of 4",
         "2015-2019 Demo Retail Ltd. - Python ETL, Power BI reporting", "Education", "B.Sc. Statistics, Example University",
         "Skills: SQL, Python, Power BI, Excel, English, Thai"]
THAI = ["สมชาย ตัวอย่าง", "นักวิเคราะห์ข้อมูลอาวุโส กรุงเทพมหานคร", "ประสบการณ์ทำงาน",
        "2562-2567 บริษัท ตัวอย่าง จำกัด พัฒนาแดชบอร์ด SQL และนำทีม 4 คน", "การศึกษา: วิทยาศาสตรบัณฑิต สาขาสถิติ",
        "ทักษะ: SQL, Python, Power BI, ภาษาอังกฤษ, ภาษาไทย"] * 4


def esc(s): return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build(objs, root=1, header=b"%PDF-1.4\n", trailer_extra=b"", tail_junk=b"", xref=True):
    """objs: {num: bytes body}. Classic xref table."""
    out = bytearray(header + b"%\xe2\xe3\xcf\xd3\n"); pos = {}
    for n in sorted(objs):
        pos[n] = len(out); out += b"%d 0 obj\n" % n + objs[n] + b"\nendobj\n"
    if not xref:
        return bytes(out)
    start = len(out); size = max(objs) + 1
    out += b"xref\n0 %d\n0000000000 65535 f \n" % size
    for n in range(1, size):
        out += (b"%010d 00000 n \n" % pos[n]) if n in pos else b"0000000000 65535 f \n"
    out += b"trailer\n<< /Size %d /Root %d 0 R %s>>\nstartxref\n%d\n%%%%EOF\n" % (size, root, trailer_extra, start)
    return bytes(out) + tail_junk


def stream(data, extra=b""):
    return b"<< /Length %d %s>>\nstream\n" % (len(data), extra) + data + b"\nendstream"


def text_pdf(pages, header=b"%PDF-1.4\n", extra_page=b"", catalog_extra=b"", font=None, annots=None, **kw):
    """pages: list of line lists. Objects: 1 catalog, 2 pages, 3 font, 4.. page+content pairs."""
    objs = {3: font or b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"}
    kids = []
    for i, lines in enumerate(pages):
        p, c = 10 + 2 * i, 11 + 2 * i; kids.append(b"%d 0 R" % p)
        body = b"BT /F1 12 Tf 14 TL 50 790 Td " + b" ".join(b"(%s) Tj T*" % esc(l).encode("latin-1", "replace") for l in lines) + b" ET"
        objs[c] = stream(body)
        objs[p] = (b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents %d 0 R /Resources << /Font << /F1 3 0 R >> >> %s %s>>"
                   % (c, extra_page, (annots(i) if annots else b"")))
    objs[2] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(kids), len(kids))
    objs[1] = b"<< /Type /Catalog /Pages 2 0 R %s>>" % catalog_extra
    return build(objs, header=header, **kw), objs


def jpeg_pages(pages_lines, dpi=100, box=(595, 842)):
    """Image-only PDF: render a text PDF to JPEG with pdftoppm, wrap in /DCTDecode."""
    src = OUT / "_tmp.pdf"; src.write_bytes(text_pdf(pages_lines)[0])
    subprocess.run(["pdftoppm", "-jpeg", "-r", str(dpi), str(src), str(OUT / "_pg")], check=True)
    jpgs = sorted(OUT.glob("_pg*.jpg")); objs = {}; kids = []
    for i, j in enumerate(jpgs):
        d = j.read_bytes(); im, p, c = 10 + 3 * i, 11 + 3 * i, 12 + 3 * i; kids.append(b"%d 0 R" % p)
        objs[im] = stream(d, b"/Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode " % (box[0] * dpi // 72, box[1] * dpi // 72))
        objs[c] = stream(b"q %d 0 0 %d 0 0 cm /Im0 Do Q" % box)
        objs[p] = b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Contents %d 0 R /Resources << /XObject << /Im0 %d 0 R >> >> >>" % (box + (c, im))
    for j in jpgs: j.unlink()
    src.unlink()
    objs[2] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(kids), len(kids)); objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    return build(objs), objs


# --- RC4 / standard security handler (V1 R2 40-bit) for encrypted samples ---
PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")


def rc4(key, data):
    s = list(range(256)); j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256; s[i], s[j] = s[j], s[i]
    i = j = 0; out = bytearray()
    for b in data:
        i = (i + 1) % 256; j = (j + s[i]) % 256; s[i], s[j] = s[j], s[i]; out.append(b ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


def encrypted(pages, user=b"", owner=b"owner-secret"):
    id0 = hashlib.md5(b"fictional").digest(); P = -44 & 0xFFFFFFFF
    pw = lambda p: (p + PAD)[:32]
    okey = hashlib.md5(pw(owner)).digest()[:5]; O = rc4(okey, pw(user))
    key = hashlib.md5(pw(user) + O + struct.pack("<I", P) + id0).digest()[:5]
    U = rc4(key, PAD)
    _, objs = text_pdf(pages)
    enc = {}
    for n, body in objs.items():
        if body.startswith(b"<< /Length"):
            head, data = body.split(b"stream\n", 1); data = data[:-len(b"\nendstream")]
            k = hashlib.md5(key + struct.pack("<I", n)[:3] + b"\0\0").digest()[:10]
            enc[n] = stream(rc4(k, data))
        else:
            enc[n] = body
    enc[99] = b"<< /Filter /Standard /V 1 /R 2 /O <%s> /U <%s> /P %d >>" % (O.hex().encode(), U.hex().encode(), P - (1 << 32))
    return build(enc, trailer_extra=b"/Encrypt 99 0 R /ID [<%s> <%s>] " % (id0.hex().encode(), id0.hex().encode()))


def objstm_pdf(pages):
    """PDF 1.5 style: xref stream + object stream, header %PDF-2.0."""
    _, objs = text_pdf(pages)
    plain = {n: b for n, b in objs.items() if b.startswith(b"<< /Length")}
    packed = {n: b for n, b in objs.items() if n not in plain}
    order = sorted(packed); body = b""; idx = b""
    for n in order:
        idx += b"%d %d " % (n, len(body)); body += packed[n] + b"\n"
    os_data = zlib.compress(idx + body)
    out = bytearray(b"%PDF-2.0\n%\xe2\xe3\xcf\xd3\n"); pos = {}
    for n in sorted(plain):
        pos[n] = len(out); out += b"%d 0 obj\n" % n + plain[n] + b"\nendobj\n"
    osn = 50; pos[osn] = len(out)
    out += b"50 0 obj\n" + stream(os_data, b"/Type /ObjStm /N %d /First %d /Filter /FlateDecode " % (len(order), len(idx))) + b"\nendobj\n"
    xn = 51; pos[xn] = len(out); size = 52; rows = b""
    for n in range(size):
        if n in plain or n in (osn, xn): rows += struct.pack(">BIH", 1, pos[n], 0)
        elif n in packed: rows += struct.pack(">BIH", 2, osn, order.index(n))
        else: rows += struct.pack(">BIH", 0, 0, 0)
    out += b"51 0 obj\n" + stream(zlib.compress(rows), b"/Type /XRef /Size 52 /W [1 4 2] /Root 1 0 R /Filter /FlateDecode ") + b"\nendobj\n"
    return bytes(out) + b"startxref\n%d\n%%%%EOF\n" % pos[xn]


def form_pdf():
    def annots(i):
        return b"/Annots [20 0 R 21 0 R]"
    data, objs = text_pdf([LINES], annots=annots,
                          catalog_extra=b"/AcroForm << /Fields [20 0 R] /DA (/Helv 0 Tf 0 g) >> ")
    objs[20] = b"<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Somchai Form Field) /Rect [50 600 300 620] /P 10 0 R >>"
    objs[21] = b"<< /Type /Annot /Subtype /Link /Rect [50 500 300 520] /A << /S /URI /URI (https://example.invalid/portfolio) >> >>"
    return build(objs)


def outlines_pdf():
    _, objs = text_pdf([LINES, LINES])
    objs[1] = b"<< /Type /Catalog /Pages 2 0 R /Outlines 30 0 R /PageMode /UseOutlines >>"
    objs[30] = b"<< /Type /Outlines /First 31 0 R /Last 31 0 R /Count 1 >>"
    objs[31] = b"<< /Title (Experience) /Parent 30 0 R /Dest [10 0 R /Fit] >>"
    return build(objs)


def garbled_pdf():
    """Custom glyph names, no ToUnicode: a text layer whose characters cannot be recovered."""
    font = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /Differences [32 " + \
           b" ".join(b"/g%d" % i for i in range(32, 127)) + b"] >> >>"
    return text_pdf([LINES * 3], font=font)[0]


def run(cmd, **kw): return subprocess.run(cmd, check=True, capture_output=True, **kw)


def typst_thai():
    src = OUT / "_thai.typ"
    src.write_text('#set text(font: "Noto Sans Thai", size: 12pt)\n= ' + THAI[0] + "\n" + "\n\n".join(THAI[1:]) + "\n")
    if not IMAGE:
        return None
    run(["docker", "run", "--rm", "--network", "none", "-v", f"{OUT}:/w", "--user", "0", "--entrypoint", "typst", IMAGE,
         "compile", "/w/_thai.typ", "/w/_thai.pdf"])
    data = (OUT / "_thai.pdf").read_bytes(); src.unlink(); (OUT / "_thai.pdf").unlink(); return data


def chrome(html, name, extra=()):
    chrome_bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    f = OUT / "_page.html"; f.write_text(html, encoding="utf-8")
    run([chrome_bin, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={OUT / name}", *extra, f"file://{f}"])
    f.unlink()


def main():
    w = lambda name, data: (OUT / name).write_bytes(data)
    w("text-simple.pdf", text_pdf([LINES])[0])
    w("text-6pages.pdf", text_pdf([LINES + ["page %d" % (i + 1)] for i in range(6)])[0])
    w("text-pdf20-objstm.pdf", objstm_pdf([LINES]))
    w("text-leading-junk.pdf", b"\xef\xbb\xbf\r\n   " + text_pdf([LINES])[0])
    w("text-no-xref.pdf", text_pdf([LINES], xref=False)[0])  # xref/trailer missing: parsers must rebuild
    d = text_pdf([LINES])[0]; i = d.rindex(b"startxref\n") + 10
    w("text-bad-startxref.pdf", d[:i] + b"99999\n%%EOF\n")  # wrong xref offset: poppler/pdfium rebuild, strict parsers do not
    w("text-truncated.pdf", text_pdf([LINES])[0][:-120])
    w("form-annotations.pdf", form_pdf())
    w("outlines-bookmarks.pdf", outlines_pdf())
    w("garbled-no-tounicode.pdf", garbled_pdf())
    w("empty-no-pages.pdf", build({1: b"<< /Type /Catalog /Pages 2 0 R >>", 2: b"<< /Type /Pages /Kids [] /Count 0 >>"}))
    w("blank-page.pdf", text_pdf([[]])[0])
    w("encrypted-owner-only.pdf", encrypted([LINES]))
    w("encrypted-user-password.pdf", encrypted([LINES], user=b"open-sesame"))
    w("image-only-1page.pdf", jpeg_pages([LINES])[0])
    w("image-only-6pages.pdf", jpeg_pages([LINES + ["page %d" % (i + 1)] for i in range(6)])[0])
    w("image-only-heavy-8pages-300dpi.pdf", jpeg_pages([LINES + ["page %d" % (i + 1)] for i in range(8)], dpi=300)[0])
    w("image-only-poster-a1.pdf", jpeg_pages([LINES], dpi=100, box=(1684, 2384))[0])  # scanned A1 page
    big = text_pdf([LINES])[1]  # text page plus an unreferenced 19/21 MB embedded blob (CV with a huge photo)
    big[98] = stream(os.urandom(19 * 1024 * 1024)); w("text-big-19mb.pdf", build(big))
    big[98] = stream(os.urandom(21 * 1024 * 1024)); w("text-big-21mb.pdf", build(big))
    w("not-a-pdf.pdf", b"hello this is a plain text file renamed")
    w("mixed-image-and-text.pdf", text_pdf([LINES])[0])  # placeholder replaced below when typst available
    thai = typst_thai()
    if thai: w("thai-typst.pdf", thai)
    css = "body{font-family:'Thonburi','Noto Sans Thai',sans-serif;font-size:14px}"
    html = f"<meta charset=utf-8><style>{css}</style>" + "".join(f"<p>{t}</p>" for t in THAI)
    chrome(html, "thai-chrome.pdf")
    chrome("<meta charset=utf-8><style>" + css + "</style>" + "".join(f"<p>{l}</p>" for l in LINES) + '<div style="page-break-before:always"></div>' * 0, "html-cv-chrome.pdf")
    chrome("<meta charset=utf-8><style>" + css + "@page{size:A4 landscape}</style><div style='columns:2'>" +
           "".join(f"<p>{l}</p>" for l in LINES * 3) + "</div>", "two-column-landscape.pdf")
    (OUT / "mixed-image-and-text.pdf").unlink()


main()
