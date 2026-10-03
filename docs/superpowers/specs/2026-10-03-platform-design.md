# AI Job Search Agent Platform — สเปกระบบ

วันที่: 2026-10-03
สถานะ: แบบสถาปัตยกรรมฉบับแรกสำหรับเจ้าของตรวจ ก่อนทำ implementation plan
ข้อกำหนด UI: [DESIGN.md](../../../DESIGN.md)

## เป้าหมายและเกณฑ์สำเร็จ

เจ้าของใช้คนเดียวบนเครื่องตัวเองเพื่อหางานในประเทศไทย เริ่มจากเพิ่ม CV และประกาศงานที่สนใจ
ระบบใช้ Hermes กับ Career Ops ประเมินความเหมาะสม สร้าง CV/Cover Letter และเก็บผลใน Project
Sessions ภายใน Project ใช้ CV และเงื่อนไขร่วมกัน เจ้าของตรวจเอกสารและส่งใบสมัครเอง
หน้าเว็บใช้ไทย/อังกฤษ มี landing, project chat, งาน, เอกสาร และ Settings ตาม DESIGN.md
แอปหรือ agent ภายนอกเรียกผ่าน MCP/A2A ได้เฉพาะ Project และความสามารถที่เจ้าของแชร์ให้

การส่งมอบต้องพิสูจน์ workflow จริง รวมการบันทึก PostgreSQL/MinIO, project isolation,
การคืนสถานะหลังเปิดหน้าเว็บใหม่, การอนุมัติ และความเท่าเทียมของ REST/MCP/A2A
Mockup และการตรวจ source upstream ยังไม่ใช่หลักฐานว่า runtime ทำงานครบแล้ว

## ข้อกำหนดที่ยืนยันแล้ว

- ชื่อ AI Job Search Agent Platform; UI ไทย/อังกฤษและ Light/Dark/System; ไม่มี animation
- รุ่นแรกไม่มีระบบบัญชีผู้ใช้หรือหน้า login และใช้งาน local เป็นหลัก
- Backend Python; แต่ละ Project แยก Hermes state และ execution sandbox
- PostgreSQL เก็บข้อมูลระบบ; MinIO โอเพนซอร์สเก็บไฟล์ แทนข้อเสนอ SQLite เดิม
- รับ PDF ที่เลือกข้อความได้, DOCX และข้อความโดยตรง ทั้งไทย/อังกฤษ; OCR อยู่ในระยะถัดไป
- งานทำต่อเมื่อปิดหน้าเว็บ หาก backend ยังรันอยู่
- หาก backend หยุด งานที่ยังไม่เสร็จแสดง interrupted เก็บผลบางส่วน และเจ้าของกดลองใหม่
- ผู้เรียกภายนอกใช้ provider/model ของเจ้าของและไม่เห็น API key
- เรียกใช้ได้เฉพาะ Project ที่แชร์ ผ่าน token จำกัดสิทธิ์ราย Project
- External capabilities: อ่านผล ประเมินงาน และสร้างเอกสาร
- แก้ CV หลักและลบข้อมูลต้องได้ owner approval; เจ้าของเป็นผู้ส่งใบสมัคร

รายละเอียดทางวิศวกรรมด้านล่างเป็นข้อเสนอสำหรับตรวจในเอกสารนี้ ไม่ใช่การประกาศว่าพัฒนาแล้ว

## โครงสร้างที่เสนอ

ใช้ Python/FastAPI เป็น modular monolith มี Project/Session service, Run service,
Authorization/Approval service, Artifact service และ Hermes adapter อยู่หลัง API boundary เดียว
Frontend ใช้ React + TypeScript + Vite มี routes และ internationalization
Build frontend เป็น static assets ที่ backend ให้บริการได้ในรุ่น local

| Component | หน้าที่ | ข้อมูลที่เป็นเจ้าของ |
|---|---|---|
| Web UI | Landing, chat, settings, review และ approvals | Preferences และ unsent drafts ใน browser |
| FastAPI | REST/SSE และ shared application services | กฎสิทธิ์และ workflow |
| PostgreSQL | Durable state และ queue/leases | Projects, Sessions, Runs, Events, Metadata, Approvals, Grants |
| MinIO OSS | Private S3 object storage | ไฟล์ต้นฉบับ เอกสาร และ artifacts |
| Hermes worker | เรียก Career Ops และสร้างผลตาม run | Profile/home และ execution state ของ Project |
| Project sandbox | อ่าน input snapshot และเขียน staging outputs | Temporary workspace ของ Project |
| MCP / A2A adapters | แปลง official protocol เป็น service calls | Protocol mappings อ้างอิง run เดียวกัน |

แนวทาง deploy มีสามระดับ: (1) backend/worker บนเครื่องกับ Docker สำหรับ data/sandbox,
(2) backend container และ workers ภายใน network เดียวกัน, (3) แยก queue/worker services
เสนอระดับแรกสำหรับเครื่องเจ้าของ รองรับการย้ายไป server ด้วย interfaces เดิม
ใช้ PostgreSQL queue ในรุ่นแรก เพิ่ม broker แยกเมื่อมีหลักฐานว่าขนาดงานต้องการ

## PostgreSQL และ lifecycle

เก็บ Projects, Sessions/Messages, Job Postings, CV Revisions, Document Revisions, Runs,
Run Events, Artifacts, Approval Requests และ Project Access Grants
ทุก resource ของ Project มี project_id และทุก lookup ตรวจทั้ง resource ID กับ Project
เก็บ application status ที่เจ้าของบันทึกแยกจาก agent run status
Provider configuration เก็บ provider/model กับ secret reference; credentials อยู่ใน secret store
Token ภายนอกเก็บ hash, project_id, capabilities, expiration, revoked_at และ audit metadata

Run เก็บ input snapshot ของ CV revision, job posting revision, ภาษาเอกสาร และ model configuration
การแก้ CV ระหว่าง run ไม่เปลี่ยน inputs ของงานนั้น ผลแสดง revision ที่ใช้จริง
run events มีเลขลำดับต่อ run เพื่อ replay หลัง reconnect
Queue/worker ใช้ lease และ transaction ทำให้แต่ละ Project มี active run ได้หนึ่งงาน
ค่าเริ่มต้นเสนอ active Projects รวมไม่เกินสอง Project และปรับได้ใน owner configuration

สถานะ: queued → running → completed / failed / cancelled
running อาจเป็น waiting_approval และกลับ running เมื่อ approval ที่ตรง revision ได้รับอนุมัติ
Shutdown หยุดรับ dispatch ใหม่ ยืนยันหยุด workers และทำเครื่องหมายงานไม่เสร็จ interrupted
เมื่อเริ่ม backend ใหม่ reconcile งานไม่เสร็จและ stale leases ห้ามทำงานเก่าซ้ำอัตโนมัติ
Retry สร้าง run ใหม่ที่อ้างอิง run เดิม ไม่อ้างว่า resume ได้จากจุดเดิมทุกกรณี
ผลที่ publish แล้วคงอยู่ และแยกผลบางส่วนจากเอกสารที่สร้างเสร็จชัดเจน

## FILE-001 — MinIO และไฟล์

ใช้ MinIO source ภายใต้ GNU AGPLv3 โดยตรวจ license และ build ของ revision ที่ตรึงก่อนใช้งาน
MinIO upstream ถูก archive และ README ระบุว่าไม่มีการดูแลต่อแล้ว ณ วันที่ตรวจสเปก
Source ที่ตรวจ: commit 7aac2a2c5b7c882e68c1ce017d8256be2feea27f
Buildability, dependency/security review และ runtime compatibility ของ commit นี้ยังต้องพิสูจน์
เลือก standalone deployment สำหรับ local เก็บ data volume แยกจาก container lifecycle
Artifact service ใช้ S3 APIs มาตรฐานเพื่อลดการผูก migration กับ vendor-specific features

ใช้ private bucket และ opaque object keys ภายใต้ Project namespace
PostgreSQL เก็บ file ID, project_id, kind, revision, MIME, size, checksum และ storage key
ชื่อไฟล์ที่เจ้าของเห็นแยกจาก storage key การเปลี่ยนชื่อไม่เปิดให้เลือก object key โดยตรง
Bucket/prefix ช่วยจัดระเบียบ; การอนุญาตเข้าถึงบังคับโดย application service ทุกครั้ง
ผู้เรียกภายนอกและ Hermes ไม่ได้รับ MinIO root credentials หรือ bucket-list access
รุ่นแรก download ผ่าน authorized backend streaming เพื่อให้ revocation มีผลกับ request ใหม่

Upload สร้าง pending metadata, ส่ง object, ตรวจ checksum และเปลี่ยน ready เมื่อเสร็จ
รายการที่ pending หรือ failed ยังไม่ใช้เป็น agent input หรือเปิดดาวน์โหลด
การล้มเหลวระหว่าง PostgreSQL กับ MinIO ต้อง reconcile ได้; ไม่อ้างว่าเป็น transaction เดียวกัน
CV ต้นฉบับและฉบับแก้ไขเป็น immutable revisions เอกสารงานเก็บแยกกับต้นฉบับ
Sandbox รับเฉพาะ input snapshots ของ Project; outputs เขียน staging แล้ว validate ก่อน publish
Artifact publisher ตรวจ path, symlink, ประเภทไฟล์ และ Project ownership

เสนอ upload limit 20 MiB ต่อไฟล์ ปรับได้ใน owner configuration
ตรวจจริงจากเนื้อหาและ MIME พร้อมแจ้งไฟล์ที่อ่านข้อความไม่ได้หรือเป็น PDF สแกน
Export เป้าหมายคือ PDF/DOCX และ text preview; ต้องพิสูจน์ fonts ภาษาไทยใน PDF
Backup ครอบคลุม PostgreSQL, object data และ manifest/checksums รวมถึงทดสอบ restore ที่สอดคล้องกัน
ยังไม่มีการติดตั้งหรือเปิด storage port ในขั้นออกแบบนี้

## HERMES-001 — Project isolation และ Career Ops

แต่ละ Project มี Hermes home/profile และ execution workspace ของตนเอง
เริ่ม worker ตามความต้องการ ใช้ Docker execution sandbox ที่จับคู่ Project อย่างชัดเจน
Project isolation ต้องครอบคลุม file tools และ tools อื่นทั้งหมด ไม่ใช่เฉพาะ terminal command
Mount input snapshots แบบ read-only; เขียนเฉพาะ staging outputs/workspace ของ Project
ไม่ mount host home, Project อื่น, Docker socket หรือ provider secret store เข้า sandbox
Sandbox มี CPU/memory/time limits และไม่ใช้ privileged mode
ตั้ง network ให้เรียกบริการที่ workflow ต้องใช้ได้โดยไม่เปิด control/storage APIs เป็น public tools
Hermes worker ใช้ credentials ผ่าน configuration ที่ backend ควบคุม; request ภายนอก override model/key ไม่ได้

ติดตั้ง Career Ops เป็น full checkout และโหลด Hermes skill router พร้อม scripts/modes ที่อ้างอิง
ตรึง Hermes และ Career Ops revision หลัง compatibility validation ไม่คัดลอกเฉพาะ SKILL.md
ใช้ native Hermes run/event/session APIs ผ่าน adapter โดยที่ browser ไม่เรียก worker โดยตรง
Source references: Hermes c8301ea6c9b797184df16a9c5dd462400b264ff4,
Career Ops c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7

Workflow แรก: รับ CV และประกาศ → เตรียม snapshot → ประเมินพร้อมหลักฐาน → สร้าง drafts → publish artifacts
ค้นหาเว็บไซต์งานไทยอัตโนมัติและ OCR เป็น workflow ภายหลังที่ต้องตรวจ upstream support เพิ่ม
หาก tool ใด bypass sandbox หรือหยุดงานไม่ได้ ต้องแก้ adapter/config และพิสูจน์ก่อนยอมรับ milestone

## AUTH-001 — Owner และ shared callers

Local owner UI ใช้ loopback และ backend-issued owner session พร้อม Origin/CSRF checks
Startup ให้ owner launch nonce ที่สุ่มและใช้ครั้งเดียว แลกเป็น HttpOnly/SameSite owner cookie
Bootstrap ต้องตรวจ nonce กับ Origin ไม่ออก owner session ให้ request ที่ไม่มีหลักฐานการ launch
ไม่มีการสมัครบัญชี แต่ owner privilege ต้องแยกจาก shared caller privilege อย่างตรวจสอบได้
Shared MCP/A2A listener ปิด LAN access ตามค่าเริ่มต้น เปิดได้อย่างชัดเจนเมื่อ owner ต้องการ
เมื่อเปิด LAN ใช้ project tokens; สำหรับ public server ต้องเพิ่ม HTTPS และ owner authentication ที่เหมาะสม
Owner management/approval routes ไม่เปิดให้ shared token แม้ caller ใช้ Project เดียวกัน

Capabilities: results:read, jobs:evaluate, documents:draft
Caller อ่าน run status, ผลประเมิน และ generated artifacts ที่ตนมี results:read ได้
ข้อเสนอสำหรับ review: base CV, uploaded raw inputs และ private chat history อ่านโดย owner เท่านั้น
Evaluation service ใช้ base CV ภายในได้ โดยไม่เปิดต้นฉบับเป็น public MCP resource
Generated CV/Cover Letter อาจมีข้อมูลของเจ้าของ จึงต้องถือว่า grant อ่าน artifacts เป็นการแชร์เอกสารเหล่านั้น

Protected changes ต้องผ่าน owner approval ที่ผูก target, revision, proposed change และ expiry
Agent เขียน draft ได้ ส่วนการ promote เป็น base CV หรือการลบ durable data เป็น platform operation
Approval ใช้ครั้งเดียวและตรวจสิทธิ์/target revision ใหม่ขณะ commit เพื่อป้องกันการเปลี่ยนเป้าระหว่างรอ
External callers ขอ approval หรืออ่านสถานะได้ แต่อนุมัติแทน owner ไม่ได้
Token ตั้งหมดอายุ เพิกถอนได้ และไม่ปรากฏใน logs หรือ chat; owner เห็นค่าเต็มเฉพาะตอนออก token

จำกัดจำนวน runs, active runs, runtime และ tool steps ราย Project ตาม owner configuration
ค่าเริ่มต้นที่เสนอ: external submissions 20 ครั้ง/ชั่วโมงต่อ grant, queued runs ไม่เกิน 10 ต่อ Project,
active execution 15 นาทีและ tool calls 30 ครั้งต่อ run; รอ owner approval ไม่คิดเป็น execution time
Approval หมดอายุใน 24 ชั่วโมง เมื่อหมดอายุจบงาน failed พร้อม approval_expired และกดลองใหม่ได้
ตรวจ limits ก่อน dispatch และระหว่างทำงาน ป้องกัน unlimited loop/queue growth
LLM charges อยู่ใน provider account ของ owner; limits เหล่านี้ไม่ใช่การรับประกันเพดานค่าใช้จ่ายทางการเงิน
บันทึก usage เมื่อ provider ส่งข้อมูล และไม่เปิด raw credentials/tool arguments ผ่าน public events

## REST-001 — Application API และ SSE

Prefix /api/v1; same-origin UI ใช้ owner session; shared surfaces ใช้ project bearer token
Project routes ตรวจ authenticated actor, capability และ Project ownership ผ่าน service layer เดียวกัน

| Route กลุ่มหลัก | Actor / behavior |
|---|---|
| Projects, Sessions, CV revisions, Preferences | Owner จัดการข้อมูลต้นทาง |
| POST /projects/{project_id}/runs | Owner หรือ token ที่มี capability ของ operation |
| GET /projects/{project_id}/runs/{run_id} | สถานะ/ผลที่ actor อ่านได้ |
| GET /projects/{project_id}/runs/{run_id}/events | SSE; replay ตาม event sequence / Last-Event-ID |
| POST /projects/{project_id}/runs/{run_id}/cancel | Owner หรือ grant เดิมที่สร้าง run นั้นและยังไม่ถูกเพิกถอน |
| File upload / artifact download | ตรวจ Project และ raw-input/generated-artifact policy |
| Documents / document revisions | Drafts แยกจาก base CV และอ้างอิง inputs |
| Approval resolve / token issue-revoke / provider settings | Owner-only |

Run request ระบุ session_id, operation, input references, output language และ idempotency key
operations รุ่นแรก: evaluate_job และ draft_documents; conversational owner UI ใช้ Hermes adapter ผ่าน Run service
การ reconnect หรือ request ซ้ำด้วย key เดิมและ body เดิมต้องไม่สร้างงานซ้ำ
Key เดิมกับ body ต่างกันตอบ conflict; ทุก input reference ตรวจ Project
Response เริ่มงานมี run_id กับ status ส่วนผลสุดท้ายอ้างอิง file/document IDs
SSE เผย progress ที่ sanitize แล้ว เช่น step/status/artifact IDs ไม่ส่ง secrets หรือ private raw logs
API errors ใช้ stable code, ข้อความที่แปลได้ และ retryable flag

## MCP-001 — Platform MCP

ใช้ official MCP SDK และ Streamable HTTP สำหรับการเรียกจากแอป/เครื่องอื่น
Tools รุ่นแรก: evaluate_job, draft_documents, get_run, cancel_run และ list_results
Resources คือผลและ generated artifacts ที่ผ่าน project authorization
Tool ที่เริ่มงานตอบ run_id/status เพื่อให้ติดตามงานยาวได้โดยไม่ผูกงานกับ HTTP connection
Wire details ต้องเทียบ official SDK/spec revision ที่ตรึงใน implementation plan
MCP ของ platform เรียก services ข้างต้น; native Hermes stdio conversation bridge มีหน้าที่ต่างกัน
ไม่มี tool ที่ให้ host shell, arbitrary object key, provider key หรือ Project อื่น

## A2A-001 — Platform Agent2Agent

ใช้ official A2A SDK และ Agent Card ระบุ skills, authentication และ endpoint จริง
Skills รุ่นแรก: evaluate_job และ draft_documents; ทุก task ผูก Project ที่ token อนุญาต
Task IDs map กับ durable runs และ artifacts ใน PostgreSQL/MinIO
Map queued/running เป็น submitted/working, รอข้อมูล/approval เป็น input-required,
completed/failed/cancelled ตาม protocol; interrupted map failed พร้อมรหัสเหตุผลที่ตรวจได้
ส่งผลหรือ artifact metadata ตามสิทธิ์ของ caller พร้อมช่องทางดาวน์โหลดที่ตรวจ token
Task cancellation ต้องเรียก execution cancellation และรอหยุดจริงก่อนประกาศ canceled
ไม่ใช้ in-memory native Hermes A2A registry เป็นแหล่ง durable task state ของ platform

## การเก็บ secrets และข้อมูล

Local secret adapter เสนอ macOS Keychain; บน server เปลี่ยนเป็น secret manager ผ่าน interface เดิม
API key รับโดย owner Settings ผ่าน backend ไม่เก็บใน localStorage, PostgreSQL plaintext หรือ artifact
PostgreSQL/MinIO service credentials เป็น deployment secrets และเปิดให้ component ที่ต้องใช้เท่านั้น
ข้อมูล CV ที่จำเป็นส่งไปยัง LLM provider ที่ owner เลือก การรัน local backend ไม่ได้ทำให้ LLM เป็น local โดยอัตโนมัติ
Provider configuration ต้องแจ้งเส้นทางข้อมูลนี้ก่อนใช้จริง และไม่แสดง key ที่บันทึกแล้วกลับในหน้า chat

## Milestones และการตรวจรับ

1. Infrastructure: PostgreSQL/MinIO OSS build, migrations, upload/download และ backup/restore
2. Core workflow: Hermes/Career Ops adapter, Project sandbox, durable runs และภาษาเอกสาร
3. Frontend: DESIGN.md routes, locales, themes, streaming, document review และ owner approvals
4. External access: MCP/A2A adapters, project tokens, capability enforcement และ LAN configuration

แต่ละ milestone ส่งงานที่ตรวจได้ และรักษา contract IDs ข้างต้น
ทดสอบไทย/อังกฤษจาก CV ตัวอย่างที่ไม่มีข้อมูลจริง พร้อมตรวจ PDF glyphs และ DOCX export
พิสูจน์ closing/reopening UI, backend restart, retry idempotency, cancel acknowledgement และ event replay
ใช้สอง Projects ทดสอบการข้ามไฟล์/IDs, sandbox escapes ผ่าน supported tools, token revocation และ approval replay
ทดสอบ REST/MCP/A2A ให้การประเมินและสร้างเอกสารอ้างอิง run/artifact services เดียวกัน
จำลอง MinIO/PostgreSQL failure และตรวจว่าไฟล์ไม่พร้อมใช้ไม่ถูก publish และ restore ได้
ข้อผิดพลาด upstream เรื่องไทย/sandbox/cancellation ต้องมีหลักฐานปิดก่อนถือว่าพร้อมใช้งาน

## สถานะ review และแหล่งอ้างอิง

ข้อตกลงผลิตภัณฑ์และ storage ยืนยันในบทสนทนาแล้ว รายละเอียดทางวิศวกรรมในสเปกนี้รอ owner review
ยังไม่สร้าง product code, containers, credentials หรือ implementation plan
เมื่อ owner ยืนยันสเปก ให้ใช้ writing-plans แล้วให้เจ้าของเลือกวิธีดำเนินการตาม brainstorming gate
Integration Hub เก็บ pointers, ADRs และผลตรวจเอกสาร ไม่สำเนา application logic

- [MinIO README — license, source-only distribution, maintenance status](https://github.com/minio/minio/blob/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/README.md)
- [MinIO GNU AGPLv3](https://github.com/minio/minio/blob/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/LICENSE)
- [Career Ops Hermes integration](https://github.com/career-ops-hq/career-ops/blob/c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7/docs/HERMES.md)
- [Hermes source](https://github.com/NousResearch/hermes-agent/tree/c8301ea6c9b797184df16a9c5dd462400b264ff4)
- [MCP specification](https://modelcontextprotocol.io/specification/latest)
- [A2A specification](https://a2a-protocol.org/latest/specification/)
