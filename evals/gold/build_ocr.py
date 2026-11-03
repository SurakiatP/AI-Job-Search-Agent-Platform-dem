"""OCR task: fictional CVs (no personal data) rendered to page images on demand, scored against the exact source text.

    python3 evals/gold/build_ocr.py build      # writes the `ocr` cases into gold.v1.json (5) and gold.holdout.v1.json (20)
    python3 evals/gold/build_ocr.py render     # renders every case's PNG into evals/gold/.cache/ocr/ (git-ignored)

Cases are generated from fixed seeds (Thai-only, English-only, mixed; 1-column, 2-column, education table, small dense
bullets; clean or "scan": tilt, blur, noise, low resolution). Images come from headless Google Chrome (HTML+CSS), so no new
Python dependency. Ground truth = case["text"] in reading order (2-column: side column first, then main column).

Scoring (score_ocr, 0-100): text is NFC, lower-cased, bullets/markdown/table pipes dropped, whitespace collapsed.
  cer      = Levenshtein(pred, truth) / len(truth), capped at 1
  marks    = LCS of Thai marks (U+0E31, U+0E34-U+0E3A, U+0E47-U+0E4E) in pred vs truth / marks in truth
  facts    = share of the case's key facts (email, phone, years, company names) found in pred (spaces, dashes, dots ignored)
  quality  = 100 * (0.4*(1-cer) + 0.3*marks + 0.3*facts); no Thai marks in truth: 100 * (0.55*(1-cer) + 0.45*facts)
"""
import json
import random
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).parent
CACHE = HERE / ".cache" / "ocr"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROMPT = ("Transcribe all visible text in this document page exactly as written. Keep the reading order and every "
          "Thai tone mark and vowel sign. Do not summarise, translate, correct or add anything. "
          "Output plain text or Markdown only, with no commentary.")  # = services/ocr.py PROMPT
MARKS = {chr(c) for c in [0x0E31, *range(0x0E34, 0x0E3B), *range(0x0E47, 0x0E4F)]}

# ---- fictional content pools: index-parallel Thai / English --------------------------------------------------
NAME = [("ณัฐวุฒิ เจริญสุขศรี", "Natthawut Charoensuksri"), ("กัญญาภัค แก้วมณีวงศ์", "Kanyapak Kaewmaneewong"),
        ("ธนพงศ์ ธรรมรักษ์", "Thanaphong Thammarak"), ("ปิยะนุช พงษ์พิพัฒน์", "Piyanut Pongpipat"),
        ("วรรณิดา วัฒนากูล", "Wannida Wattanakul"), ("สุรเชษฐ์ สิริมงคลชัย", "Surachet Sirimongkolchai"),
        ("เบญจมาศ บุญเรืองฤทธิ์", "Benjamas Boonruangrit"), ("ภัทรพล ศรีสุวรรณพัฒน์", "Phattharaphon Srisuwanphat")]
COMPANY = [("บริษัท ภูผาซอฟต์แวร์ จำกัด", "Phuphaa Software Co., Ltd.", "ภูผาซอฟต์แวร์", "Phuphaa Software"),
           ("บริษัท ลานนาดิจิทัล จำกัด (มหาชน)", "Lanna Digital Public Co., Ltd.", "ลานนาดิจิทัล", "Lanna Digital"),
           ("บริษัท ทะเลใสโลจิสติกส์ จำกัด", "Talaesai Logistics Co., Ltd.", "ทะเลใสโลจิสติกส์", "Talaesai Logistics"),
           ("บริษัท รวงข้าวฟู้ดส์ จำกัด", "Ruangkhao Foods Co., Ltd.", "รวงข้าวฟู้ดส์", "Ruangkhao Foods"),
           ("บริษัท เมฆาคลาวด์เซอร์วิส จำกัด", "Mekha Cloud Service Co., Ltd.", "เมฆาคลาวด์เซอร์วิส", "Mekha Cloud Service"),
           ("บริษัท อัญมณีการเงิน จำกัด", "Anyamani Finance Co., Ltd.", "อัญมณีการเงิน", "Anyamani Finance")]
ROLE = [("ผู้จัดการฝ่ายพัฒนาธุรกิจ", "Business Development Manager"), ("วิศวกรซอฟต์แวร์อาวุโส", "Senior Software Engineer"),
        ("นักวิเคราะห์ข้อมูล", "Data Analyst"), ("เจ้าหน้าที่ฝ่ายบัญชีและการเงิน", "Accounting Officer"),
        ("ผู้ประสานงานโครงการ", "Project Coordinator"), ("นักออกแบบประสบการณ์ผู้ใช้", "UX Designer"),
        ("เจ้าหน้าที่ควบคุมคุณภาพ", "Quality Control Officer")]
BULLET = [("พัฒนาระบบรายงานผู้บริหารที่ช่วยลดเวลาจัดทำรายงานจากสามวันเหลือครึ่งวัน", "Built an executive reporting system that cut report preparation from three days to half a day"),
          ("ดูแลลูกค้าองค์กรกว่า 40 ราย และเจรจาต่อสัญญาบริการประจำปี", "Managed more than 40 corporate clients and negotiated annual service contracts"),
          ("ปรับปรุงขั้นตอนการตรวจรับสินค้าให้รวดเร็วและถูกต้องยิ่งขึ้น", "Improved the goods receiving process to be faster and more accurate"),
          ("ฝึกอบรมพนักงานใหม่เกี่ยวกับมาตรฐานความปลอดภัยและการให้บริการ", "Trained new staff on safety and service standards"),
          ("ประสานงานระหว่างทีมวิศวกรรม ฝ่ายขาย และผู้ใช้งานปลายทาง", "Coordinated between engineering, sales and end users"),
          ("วิเคราะห์ข้อมูลยอดขายรายเดือนและนำเสนอข้อเสนอแนะเชิงกลยุทธ์", "Analysed monthly sales data and presented strategic recommendations"),
          ("จัดทำงบประมาณประจำปีและติดตามค่าใช้จ่ายให้เป็นไปตามแผน", "Prepared the annual budget and tracked spending against plan"),
          ("ออกแบบแบบสอบถามและสัมภาษณ์ผู้ใช้เพื่อค้นหาปัญหาที่แท้จริง", "Designed surveys and interviewed users to find the real problems")]
EDU = [("วิทยาศาสตรบัณฑิต สาขาวิทยาการคอมพิวเตอร์", "B.Sc. Computer Science"), ("บริหารธุรกิจบัณฑิต สาขาการตลาด", "B.B.A. Marketing"),
       ("ศิลปศาสตรบัณฑิต สาขาภาษาอังกฤษ", "B.A. English"), ("วิศวกรรมศาสตรมหาบัณฑิต สาขาวิศวกรรมอุตสาหการ", "M.Eng. Industrial Engineering")]
UNI = [("มหาวิทยาลัยศรีสยามเทคโนโลยี", "Srisayam University of Technology"), ("มหาวิทยาลัยราชภูมิล้านนา", "Lanna Rajabhum University")]
SKILL = [("การวิเคราะห์ข้อมูล, การบริหารโครงการ, การเจรจาต่อรอง, การนำเสนอ, ภาษาอังกฤษระดับดี", "Data analysis, Project management, Negotiation, Presentation, Python, SQL, Tableau"),
         ("การบริหารโครงการ, การวางแผนงบประมาณ, การสื่อสารกับลูกค้า, ทักษะการเป็นผู้นำ", "Budget planning, Client communication, Leadership, Python, SQL, Docker")]
SUMMARY = [("มีประสบการณ์ทำงานด้านการพัฒนาระบบและบริหารโครงการมากกว่า {n} ปี มุ่งมั่นสร้างผลลัพธ์ที่วัดผลได้ และพร้อมเรียนรู้สิ่งใหม่อยู่เสมอ",
            "Over {n} years of experience in systems development and project delivery, focused on measurable results.")]
LABEL = {"th": dict(summary="สรุปประวัติ", exp="ประสบการณ์ทำงาน", edu="การศึกษา", skill="ทักษะ", contact="ติดต่อ"),
         "en": dict(summary="Summary", exp="Work Experience", edu="Education", skill="Skills", contact="Contact"),
         "mix": dict(summary="สรุปประวัติ Summary", exp="ประสบการณ์ทำงาน Experience", edu="การศึกษา Education", skill="ทักษะ Skills", contact="ติดต่อ Contact")}


def build_cv(seed, lang, layout, scan, font_pt):
    """-> case dict (without id) with `sections` (what is drawn) and `text` (ground truth, reading order)."""
    r = random.Random(seed)
    th_body, th_name = lang in ("th", "mix"), lang == "th"  # mix: Thai prose, English name/roles/companies/skills
    i_name = r.randrange(len(NAME))
    name = NAME[i_name][0 if th_name else 1]
    email = f"{NAME[i_name][1].split()[0].lower()}.{r.randrange(10, 99)}@example.com"
    phone = f"0{r.choice([6, 8, 9])}{r.randrange(1, 9)}-555-0{r.randrange(100, 999)}"
    be = lang != "en"  # Buddhist-era years on Thai pages
    y0 = r.randrange(2555, 2562) if be else r.randrange(2012, 2019)
    cos = r.sample(COMPANY, 3)
    sections, years, companies = [], [], []
    ci = 0 if lang == "en" else 0 if lang == "mix" else 0
    pick = lambda pair, thai: pair[0] if thai else pair[1]
    sections.append(dict(title="", side=True, items=[dict(kind="name", text=name),
                                                     dict(kind="p", text=pick(ROLE[r.randrange(len(ROLE))], th_name)),
                                                     dict(kind="p", text=f"{email}  {phone}")]))
    sections.append(dict(title=LABEL[lang]["summary"], side=False, items=[dict(kind="p", text=SUMMARY[0][0 if th_body else 1].format(n=r.randrange(4, 14)))]))
    exp = []
    for k, co in enumerate(cos):
        a, b = y0 + 2 * k + (0 if k == 0 else 1), y0 + 2 * k + 2
        years += [str(a), str(b)]
        companies.append(co[2] if th_name else co[3])
        exp.append(dict(kind="p", text=f"{pick(co, th_name)}  {a} - {b}"))
        exp.append(dict(kind="p", text=pick(ROLE[r.randrange(len(ROLE))], th_name)))
        for bl in r.sample(BULLET, 2 if layout != "dense" else 3):
            exp.append(dict(kind="li", text=bl[0] if th_body else bl[1]))
    sections.append(dict(title=LABEL[lang]["exp"], side=False, items=exp))
    edu_rows = []
    for k in range(2):
        d, u = r.choice(EDU), r.choice(UNI)
        yr = str(y0 - 4 + 2 * k)
        years.append(yr)
        edu_rows.append(dict(kind="row", cells=[pick(d, th_name), pick(u, th_name), yr]))
    sections.append(dict(title=LABEL[lang]["edu"], side=True, items=edu_rows if layout == "table" else
                         [dict(kind="p", text=" ".join(c["cells"])) for c in edu_rows]))
    sections.append(dict(title=LABEL[lang]["skill"], side=True, items=[dict(kind="p", text=SKILL[r.randrange(2)][0 if lang == "th" else 1])]))
    if layout == "twocol":  # side column first = reading order
        sections = [s for s in sections if s["side"]] + [s for s in sections if not s["side"]]
    lines = []
    for s in sections:
        if s["title"]:
            lines.append(s["title"])
        for it in s["items"]:
            lines.append(" ".join(it["cells"]) if it["kind"] == "row" else it["text"])
    facts = [email, phone, *sorted(set(years)), *companies]
    return dict(lang=lang, layout=layout, scan=scan, font_pt=font_pt, sections=sections, text="\n".join(lines), facts=facts)


# ---- rendering ------------------------------------------------------------------------------------------------
def html(case):
    pt, two = case["font_pt"], case["layout"] == "twocol"
    font = "Sarabun, Thonburi, sans-serif" if case["lang"] != "en" else "Helvetica, Arial, sans-serif"

    def block(s):
        out = [f"<h2>{s['title']}</h2>"] if s["title"] else []
        rows, lis = [], []

        def flush():  # keep the reading order: a run of list items / table rows is closed when another kind starts
            if lis:
                out.append("<ul>" + "".join(lis) + "</ul>")
            if rows:
                out.append("<table>" + "".join(rows) + "</table>")
            lis.clear()
            rows.clear()

        for it in s["items"]:
            if it["kind"] != "li" and lis or it["kind"] != "row" and rows:
                flush()
            if it["kind"] == "row":
                rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in it["cells"]) + "</tr>")
            elif it["kind"] == "li":
                lis.append(f"<li>{it['text']}</li>")
            else:
                tag = "h1" if it["kind"] == "name" else "p"
                out.append(f"<{tag}>{it['text']}</{tag}>")
        flush()
        return "".join(out)

    body = (f"<div class=cols><div class=side>{''.join(block(s) for s in case['sections'] if s['side'])}</div>"
            f"<div class=main>{''.join(block(s) for s in case['sections'] if not s['side'])}</div></div>") if two else \
        "".join(block(s) for s in case["sections"])
    scan = case["scan"]
    seed = case["seed"]
    deg = (-1 if seed % 2 else 1) * (1.2 + seed % 3 * 0.4)
    page = "transform:rotate(%sdeg) scale(.96);filter:blur(.6px) contrast(.8) brightness(.97);" % deg if scan else ""
    noise = (f"<svg width=0 height=0 style=position:absolute><filter id=n><feTurbulence type=fractalNoise baseFrequency=.9 numOctaves=2 seed={seed}/>"
             "<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter></svg>"
             "<div style='position:fixed;inset:0;filter:url(#n);opacity:.6;pointer-events:none'></div>"
             "<div style='position:fixed;inset:0;background:linear-gradient(100deg,rgba(0,0,0,.18),transparent 25%,transparent 80%,rgba(0,0,0,.12))'></div>") if scan else ""
    return (f"<!doctype html><meta charset=utf-8><style>body{{margin:0;background:{'#ece8df' if scan else '#fff'};overflow:hidden}}"
            f".page{{width:794px;height:1123px;box-sizing:border-box;padding:48px 56px;font:{pt}pt/1.45 {font};color:#{'2a2a2a' if scan else '111'};{page}}}"
            "h1{font-size:1.9em;margin:0 0 4px}h2{font-size:1.1em;margin:14px 0 4px;border-bottom:1px solid #999}p{margin:2px 0}ul{margin:2px 0;padding-left:20px}"
            "table{border-collapse:collapse;width:100%}td{border:1px solid #888;padding:3px 6px}.cols{display:flex;gap:28px}.side{width:36%}.main{flex:1}"
            f"</style><div class=page>{body}</div>{noise}")


def render(case, force=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    png = CACHE / f"{case['id']}.jpg"  # the app sends JPEG pages
    if png.exists() and not force:
        return png
    src = CACHE / f"{case['id']}.html"
    src.write_text(html(case), encoding="utf-8")
    scale = "0.9" if case["scan"] else "1.6"  # scans are low resolution
    shot = png.with_suffix(".shot.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={shot}", "--window-size=794,1123",
                    f"--force-device-scale-factor={scale}", "--virtual-time-budget=2000", src.as_uri()],
                   check=True, capture_output=True, timeout=60)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70" if case["scan"] else "85", str(shot), "--out", str(png)],
                   check=True, capture_output=True)
    shot.unlink()
    return png


# ---- scoring --------------------------------------------------------------------------------------------------
def clean(text):
    t = unicodedata.normalize("NFC", str(text or "")).lower()
    t = re.sub(r"^\s*[|:\-\s]+$", "", t, flags=re.M)  # markdown table rules
    t = re.sub(r"^\s*(?:#+|[-*•·▪])\s+", "", t, flags=re.M)
    return " ".join(re.sub(r"[|*#•·▪`]", " ", t).split())


def edit_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def lcs(a, b):
    prev = [0] * (len(b) + 1)
    for ca in a:
        cur = [0]
        for j, cb in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if ca == cb else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]


def squash(text):
    return re.sub(r"[\s\-.]", "", clean(text))


def score_ocr(raw, case, persona=None, job=None):
    truth, pred = clean(case["text"]), clean(raw)
    if not pred:
        return 0.0, {"valid": False}
    cer = min(1.0, edit_distance(pred, truth) / max(len(truth), 1))
    tm, pm = [c for c in truth if c in MARKS], [c for c in pred if c in MARKS]
    marks = lcs(tm, pm) / len(tm) if tm else None
    sp = squash(raw)
    facts = sum(squash(f) in sp for f in case["facts"]) / max(len(case["facts"]), 1)
    q = 0.4 * (1 - cer) + 0.3 * marks + 0.3 * facts if marks is not None else 0.55 * (1 - cer) + 0.45 * facts
    return 100 * q, {"cer": round(cer, 3), "marks": None if marks is None else round(marks, 3), "facts": round(facts, 2), "len": len(pred)}


# ---- dataset --------------------------------------------------------------------------------------------------
# (lang, layout, scan, font_pt)
DEV = [("th", "single", 0, 11), ("en", "twocol", 0, 10), ("mix", "table", 0, 10), ("th", "dense", 1, 9.5), ("mix", "single", 0, 8.5)]
HOLDOUT = [("th", "single", 0, 11), ("en", "single", 0, 11), ("mix", "single", 0, 11), ("th", "twocol", 0, 10), ("en", "twocol", 0, 10),
           ("mix", "twocol", 0, 10), ("th", "table", 0, 10), ("en", "table", 0, 10), ("mix", "table", 0, 10), ("th", "dense", 0, 8.5),
           ("en", "dense", 0, 8.5), ("mix", "dense", 0, 8.5), ("th", "single", 1, 11), ("th", "twocol", 1, 10), ("mix", "single", 1, 11),
           ("mix", "table", 1, 10), ("th", "dense", 1, 9.5), ("en", "single", 1, 11), ("th", "table", 1, 10), ("mix", "twocol", 1, 10)]


def cases(spec, prefix, base):
    out = []
    for k, (lang, layout, scan, pt) in enumerate(spec, 1):
        c = build_cv(base + k, lang, layout, scan, pt)
        out.append(dict(id=f"{prefix}{k:02d}", seed=base + k, **c))
    return out


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "build":
        for fn, spec, prefix, base in (("gold.v1.json", DEV, "ocr-d", 9100), ("gold.holdout.v1.json", HOLDOUT, "ocr-h", 9200)):
            path = HERE / "data" / fn
            data = json.loads(path.read_text())
            data["cases"]["ocr"] = cases(spec, prefix, base)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
            print(fn, len(data["cases"]["ocr"]), "ocr cases")
    else:
        for fn in ("gold.v1.json", "gold.holdout.v1.json"):
            for c in json.loads((HERE / "data" / fn).read_text())["cases"]["ocr"]:
                print(render(c))


if __name__ == "__main__":
    main()
