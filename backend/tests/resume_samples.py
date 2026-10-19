"""Synthetic resume data for builder tests (no real personal data)."""
from uuid import UUID


def _id(n: int) -> str:
    return str(UUID(int=n))


def thai_long(copies: int = 1) -> dict:
    experience = [{"id": _id(100 + i), "company": "บริษัท ตัวอย่าง จำกัด", "position": "นักวิเคราะห์ข้อมูลอาวุโส",
                   "location": "กรุงเทพมหานคร", "start": f"{2023 - i}-01", "end": "" if i == 0 else f"{2024 - i}-12",
                   "current": i == 0,
                   "highlights": ["สร้างแดชบอร์ดยอดขายรายเดือนด้วย SQL และ Looker ให้ทีมผู้บริหารใช้ติดตามผลทุกสัปดาห์",
                                  "ออกแบบระบบดึงข้อมูลอัตโนมัติด้วย Python และ Airflow ลดเวลาทำรายงานจากสองวันเหลือสองชั่วโมง",
                                  "ทำงานร่วมกับทีมผลิตภัณฑ์เพื่อกำหนดตัวชี้วัดของฟีเจอร์ใหม่"]} for i in range(3 * copies)]
    return {
        "basics": {"name": "สมชาย ตัวอย่าง", "headline": "นักวิเคราะห์ข้อมูล · Data Analyst", "email": "candidate@example.test",
                   "phone": "000-000-0000", "location": "กรุงเทพมหานคร",
                   "profiles": [{"id": _id(1), "network": "LinkedIn", "url": "https://www.linkedin.com/in/example"},
                                {"id": _id(2), "network": "GitHub", "url": "https://github.com/example"}]},
        "summary": {"content": "นักวิเคราะห์ข้อมูลที่มีประสบการณ์สี่ปีในการสร้างรายงานและแดชบอร์ดให้ธุรกิจค้าปลีก ถนัด SQL, Python และการสื่อสารผลวิเคราะห์ให้ผู้บริหารเข้าใจง่าย"},
        "sections": {
            "experience": {"items": experience},
            "education": {"items": [{"id": _id(200), "institution": "มหาวิทยาลัยตัวอย่าง", "degree": "วิทยาศาสตรบัณฑิต",
                                     "area": "สถิติ", "grade": "3.45", "start": "2015", "end": "2019"}]},
            "skills": {"items": [{"id": _id(300 + i), "name": n, "level": lv, "keywords": kw} for i, (n, lv, kw) in enumerate([
                ("SQL", 5, ["PostgreSQL", "BigQuery"]), ("Python", 4, ["pandas", "Airflow"]),
                ("Looker", 4, []), ("การสื่อสาร", 4, ["นำเสนอผู้บริหาร"])])]},
            "projects": {"items": [{"id": _id(400), "name": "ระบบพยากรณ์ยอดขาย", "role": "ผู้พัฒนาหลัก", "url": "https://example.test/forecast",
                                    "start": "2022-03", "end": "2022-09", "highlights": ["สร้างแบบจำลองพยากรณ์รายสัปดาห์ด้วย Python"]}]},
            "certifications": {"items": [{"id": _id(500), "name": "Google Data Analytics", "issuer": "Google", "date": "2021", "url": ""}]},
            "languages": {"items": [{"id": _id(600), "name": "ไทย", "level": "เจ้าของภาษา"}, {"id": _id(601), "name": "English", "level": "ดี"}]},
            "awards": {"items": [{"id": _id(700), "title": "พนักงานดีเด่น", "awarder": "บริษัท ตัวอย่าง จำกัด", "date": "2023", "summary": ""}]},
            "publications": {"items": []},
            "volunteer": {"items": [{"id": _id(800), "organization": "มูลนิธิตัวอย่าง", "role": "อาสาสมัครสอนคอมพิวเตอร์",
                                     "start": "2020", "end": "2021", "highlights": ["สอนการใช้ Excel ให้เยาวชน"]}]},
            "references": {"items": [{"id": _id(900), "name": "สมหญิง ผู้อ้างอิง", "relation": "หัวหน้างาน", "contact": "referee@example.test · 000-111-2222"}]},
            "interests": {"items": [{"id": _id(1000), "name": "วิ่ง"}, {"id": _id(1001), "name": "ถ่ายภาพ"}]},
        },
    }


def english_short() -> dict:
    return {
        "basics": {"name": "Alex Example", "headline": "Backend Engineer", "email": "alex@example.test", "phone": "", "location": "Bangkok", "profiles": []},
        "summary": {"content": "Backend engineer who builds reliable APIs."},
        "sections": {"experience": {"items": [{"id": _id(1), "company": "Example Co", "position": "Backend Engineer", "location": "",
                                               "start": "2022-06", "end": "", "current": True, "highlights": ["Built REST APIs in FastAPI"]}]},
                     "skills": {"items": [{"id": _id(2), "name": "Python", "level": None, "keywords": []}]}},
    }
