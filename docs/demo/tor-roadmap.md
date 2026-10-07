# งานของ Agent ตาม TOR: สถานะและแผนถัดไป

ใช้ประกอบการสาธิต อ้างอิงรหัสความต้องการ (FR) จาก TOR โครงการ AI Job Search Agent Platform

## โครงสร้างปัจจุบัน

| ชั้น | ส่วนประกอบ | หน้าที่ |
|---|---|---|
| Agent Core | backend ของแพลตฟอร์ม | Task แบบ durable, การขออนุมัติ, สิทธิ์ที่เพิกถอนได้, REST / MCP / A2A ใช้ Task เดียวกัน |
| Runner | Hermes Agent | รัน LLM และเครื่องมือใน sandbox ที่ปิด network |
| Skills | Career Ops | ความรู้งานหางานในรูป prompt (`modes/*.md`) และสคริปต์ |

ปัจจุบันเปิดใช้ 2 skills: `evaluate_job` (Career Ops `oferta`) และ `draft_documents` (Career Ops `cover`, `text`)

## สถานะตาม TOR

| ความต้องการ | สถานะ | หมายเหตุ |
|---|---|---|
| FR-A01 Task มี owner, requester, state, artifacts, events | มีแล้ว | ยังไม่แสดงผู้สั่งงานใน UI |
| FR-A03 ทำงานต่อหลัง restart และยกเลิกได้ | มีแล้ว | |
| FR-A05 การกระทำสำคัญต้องรออนุมัติ | มีแล้ว | ใช้กับการเปลี่ยน CV/ลบไฟล์ ยังไม่มี `apply.submit` |
| FR-A06 จำกัดขั้นและเวลาฝั่ง server | มีแล้ว | |
| FR-P01 REST + OpenAPI ที่ตรวจกับ runtime | มีแล้ว | OpenAPI 3.x สร้างจากโค้ด มี contract test |
| FR-P02 / FR-P04 MCP และ A2A พร้อม Agent Card | มีแล้ว | ยังไม่มี push notification และ OAuth 2.1 |
| FR-P07 สร้างผ่าน A2A แล้วดูผ่าน REST ด้วย id เดียวกัน | มีแล้ว | สาธิตใน Agent Console |
| FR-U03 รายการ agent ที่ได้รับสิทธิ์และเพิกถอนทันที | มีแล้ว | Agent Console → เอเจนต์ที่เชื่อมต่อ |
| FR-J01 / FR-J02 ค้นหางาน | บางส่วน | ค้นผ่านเว็บได้ ยังไม่เปิดเป็น skill ให้ agent ภายนอก |
| FR-J03 คะแนน deterministic แยกจาก LLM | มีแล้ว | Skill coverage จากพจนานุกรม คู่กับคะแนน AI |
| FR-J04 อายุประกาศและสัญญาณประกาศเก่า | มีแล้ว | ในหน้าค้นหางาน |
| FR-C02 ทุกข้อความใน CV ต้องมีหลักฐาน | บางส่วน | กำหนดใน prompt ยังไม่บังคับที่ service |
| FR-C03 ปรับ CV ต่อ 1 งาน | บางส่วน | ร่างได้ ยังไม่มี autopilot และ undo ทั้งชุด |
| FR-A04 ประกาศ skill ครั้งเดียวแล้วสร้างทุกช่องทาง | ยังไม่มี | operation ยังถูกเขียนตายตัวในหลายไฟล์ |
| FR-C01 คลังประสบการณ์ | ยังไม่มี | |
| FR-T01 / FR-T02 / FR-T03 ติดตามการสมัคร, auto-apply, ร่าง follow-up | ยังไม่มี | มีเฉพาะสถานะ saved / applied |

## แผนถัดไป

1. **Skill registry (FR-A04)** ประกาศ skill จากโหมดของ Career Ops พร้อมสิทธิ์และรูปแบบผลลัพธ์ แล้วสร้าง REST, MCP tools และ Agent Card จากที่เดียว
2. **เพิ่ม skills จาก Career Ops ที่มีอยู่แล้ว**

   | TOR | Career Ops |
   |---|---|
   | FR-C02 ตรวจหลักฐาน | `verify-cv-facts.mjs`, `story-provenance-check.mjs` |
   | FR-C01 คลังประสบการณ์ | `modes/master-profile.md`, `career-profile.mjs` |
   | FR-T01 ติดตามการสมัคร | `tracker.mjs`, `set-status.mjs`, `funnel-stages.mjs` |
   | FR-T02 เตรียมใบสมัคร (คนกดส่ง) | `modes/apply.md`, `application-answers.mjs` |
   | FR-T03 ร่าง follow-up | `modes/followup.md`, `modes/email.md` |
   | ซ้อมสัมภาษณ์ | `modes/interview-prep.md` |

3. **บังคับหลักฐานที่ service** ตรวจข้อความในเอกสารที่ร่างกับ CV ก่อนเผยแพร่
4. **ตัดสินใจเรื่องฐานโค้ดตาม TOR** (fork Freehire, Go, SvelteKit) แล้วบันทึกเป็น ADR โดยใช้ Hermes เป็น runner และแนวคิด Agent Core เดิม

## คำถามถึงลูกค้า

- TOR ไม่มีข้อ 4, ข้อ 6 และภาคผนวก ก.2 และระบุ 6 ชุดงานแต่ตารางมี 5 ชุด
- ขอบเขตของ auto-apply: ต้องการให้ระบบส่งใบสมัครจริงในเฟสใด
