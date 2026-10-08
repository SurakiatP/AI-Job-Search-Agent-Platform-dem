# Runbook สาธิตระบบ

ข้อมูลทั้งหมดในโฟลเดอร์นี้ (ตัวตน ณัฐวุฒิ ใจดี, พิมพ์ชนก ศรีสมบูรณ์, บริษัท, ตำแหน่งงาน, อีเมล `nattawut@example.com`, โทร `000-000-0000`) เป็นข้อมูลสมมติเพื่อการสาธิตเท่านั้น ไม่ใช่บุคคลหรือบริษัทจริง

| ไฟล์ | ใช้ทำอะไร |
|------|-----------|
| `cv-th.pdf` / `cv-th.html` | CV ภาษาไทย (อัปโหลด `cv-th.pdf`) |
| `cv-en.pdf` / `cv-en.html` | CV ภาษาอังกฤษ |
| `cv-ai-engineer-th.pdf` / `cv-ai-engineer-th.html` | CV AI Engineer ภาษาไทย (พิมพ์ชนก ศรีสมบูรณ์) สำหรับโปรเจกต์ ai engineer |
| `jobs.md` | ตำแหน่งงานตัวอย่าง: 1–3 สำหรับ CV Frontend, 4–5 สำหรับ CV AI Engineer |

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

## 3. เตรียมข้อมูลก่อนสาธิต (ทำก่อนเริ่ม 15 นาที)

1. เปิดแอปจากลิงก์ใหม่ใน terminal (`--open-browser`) แล้วเข้า Settings → ผู้ให้บริการ AI ต้องขึ้น "ตั้งค่าแล้ว" (ใช้กับทุกโปรเจกต์)
2. โปรเจกต์ **ai engineer** → CV และเงื่อนไข → "+ เพิ่ม CV" → อัปโหลด `docs/demo/cv-ai-engineer-th.pdf`
3. ซ้อมหนึ่งรอบ: "เซสชันใหม่" → เลือก CV → "วางประกาศงานใหม่" → วางงานข้อ 5 (Computer Vision) จาก `jobs.md` → รอผลประเมิน แล้วกด "ร่างใหม่" จดหมายสมัครงานหนึ่งฉบับ เก็บไว้เป็นตัวอย่างสำรองถ้า AI ช้าตอนสาธิตสด
4. เก็บงานข้อ 4 (AI Engineer LLM) ไว้รันสดในขั้นจับคู่
5. ปิดแท็บอื่น ตั้งภาษาไทย และเลือกโหมดสว่างหรือมืดตามจอที่ใช้นำเสนอ

## 4. ลำดับการสาธิต (ประมาณ 20 นาที)

1. **Landing** (1 นาที): เล่าปัญหาและเลื่อนดู step tour แล้วกด "เริ่มใช้งาน"
2. **ภาพรวม** ของโปรเจกต์ ai engineer (1 นาที): แต่ละโปรเจกต์เป็น sandbox แยก CV งาน และเอกสาร
3. **CV และเงื่อนไข** (1 นาที): หลาย CV ต่อโปรเจกต์ มี CV หลัก อัปโหลดเวอร์ชันใหม่ได้
4. **ค้นหางาน** (2 นาที): ค้น "AI Engineer" ดูงานจริงในไทย อายุประกาศ และกด "บันทึก" หนึ่งงาน (ต้องต่ออินเทอร์เน็ต)
5. **จับคู่และประเมิน** (4 นาที): "เซสชันใหม่" → เลือก CV → วางงานข้อ 4 → เริ่มเซสชัน ระหว่างรอประมาณ 1 นาทีให้อธิบายว่า Hermes รันใน sandbox ที่ปิด network ผลที่ได้คือคะแนน AI, ทักษะที่ตรงกับประกาศ (คำนวณโดยไม่ใช้ AI ตาม FR-J03) และรายงาน ให้กด "คัดลอก" ที่รายงานด้วย
6. **ร่างเอกสาร** (4 นาที): กด "จดหมายสมัครงาน" รอประมาณ 1 นาที ใช้การ์ดตัวอย่าง → "สั่งแก้ด้วย AI" เช่น "สั้นลง เน้น RAG" → ได้เวอร์ชันใหม่ของฉบับเดิม
7. **แก้เอง** (2 นาที): "แก้ไข" → แก้หนึ่งบรรทัด → บันทึก → ได้เวอร์ชัน "แก้เอง" และไฟล์ PDF ใหม่ สลับดูเวอร์ชันก่อนหน้าได้ แล้วกดดาวน์โหลด
8. **Agent Console → Three Doors** (4 นาที):
   1. แท็บ "เอเจนต์ที่เชื่อมต่อ" → ออก token อายุ 1 ชั่วโมง (อ่านผลลัพธ์ + ประเมินงาน) → กดคัดลอก
   2. ใน terminal: `sh docs/demo/three-doors.sh <job_revision_id>` (เอา id จาก URL หน้ารายละเอียดงาน) สคริปต์อ่าน token จาก clipboard ไม่พิมพ์ออกจอ และล้าง clipboard ให้
   3. แท็บ "งานของเอเจนต์": งานจาก agent ภายนอกโผล่ขึ้นและอัปเดตเองจนได้คะแนน ใช้ Task เดียวกับ REST
   4. เพิกถอน token ทันทีให้ผู้ชมเห็น
9. **ปิดท้าย** (1 นาที): การสมัครงานยังเป็นขั้นตอนที่เจ้าของทำเอง ระบบไม่ส่งใบสมัครให้ และแผนถัดไปอยู่ใน `tor-roadmap.md`

ถ้า AI ช้าหรือล้มเหลว: เปิดเซสชันที่ซ้อมไว้ในข้อ 3.3 แทน แล้วอธิบายว่าปุ่ม "ลองใหม่" สร้างงานใหม่โดยไม่ลบประวัติ

## 5. หยุดระบบ

กด Ctrl-C เพื่อหยุดแอป แล้วหยุดบริการเก็บข้อมูล (volume ยังอยู่)

```sh
rtk uv run --locked --project backend python scripts/local_infra.py stop \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```
