# AI Job Search Agent Platform — DESIGN.md

สถานะ: เจ้าของอนุมัติ redesign spec 2026-10-07
ปรับปรุง: 2026-10-07

## หน้าที่ของเอกสาร

เอกสารนี้กำหนดหน้าตา ภาษา และพฤติกรรมของ frontend ใช้ก่อนสร้างหรือแก้หน้าจอ
สถาปัตยกรรมและขอบเขต API อยู่ใน [สเปกระบบ](docs/superpowers/specs/2026-10-03-platform-design.md)
Integration Hub เก็บสถานะและลิงก์อ้างอิง ส่วนข้อกำหนด UI ใช้ไฟล์นี้เป็นแหล่งหลัก

## เป้าหมายและแนวทาง

ชื่อแอปทุกภาษา: **AI Job Search Agent Platform**
ผู้ใช้เริ่มจาก landing page แล้วเข้าสู่พื้นที่หางานตาม Project
ให้เห็นงานที่สนใจ บทสนทนา และเอกสารที่ต้องตรวจโดยไม่เริ่มกรอกข้อมูลใหม่
ใช้พื้นสว่างเย็นกับสี indigo หลักเดียวกันทุกหน้า มี Light / Dark / System และใช้ motion เบา ๆ ตามกฎด้านล่าง
สีเขียว เหลือง แดง ใช้เฉพาะคะแนนความเหมาะสมและสถานะ ไม่ใช้เป็นสีตกแต่ง
ข้อความตัวอย่างต้องระบุว่าเป็นข้อมูลตัวอย่าง ไม่แต่งตัวเลข คำรับรอง หรือโลโก้นายจ้าง

## หน้าที่มีในรุ่นแรก

| หน้า | หน้าที่และเส้นทางหลัก |
|---|---|
| Landing | โครง Workbench: nav (ชื่อแอป ไทย/EN ธีม เริ่มต้นใช้งาน), headline สั้น, ปุ่มหลัก และตัวอย่างแท็บ Evaluate / Documents / Job search จากข้อมูลตัวอย่าง ตามด้วยสามขั้นตอน |
| Overview | ภาพรวมของ Project: CV ล่าสุด งานที่บันทึกพร้อมคะแนน เอกสารล่าสุด run ที่กำลังทำงาน และปุ่ม "ประเมินงานใหม่" |
| Projects | เปิด Project เดิมหรือสร้าง Project ใหม่ |
| New project | ตั้งชื่อและเป้าหมาย ไปเพิ่ม CV หรือเริ่ม chat |
| CV & preferences | CV ต้นฉบับ เงื่อนไขงาน และภาษาของเอกสารใหม่ |
| Agent Console | `/app/projects/:projectId/console` แท็บใน URL (`?tab=`): ไทม์ไลน์งานของเอเจนต์ (กรองตามสถานะ รีเฟรชอัตโนมัติทุก 5 วินาทีขณะมีงานค้าง), กล่องคำขออนุมัติ, เอเจนต์ที่เชื่อมต่อและ access token (แสดงครั้งเดียว ไม่เก็บในเครื่อง) และวิธีเชื่อมต่อ MCP / A2A (ต้องเปิด `--enable-sharing`) |
| Chat | Sessions ภายใน Project ผลประเมิน สถานะ agent และคำขออนุมัติ |
| Job search | งานไทยจริงจาก freehire.me ผ่าน backend proxy: ค้นหา, ตัวกรองใน URL, chip หมวดพร้อมจำนวน, master–detail, อายุประกาศและป้ายประกาศเก่า, ปุ่ม "Evaluate this job" ที่บันทึกงานแล้วไปหน้า Evaluate; ถ้าแหล่งข้อมูลล่มให้ดูข้อมูลตัวอย่างพร้อมป้ายชัดเจน |
| Saved jobs | งานที่บันทึก สถานะการสมัคร และขั้นตอนถัดไป |
| Job detail | เหตุผลที่เหมาะสม สิ่งที่ควรถาม แหล่งข้อมูล และเอกสารของงาน |
| Documents | ฉบับร่างและเวอร์ชันที่แยกจาก CV ต้นฉบับ |
| Document detail | อ่าน ตรวจ ขอแก้ไข และดาวน์โหลดเอกสาร |
| Settings | LLM provider/model, เครื่องมือ, การแชร์ Project, และ appearance |

Sidebar กว้าง 264px: ชื่อแอปพร้อมเครื่องหมาย, ตัวสลับ Project (dropdown), เมนู Overview, Evaluate (พร้อม Sessions), Agent Console, Saved jobs, Job search, Documents, CV & preferences
ส่วนล่างมี Settings, ปุ่มสลับธีม Light / Dark / System และ ไทย / EN
รองรับแชตโปร่งและการเปิด panel เอกสารด้านขวา บนจอแคบเปิดเอกสารเป็นหน้าแยก
ไม่เพิ่มระบบบัญชีผู้ใช้หรือ login สำหรับรุ่น local ที่เจ้าของใช้คนเดียว

## Frontend stack

Frontend stack: React + TypeScript + Vite, Tailwind CSS + shadcn/ui,
React Router และ react-i18next โดย DESIGN.md เป็นหลักสำหรับปรับหน้าตาของ UI primitives
การเปลี่ยน route หรือ UI locale ต้องรักษา Project/Session, appearance และ unsent draft

## Typography

| ส่วน | ฟอนต์ | ขนาด / line-height / น้ำหนัก |
|---|---|---|
| เนื้อหาไทยและ UI | Noto Sans Thai; fallback Manrope, sans-serif | 16px / 1.7 / 400 |
| เนื้อหาแชต | ฟอนต์ UI | 16px / 1.9 / 400 |
| Landing headline | Noto Serif Thai; serif fallback | 27–42px / 1.45–1.6 / 500 |
| หัวข้อหน้า | ฟอนต์ UI | 23–29px / 1.6 / 600 |
| Navigation และ controls | ฟอนต์ UI | 13–14px / 1.6–1.7 / 400–500 |
| ข้อความรอง | ฟอนต์ UI | 12–14px / 1.7 / 400 |
| เนื้อหาเอกสารอังกฤษ | Manrope; Noto Sans Thai fallback | 15–16px / 1.9 / 400 |
| ช่องพิมพ์ | ฟอนต์ UI | 16px / 1.8 / 400 |

ให้ข้อความไทยตัดบรรทัดตามธรรมชาติ ใช้ความกว้างบรรทัดและช่องไฟช่วยอ่าน
ชื่อแอปภาษาอังกฤษอาจแบ่งบรรทัดใน sidebar ขนาดแคบ แต่แสดงชื่อครบ
ข้อมูลสำคัญและข้อความผิดพลาดต้องอ่านได้โดยไม่ต้อง hover

## สี

| Token | Light | Dark |
|---|---|---|
| background | oklch(0.985 0.003 275) | oklch(0.17 0.012 275) |
| foreground | oklch(0.22 0.02 275) | oklch(0.96 0.005 275) |
| card (popover) | oklch(1 0 0) | oklch(0.21 0.014 275) |
| primary (ring) | oklch(0.51 0.23 277) | oklch(0.72 0.15 277) |
| primary-foreground | oklch(0.99 0 0) | oklch(0.18 0.04 277) |
| secondary | oklch(0.955 0.012 275) | oklch(0.26 0.016 275) |
| secondary-foreground | oklch(0.28 0.03 275) | oklch(0.94 0.005 275) |
| muted | oklch(0.965 0.006 275) | oklch(0.24 0.014 275) |
| muted-foreground | oklch(0.48 0.02 275) | oklch(0.74 0.015 275) |
| accent | oklch(0.95 0.03 277) | oklch(0.29 0.06 277) |
| accent-foreground | oklch(0.38 0.17 277) | oklch(0.88 0.06 277) |
| destructive | oklch(0.55 0.21 27) | oklch(0.7 0.17 25) |
| success | oklch(0.55 0.14 155) | oklch(0.74 0.14 155) |
| warning | oklch(0.62 0.14 70) | oklch(0.8 0.13 75) |
| border | oklch(0.91 0.008 275) | oklch(0.3 0.014 275) |
| input | oklch(0.88 0.01 275) | oklch(0.34 0.016 275) |
| sidebar | oklch(0.975 0.004 275) | oklch(0.19 0.013 275) |

ทุกสีและฟอนต์ผ่านตัวแปร CSS ใน `frontend/src/styles.css` ห้ามใช้ hex/oklch ตรง ๆ ที่อื่น
Accent เป็น indigo เท่านั้น; success / warning / destructive ใช้เฉพาะคะแนนความเหมาะสมและสถานะ
คะแนนความเหมาะสมเป็นช่วง 0–5 (≥4 success, ≥2.5 warning, ต่ำกว่านั้น destructive) และอาจไม่มีค่า ให้แสดง "—" พร้อมข้อความ "ยังไม่มีคะแนน"
ใช้เส้นแบ่งและพื้นผิวอย่างพอดี ให้สี indigo เน้นปุ่มหลัก การเลือก และลิงก์

### Motion

- ใช้ CSS เท่านั้น ไม่ใช้ไลบรารี motion
- animate เฉพาะ `transform` และ `opacity` (ยกเว้นวงแหวนคะแนนที่ animate `stroke-dashoffset` ซึ่งเป็น SVG paint)
- ปิดทั้งหมดเมื่อ `prefers-reduced-motion: reduce`
- ตัวแปรเวลา: fast 150ms, base 240ms, slow 900ms; easing `cubic-bezier(0.22, 1, 0.36, 1)`
- ฟอนต์: Noto Sans Thai สำหรับ UI, Noto Serif Thai เฉพาะ headline ของ landing, Manrope สำหรับเอกสารอังกฤษ; หัวข้อไม่เอียง
ตรวจ contrast กับพื้นจริงทั้งสองธีมก่อนส่งงาน โดยข้อความปกติอย่างน้อย 4.5:1
System ตาม appearance ของเครื่องและเปลี่ยนตามเมื่อเครื่องเปลี่ยนธีม
การเลือกธีมใช้ร่วมกันทุกหน้า เก็บเป็น preference ในเครื่อง ไม่ส่งค่า credential ไปเก็บใน browser

## ไทยและอังกฤษ

- ปุ่ม ไทย / EN อยู่มุมขวาบนใน header ของทุกหน้า รวม landing และจอแคบ
- สลับ navigation, labels, placeholder, validation, สถานะงาน และข้อความผิดพลาด
- คงหน้า Project, Session, draft ที่กำลังพิมพ์ และธีมขณะเปลี่ยนภาษา
- ชื่อ Project ที่ผู้ใช้ตั้ง ข้อมูลประกาศงาน และข้อความของผู้ใช้คงภาษาเดิม
- ภาษา UI แยกจากภาษาของ CV/Cover Letter ผู้ใช้เลือกภาษาของเอกสารใหม่ได้
- ชื่อแอปชื่อเดียวกันทั้งสองภาษา ใช้วันที่และตัวเลขตาม locale ที่เลือก
- ฟอนต์ PDF ต้องรองรับไทยและอังกฤษจริง ห้ามถือว่า browser preview พิสูจน์ PDF rendering แล้ว

## Flow และ navigation

Landing → Chat
Projects → New project → CV & preferences → Chat
Saved jobs → Job detail → Documents → Document detail → Chat
Settings → การตั้งค่าที่เลือก → กลับหน้าเดิม

มีปุ่มกลับในหน้ารายละเอียด และ browser back/forward ต้องรักษา route กับ Project/Session
ฟอร์มที่ยังไม่บันทึกคงอยู่ระหว่างสลับภาษาและการเดินทางภายในแอป
ใน product จริง การออกจากฟอร์มที่มีการเปลี่ยนแปลงให้เลือกเก็บหรือทิ้ง draft อย่างชัดเจน
เมื่อเปิดหน้าเว็บกลับมา โหลดสถานะงานจาก backend ไม่สร้างงานซ้ำเพราะ reconnect

## สถานะที่ต้องออกแบบขณะเชื่อม backend

- เริ่มใช้งาน: ยังไม่มี Project, CV หรือ LLM connection พร้อมปุ่มไปตั้งค่าส่วนที่ขาด
- Upload: กำลังส่งไฟล์, พร้อมใช้, ประเภทไม่รองรับ, ขนาดเกิน และอ่านข้อความไม่ได้
- Runs: queued, running, waiting_approval, completed, failed, cancelled และ interrupted
- Run ที่กำลังทำงานมีปุ่มหยุด รอผลยืนยันจาก backend ก่อนแสดง cancelled
- เมื่อ backend หยุด เก็บผลบางส่วนและให้เจ้าของกดลองใหม่เป็น run ใหม่
- การอนุมัติแสดงสิ่งที่จะเปลี่ยน Target และความต่างของ CV ก่อน owner ตัดสินใจ
- Connection error แสดงเหตุผลที่แก้ไขได้ พร้อม retry; ไม่แสดง API key หรือ raw traceback
- ผลประเมินมีแหล่งประกาศงาน เวลาที่อ่าน และเหตุผลของข้อเสนอแนะ
- เอกสารระบุเวอร์ชัน ภาษาของเอกสาร และ CV ต้นฉบับที่ใช้สร้าง
- ปุ่มสมัครแล้วเปลี่ยนสถานะที่เจ้าของบันทึก ไม่มีการส่งใบสมัครแทนผู้ใช้

## Responsive และ accessibility

ตั้งต้นให้ sidebar ประมาณ 220px และพื้นที่แชตอ่านสบาย
ลดคอลัมน์เอกสารและการ์ดเป็นแนวตั้งเมื่อเนื้อหาไม่พอดี แทนการบีบข้อความ
รองรับความกว้าง 320px โดยไม่เกิด horizontal overflow
เมนูบนจอแคบใช้ปุ่มเปิด/ปิดที่ระบุชื่อได้ ทุก control ใช้ keyboard ได้และมี focus ที่เห็นชัด
ใช้ native labels, buttons, tabs และสถานะ aria-live อย่างเหมาะสม
Touch targets ประมาณ 44px ช่อง input อย่างน้อย 16px และใช้ข้อความร่วมกับสีเพื่อบอกสถานะ

## หลักฐานและ reference

Mockup ตรวจภาษา การเดินทาง ธีม ช่องพิมพ์ และการจัดวางทั้งจอใหญ่และจอแคบแล้ว
Mockup เป็นข้อมูลสมมติ ไม่ได้เชื่อม Hermes, MinIO, PostgreSQL หรือ provider จริง
แหล่งอ้างอิง: [Refero styles](https://styles.refero.design/) และ
[DESIGN.md guidance](https://styles.refero.design/design-md/what-is-design-md/)
ข้อกำหนดใหม่นี้แทน draft เดิมที่มีเฉพาะธีม Light และชื่อแอปทดลอง
