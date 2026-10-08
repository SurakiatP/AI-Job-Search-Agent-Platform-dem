# Runbook สาธิตระบบ

ข้อมูลทั้งหมดในโฟลเดอร์นี้ (ตัวตน ณัฐวุฒิ ใจดี, บริษัท, ตำแหน่งงาน, อีเมล `nattawut@example.com`, โทร `000-000-0000`) เป็นข้อมูลสมมติเพื่อการสาธิตเท่านั้น ไม่ใช่บุคคลหรือบริษัทจริง

| ไฟล์ | ใช้ทำอะไร |
|------|-----------|
| `cv-th.pdf` / `cv-th.html` | CV ภาษาไทย (อัปโหลด `cv-th.pdf`) |
| `cv-en.pdf` / `cv-en.html` | CV ภาษาอังกฤษ |
| `jobs.md` | ตำแหน่งงานตัวอย่าง 3 ตำแหน่ง (เหมาะมาก / ปานกลาง / น้อย) |

สร้าง PDF ใหม่จาก HTML (ต้องมีเน็ตเพื่อโหลดฟอนต์ Noto Sans Thai):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=docs/demo/cv-th.pdf docs/demo/cv-th.html
```

## 1. เริ่มบริการและแอป

คำสั่งทั้งหมดอ้างอิง `docs/engineering/local-operation.md` (รันที่รากของ repo; หากไม่มี `rtk` ให้ตัดคำนำหน้าออก) ต้องเตรียม `MINIO_SOURCE_DIR` ตามเอกสารนั้นก่อน

```sh
export CORE02_PRIVATE_DIR="$HOME/.cache/job-search-platform/core02-runtime-20261003"
rtk uv run --locked --project backend python scripts/local_infra.py start \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
rtk uv run --locked --project backend python scripts/local_infra.py status \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"

rtk npm ci --prefix frontend
rtk uv sync --locked --project backend --all-groups
rtk uv run --locked --project backend python scripts/run_local.py --build-frontend --open-browser \
  --enable-sharing --share-host 127.0.0.1 --share-port 8001
```

`--enable-sharing` เปิดประตู MCP/A2A ที่ `127.0.0.1:8001` สำหรับขั้น Three Doors

แอปรันที่ `http://127.0.0.1:8000` ตัวเปิดแอปพิมพ์ URL สำหรับ bootstrap แบบใช้ครั้งเดียว ถือเป็นข้อมูลล็อกอิน อย่าแชร์ log

## 2. ตั้งค่า OpenRouter (เจ้าของเครื่องเท่านั้น)

เจ้าของเครื่องใส่ OpenRouter key เองที่ Settings (เลือก OpenRouter, เลือกโมเดล, ใส่ key, บันทึก, กด connection check) ต้องเป็น key ที่สร้างในบัญชี Personal ซึ่งมีเครดิต: key ที่สร้างใน Workspace อื่นผ่าน connection check ได้แต่เรียกโมเดลไม่ได้ (401 User not found) key ถูกเก็บใน Keychain ของเครื่อง ห้ามใส่ key ในเอกสาร, สคริปต์ หรือ commit

## 3. เตรียมข้อมูลก่อนสาธิต

1. สร้างโปรเจกต์ใหม่
2. อัปโหลด `docs/demo/cv-th.pdf` เป็น CV
3. เพิ่มตำแหน่งงานทั้ง 3 จาก `jobs.md` (Senior Frontend Developer, Full-stack Developer, Data Engineer)
4. รันการประเมินล่วงหน้าให้ครบทั้ง 3 ตำแหน่ง เพื่อให้หน้า Overview และ Job detail มีคะแนนพร้อม (ปกติคะแนนควรเรียง เหมาะมาก > ปานกลาง > น้อย)
5. เหลือตำแหน่งหนึ่ง (หรือใช้ข้อความใหม่ในแชต) ไว้รันสดในขั้น Evaluate

## 4. ลำดับการสาธิต

1. Landing
2. Overview (ภาพรวม)
3. ค้นหางาน: งานจริงในไทยจาก freehire.me (ต้องต่ออินเทอร์เน็ต; ถ้าล่มมีปุ่มดูข้อมูลตัวอย่าง)
4. กด "ประเมินงานนี้" → หน้า Evaluate เลือกงานไว้ให้ → พิมพ์คำแนะนำ → เริ่มงาน (Hermes ใช้เวลาประมาณ 40 วินาที)
5. Job detail: คะแนนความเหมาะสมและรายงานจุดแข็ง/ช่องว่าง
6. เลือก "ร่างเอกสารสมัครงาน" → Documents: Cover letter ที่ร่างให้ (ประมาณ 1 นาที)
7. Agent Console → Three Doors:
   1. แท็บ "เอเจนต์ที่เชื่อมต่อ" → ออก token อายุ 1 ชั่วโมง (อ่านผลลัพธ์ + ประเมินงาน) → กดคัดลอก
   2. ใน terminal: `sh docs/demo/three-doors.sh <job_revision_id>` (เอา id จาก URL หน้า Job detail) สคริปต์อ่าน token จาก clipboard ไม่พิมพ์ออกจอ และล้าง clipboard ให้
   3. แท็บ "งานของเอเจนต์": งานจาก agent ภายนอกโผล่ขึ้นและอัปเดตเองจนได้คะแนน (session ชื่อ "External agent")
   4. เพิกถอน token หลังสาธิต

การสมัครงานยังเป็นขั้นตอนที่เจ้าของทำเอง ระบบไม่ส่งใบสมัครให้

## 5. หยุดระบบ

กด Ctrl-C เพื่อหยุดแอป แล้วหยุดบริการเก็บข้อมูล (volume ยังอยู่)

```sh
rtk uv run --locked --project backend python scripts/local_infra.py stop \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```
