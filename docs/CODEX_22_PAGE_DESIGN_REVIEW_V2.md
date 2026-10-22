# 22 Page Design Review — Round 2

วันที่ 2026-10-17 · Reviewer `gpt-6.1-sol` · reasoning **high**  
วิธี: **Assessment A — independent expert visual walkthrough**; ยังไม่รวม Assessment B/detector ของผู้ประสานงาน

> ตรวจด้วย `view_image` ครบ **22/22 selected PNGs** ตาม [final round-2 snapshot](codex_gen_page/review-snapshot-round2-2026-10-17.json) ที่ status complete และผู้ประสานงานยืนยัน freeze แล้ว รวมดู 35 PNG ที่ไม่ซ้ำกันในรอบนี้: ชุดสุดท้าย 22 + intermediate versions ที่ถูกแทนที่ 13; คะแนนใช้เฉพาะชุดสุดท้าย

## เกณฑ์และขอบเขต

ประเมิน PNG ใหม่ตามภาพที่เห็นจริงด้วย rubric เดียวกับ [รอบแรก](CODEX_22_PAGE_DESIGN_REVIEW.md): Beauty **25%**, New-user ease **35%**, Layout/hierarchy **25%**, Trust/status/source clarity **15%**, ทุกมิติ 0–10; รวม `0.25B + 0.35E + 0.25L + 0.15T` ปัดหนึ่งตำแหน่งแบบ half-up เป้าหมาย 10/10 เป็น quality bar ไม่ใช่เหตุผลให้เพิ่มคะแนน

คะแนนเป็น expert simulated walkthrough ไม่ใช่ผลทดลองกับผู้ใช้ ไม่มี application implementation, browser interaction, application tests หรือ user study ในงานนี้ ภาพ English/desktop/light ไม่พิสูจน์ Thai/mobile/dark, contrast/a11y, live API/security หรือ motion ที่ทำงานจริง เอกสาร motion เป็นแผนสำหรับภายหลังเท่านั้น

**ภาพใหม่ทุกหน้า 01–22 เป็น draft รอ owner approval** การอนุมัติเดิม 01–06 ใช้กับ version เก่า ไม่ได้อนุมัติภาพรอบนี้โดยอัตโนมัติ Version และ PNG ที่ประเมินยึด final round-2 snapshot รวมภาพแก้ไขที่เลือกภายหลัง; เปรียบเทียบกับ baseline ใน `docs/codex_gen_page/review-scores-2026-10-17.json`

**การเทียบที่ต้องระวัง:** 01 เปลี่ยนจาก populated Overview เป็น first-run/no-CV; 09 เปลี่ยนจาก current เป็น historical document revision คะแนนใหม่วัดความชัดของ state ที่เห็น ไม่พิสูจน์ว่า state เดิมดีขึ้นหรือความสามารถทั้งหมดถูกคงไว้ Delta เป็นความต่างของคะแนน concept ภายใต้เกณฑ์เดิม ไม่ใช่ผลวัดการปรับ usability

**10/10 quality bar:** รู้เป้าหมายหน้าและทางไปต่อโดยไม่รู้ระบบภายใน; ทำ decision จาก source/revision/status ที่ตรงจริง; ใช้ shell/actions/copy ร่วมกัน; ไม่มีภาพสื่อสิทธิ์หรือผลสำเร็จเกิน contract; pixel art ไม่แย่งงาน; motion เสริมข้อมูลโดยไม่สร้าง progress; ผ่าน prototype และ user validation ก่อนกล่าวถึงความสำเร็จจริง P1 = semantic/permission/status risk ต้องแก้ก่อนส่งต่อ; P2 = อุปสรรค task/consistency ที่มีผล; P3 = รายละเอียด คะแนนต่ำกว่า 8.0 ต้องจัดคิวปรับ แต่คะแนนสูงยังมี P1/P2 ได้

## คะแนนเปรียบเทียบ — selected images เท่านั้น

| # | Page | Old | B | E | L | T | New | Δ | P | Evidence |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 01 | Overview / Dashboard | 7.9 | 8.5 | 9.0 | 8.7 | 8.5 | **8.7** | +0.8 | P3 | [PNG](codex_gen_page/01-overview-desktop-light-v2.png) |
| 02 | Job Search Workspace | 7.5 | 8.5 | 8.6 | 8.6 | 8.6 | **8.6** | +1.1 | P2 | [PNG](codex_gen_page/02-job-search-desktop-light-v4.png) |
| 03 | Evaluation Sessions index | 8.1 | 8.5 | 8.6 | 8.7 | 8.9 | **8.6** | +0.5 | P3 | [PNG](codex_gen_page/03-evaluation-sessions-desktop-light-v3.png) |
| 04 | Evaluation Session Workspace | 7.8 | 8.6 | 8.5 | 8.6 | 8.5 | **8.6** | +0.8 | P2 | [PNG](codex_gen_page/04-evaluation-workspace-desktop-light-v4.png) |
| 05 | Applications | 8.1 | 8.2 | 8.4 | 8.2 | 8.8 | **8.4** | +0.3 | P2 | [PNG](codex_gen_page/05-applications-list-desktop-light-v2.png) |
| 06 | Job Detail | 7.9 | 8.4 | 8.6 | 8.5 | 8.8 | **8.6** | +0.7 | P2 | [PNG](codex_gen_page/06-job-detail-desktop-light-v4.png) |
| 07 | CV & Experience | 7.5 | 8.5 | 8.6 | 8.7 | 8.8 | **8.6** | +1.1 | P3 | [PNG](codex_gen_page/07-cv-experience-desktop-light-v3.png) |
| 08 | Documents library | 7.6 | 8.5 | 8.8 | 8.7 | 8.6 | **8.7** | +1.1 | P3 | [PNG](codex_gen_page/08-documents-desktop-light-v2.png) |
| 09 | Document Detail | 7.9 | 8.5 | 8.8 | 8.7 | 9.0 | **8.7** | +0.8 | P3 | [PNG](codex_gen_page/09-document-detail-desktop-light-v4.png) |
| 10 | Agent Activity / Console | 7.3 | 8.5 | 8.8 | 8.7 | 9.0 | **8.7** | +1.4 | P3 | [PNG](codex_gen_page/10-agent-activity-desktop-light-v3.png) |
| 11 | Settings | 7.4 | 8.4 | 8.6 | 8.5 | 8.8 | **8.6** | +1.2 | P3 | [PNG](codex_gen_page/11-settings-desktop-light-v2.png) |
| 12 | Projects | 7.8 | 8.3 | 8.5 | 8.2 | 8.7 | **8.4** | +0.6 | P3 | [PNG](codex_gen_page/12-projects-desktop-light-v3.png) |
| 13 | New Project | 8.0 | 8.4 | 9.1 | 8.8 | 8.8 | **8.8** | +0.8 | P3 | [PNG](codex_gen_page/13-new-project-desktop-light-v2.png) |
| 14 | Public Landing | 7.7 | 8.6 | 8.7 | 8.7 | 8.7 | **8.7** | +1.0 | P2 | [PNG](codex_gen_page/14-landing-desktop-light-v3.png) |
| 15 | Login | 8.2 | 8.3 | 8.9 | 8.6 | 8.5 | **8.6** | +0.4 | P3 | [PNG](codex_gen_page/15-login-desktop-light-v2.png) |
| 16 | Sign Up | 7.9 | 8.4 | 8.9 | 8.7 | 8.8 | **8.7** | +0.8 | P3 | [PNG](codex_gen_page/16-signup-desktop-light-v3.png) |
| 17 | Forgot Password | 8.4 | 8.5 | 9.0 | 8.9 | 8.7 | **8.8** | +0.4 | P3 | [PNG](codex_gen_page/17-forgot-password-desktop-light-v2.png) |
| 18 | Reset Password | 8.3 | 8.5 | 8.8 | 8.8 | 8.6 | **8.7** | +0.4 | P3 | [PNG](codex_gen_page/18-reset-password-desktop-light-v2.png) |
| 19 | Verify Email | 7.9 | 8.5 | 8.8 | 8.8 | 8.9 | **8.7** | +0.8 | P3 | [PNG](codex_gen_page/19-verify-email-desktop-light-v2.png) |
| 20 | Account | 7.5 | 8.5 | 8.6 | 8.6 | 8.9 | **8.6** | +1.1 | P3 | [PNG](codex_gen_page/20-account-desktop-light-v2.png) |
| 21 | OAuth Consent | 7.8 | 8.3 | 8.3 | 8.2 | 9.1 | **8.4** | +0.6 | P2 | [PNG](codex_gen_page/21-oauth-consent-desktop-light-v4.png) |
| 22 | Digest Unsubscribe | 8.4 | 8.5 | 9.0 | 8.8 | 8.9 | **8.8** | +0.4 | P3 | [PNG](codex_gen_page/22-digest-unsubscribe-desktop-light-v2.png) |

เฉลี่ยจาก raw weighted scores: **8.6/10** (ก่อนปัด 8.636363636363636363636363636) เทียบเดิม **7.8/10** (ก่อนปัด7.845), เพิ่ม **+0.8** จากค่าเฉลี่ยก่อนปัด; Δ รายแถวคำนวณจากคะแนนที่แสดงหนึ่งตำแหน่ง B/E/L/T เฉลี่ยใหม่ = **8.5/8.7/8.6/8.8** ไม่มีหน้าใดได้10 และไม่มีหน้าต่ำกว่า8.0 ทุกหน้าให้น้ำหนักเท่ากัน ไม่ใช่ usage-weighted metric

พบ **0 remaining P1 ในภาพที่เลือก** และ **6 remaining P2** ตามรายละเอียดด้านล่าง ค่านี้ไม่รับรอง security enforcement หรือความพร้อม production และไม่เพิ่ม owner approval

## ลำดับปรับต่อ — 6 remaining P2

| ลำดับ | หน้า / บริเวณ | สิ่งที่ยังทำให้คนใหม่ลังเล | เกณฑ์รับงานก่อน implementation acceptance |
|---|---|---|---|
| 1 | 04 / Related documents | Tailored CV rev2 ใช้คำ Proposed changes แต่มี Open document จึงยังแยก published file กับข้อเสนอรอ review ไม่เต็มที่ | ใช้ label ต่างกันและแสดง document row เฉพาะ actual published resource; proposal อยู่ใน existing review ไม่สร้างไฟล์/endpoint ปลอม |
| 2 | 21 / consent footer | client/project อยู่ห่างปุ่ม Allow และคำ application actions กว้าง | summary ใกล้ decision derive จาก selection จริง; ระบุสอง write scopes ที่ต้อง opt-in โดยไม่เหมารวม Search |
| 3 | 02 / Match context | เลือก CV ชัดแล้ว แต่ไม่เห็นคำช่วย configured provider/data use ในบริบท AI | อธิบายข้อมูล CV ที่จำเป็นถูกส่งให้ configured provider ตาม policy เดิม; selector ใช้ supported latest CV revision |
| 4 | 05 / stage menu | next-step links ช่วยมากขึ้น แต่ Change stage ยังซ่อนใน ellipsis และ Open ใช้ external glyph | เมนูชื่อชัด/keyboard หาเจอ, internal route ไม่สื่อเปิดเว็บภายนอก, pending/rollback เมื่อบันทึกล้มเหลว |
| 5 | 06 / Prepare documents | ยังไม่ทราบว่าเปิด workspace เดิมหรือเริ่ม run | คำช่วย/label บอก destination และไม่เริ่มงานซ้ำจากการนำทาง; note/email/stage actions ยังคงบริบทเดิม |
| 6 | 14 / How it works | benefit และขั้นตอนชัด แต่ prerequisites/provider setup ยังไม่อยู่ในภาพหลัก | อธิบาย setup/ข้อมูลที่ต้องใช้ตาม source-supported flow โดยไม่อ้าง AI พร้อมหรือรับประกันผล |

P3 ที่ควรเก็บใน shared handoff: ย่อ pixel compass หน้า01ตามขนาดตกแต่งที่กำหนด; ทำ status waiting/expired กับ internal-link icons ให้เป็นชุดเดียว; ลดคำซ้ำและ panel height ใน12/13/15; ตรวจ long Thai text และทุก state ที่ยังไม่ pictured คะแนน Beauty เฉลี่ย8.5สะท้อนความสะอาดและความต่อเนื่องที่ดีขึ้น ยังมีรายละเอียด typography/spacing/asset scale ให้จัดเป็นระบบเดียวก่อนถึง quality bar10 การแก้ข้อใดข้อหนึ่งไม่รับประกันคะแนน10

## รายหน้า — prior finding / สิ่งที่เห็น / งานคงเหลือ

### 01 — Overview / Dashboard v2

หลักฐาน: [PNG](codex_gen_page/01-overview-desktop-light-v2.png) · [handoff](01_OVERVIEW_DESIGN_V2.md)

**แก้แล้ว:** first-run ที่หายไปมี Add your first CV เป็น action เด่น, Find jobs เป็นทางเลือก และ Evaluate แสดง Not started แทนผลปลอม ไม่มี typo/green Saved จากภาพเก่าให้เลียนแบบ Theme/Language มี label ชัด

**ยังต้องระวัง / P3:** guide ขวาเป็นสามย่อหน้าและ pixel compass เด่นใกล้ระดับหัวเรื่อง ลดเป็นข้อความช่วยสั้นและขนาดตกแต่งตาม 24–40px contract เพื่อไม่แข่งกับ Add CV; ไม่จำเป็นต้องเพิ่มความเคลื่อนไหวให้ส่วนว่างสองกล่องล่าง

**รับงานเมื่อ:** first CV เข้าสู่ Profile/upload เดิม, keyword search ใช้ได้ตามข้อกำหนดโดยไม่บังคับ upload; progression เปลี่ยนหลัง API สำเร็จเท่านั้น; populated/attention state เดิมยังต้องตรวจแยก ความน่าเป็นมิตรเพิ่มจาก hierarchy และ pixel accent ในภาพนิ่ง ส่วน greeting ≤600ms เป็นแผนที่ยังไม่พิสูจน์

### 02 — Job Search Workspace v4

หลักฐาน: [PNG](codex_gen_page/02-job-search-desktop-light-v4.png) · [handoff](02_JOB_SEARCH_DESIGN_V4.md)

**แก้แล้ว:** query/Search มาก่อน filters/presets, CV dropdown และผลของการเปลี่ยน CV ชัด; count 8/11 มีทางดู matched/missing; AI 78% แยกจาก rule-based evidence พร้อม caveat; Saved เป็น neutral และปุ่ม Save ตรงกับงานที่ยังไม่บันทึก

**ภาพแก้ยืนยันเพิ่ม:** v4 คืน Search/Smart match และเอา Compare tray ออกแล้ว จึงไม่เพิ่ม selection workflow ที่ไม่รองรับ แต่ “Changing CV affects new estimates only” ยังไม่บอกเรื่อง configured provider ที่จะใช้ข้อมูล CV ใน AI mode; ให้มีคำช่วยในบริบทก่อนเริ่มตาม policy เดิม

**รับงานเมื่อ / P2:** คง mode/filter/pagination URL semantics; CV selector เลือก CV ที่รองรับโดยใช้ latest revision ของ CV นั้นตาม `SearchPage.tsx:290–295`, ไม่แอบเป็น historical revision selector; source requests ส่ง `cv_revision_id` จริง; Evaluate ใช้ exact pair/idempotent flow ไม่เอา 78% มาเป็น session score และไม่เพิ่ม evidence/API fields เพื่อเลียนแบบภาพ

### 03 — Evaluation Sessions index v3

หลักฐาน: [PNG](codex_gen_page/03-evaluation-sessions-desktop-light-v3.png) · [handoff](03_EVALUATION_SESSIONS_DESIGN_V3.md)

**แก้แล้ว:** Latest activity แทน Status ช่วยแยก run จาก session; next action ระบุ Review proposed CV changes ตาม operation; fixed pair ชัดและเลิกพูด existing dialog

**ภาพแก้ยืนยันเพิ่ม:** Completed (1) ตรงตาราง, เอา inferred timestamps/actor และ Read-only badge ซ้ำออกแล้ว ตารางจึงอ่าน state/action ได้ตรงและเร็วขึ้น

**ยังค้าง / P3 และรับงานเมื่อ:** คำว่า latest run ใน helper ยังเป็นศัพท์ภายใน ใช้ latest agent task หรืออธิบายสั้น; หากนำ score เก่ากลับมาให้ติด Previous evaluation แทนผลของ run ปัจจุบัน; count/filter อิง derived run/valid approval จริง ไม่เพิ่ม session status field และไม่สร้าง timestamps/actor ที่ไม่มีข้อมูล

### 04 — Evaluation Session Workspace v4

หลักฐาน: [PNG](codex_gen_page/04-evaluation-workspace-desktop-light-v4.png) · [handoff](04_EVALUATION_WORKSPACE_DESIGN_V4.md)

**แก้แล้ว:** ไม่มี green live dot และมี Review หลักตำแหน่งเดียว พร้อมข้อความว่าการเปิด review ยังไม่อนุมัติ/แทน CV; source pair อ่านง่าย

**ภาพแก้ยืนยันเพิ่ม:** generic composer/attachment ถูกเอาออก; คืน Evaluation/Documents/Answers/History และ Document language แล้ว; cover letter บอก earlier completed run จึงอยู่ร่วมกับงานรอคนได้อย่างมีเหตุผล

**ยังค้าง / P2 และรับงานเมื่อ:** Related Tailored CV rev2 ต้องเป็น published document ที่มีอยู่จริง ไม่เปลี่ยน `TailorPayload` proposal ให้เป็นไฟล์ดาวน์โหลดเพียงเพราะภาพมี Open document; steps เป็น actual events เท่านั้น; source pair คง SessionView เดิม, Review เปิดดูไม่อนุมัติ, scoped redraft อยู่กับ document และ waiting state ไม่มี running animation ส่วน internal links ไม่จำเป็นต้องใช้ external glyph

### 05 — Applications List v2

หลักฐาน: [PNG](codex_gen_page/05-applications-list-desktop-light-v2.png) · [handoff](05_APPLICATIONS_DESIGN_V2.md)

**แก้แล้ว:** มี Next step ที่อธิบายงานต่อแทนวันอย่างเดียว; tracking-only อยู่ทั้ง subtitle/footer; Find jobs กับ Add posting แยกน้ำหนัก, List/Board บอกว่าเป็นข้อมูลชุดเดียวกัน และสถานะ neutral/active/closed แยกด้วยข้อความ

**ยังค้าง / P2:** การเปลี่ยน stage ยังอยู่ใน ellipsis ไม่เห็น Change stage; Open ใช้ external-link glyph ทั้งที่เป็น Job Detail ภายใน บริบท contact/location เต็มทุกแถวเพิ่มความหนาแน่นและต้องมีจริงใน source

**รับงานเมื่อ:** ชื่อเมนูบอก Change stage และ keyboard discoverability; internal navigation ใช้ label/icon ถูก; Next step เป็นคำแนะนำ/ลิงก์ไป action เดิม ไม่อ้าง deadline/reply ที่ระบบไม่รู้; optimistic stage ต้อง Pending/rollback ส่วน Board ยังไม่ได้ pictured ไม่ให้คะแนนเกิน List

### 06 — Job Detail v4

หลักฐาน: [PNG](codex_gen_page/06-job-detail-desktop-light-v4.png) · [handoff](06_JOB_DETAIL_DESIGN_V4.md)

**แก้แล้ว:** แยก evaluation sources กับ tracking ด้านขวา; ไม่ใช้ contact avatar; Write email ระบุเปิดแอปอีเมล และหลักฐาน 8/11 มีทางดู

**ภาพแก้ยืนยันเพิ่ม:** source CV v4 แยกจาก Tailored CV document revision2, timeline เป็น Stage updated/Email logged/Note added ที่ recorded แทน employer confirmation; Add note/Log email กลับมาแล้วและไม่ต้องเดาเมนู

**ยังค้าง / P2 และรับงานเมื่อ:** Prepare documents ยังไม่บอกว่าพาไป workspace เดิมหรือเริ่มงาน ควรระบุ context ตาม destination จริง; score circle ยังเด่น ให้คง evidence ติดกันและ full report เปิดได้; stage/notes/email feedback เป็น actual recorded data, source pair จาก SessionView, mailto เปิดแอป ไม่อ้างส่งแล้ว และไม่เริ่ม run ซ้ำจากการนำทาง

### 07 — CV & Experience v3

หลักฐาน: [PNG](codex_gen_page/07-cv-experience-desktop-light-v3.png) · [handoff](07_CV_EXPERIENCE_DESIGN_V3.md)

**แก้แล้ว:** View file มองเห็นก่อน Upload/Extract facts; experience bank เหลือ summary และ Review facts แทนรายการซ้ำใน tab; Primary default ต่อ new evaluations อธิบายใกล้ CVs

**ภาพแก้ยืนยันเพิ่ม:** Document language ระบุ generated documents, เอา notification promises และ Daily limit50files ออกแล้ว Advanced preferences เป็น disclosure ที่ไม่แต่งค่า

**ยังค้าง / P3 และรับงานเมื่อ:** Make primary ยังคงผ่าน ellipsis ให้ menu มีชื่อและ keyboard path ชัด; `output_language`/notification/advanced settings ตรง source เดิม, View file ใช้ authorized file behavior ไม่เพิ่ม preview endpoint; upload/extraction pending/failure/provider gates และ evidence bank CRUD/immutable facts ยังครบ

### 08 — Documents library v2

หลักฐาน: [PNG](codex_gen_page/08-documents-desktop-light-v2.png) · [handoff](08_DOCUMENTS_DESIGN_V2.md)

**แก้แล้ว:** Job & evaluation ใช้ชื่อ role/company ก่อน ID; แยก Source CV v4 จาก Document rev2 ในบรรทัดคนละหน้าที่, Open evaluations ใช้ internal icon และเลิก sort arrow ที่ไม่ได้รองรับ; Undo trash ยังอยู่

**ยังค้าง / P3:** Needs review เด่นกว่า Partial อาจถูกเข้าใจว่าเป็น pending approval ทั้งที่เป็น incomplete document ใช้ Partial เป็นสถานะหลัก แล้วบอกให้เปิดตรวจสิ่งที่ยังไม่ครบ; Ready ยังหมายถึง resource พร้อม ไม่ใช่ owner ตรวจแล้ว

**รับงานเมื่อ:** source มาจาก actual run/session ของ document revision นั้น; unavailable provenance ต้องบอกตรง; แสดง partial โดยไม่สร้าง approval request ปลอม; empty library พาไป evaluation เดิมและ filter empty มี reset; trash/undo/restore/permanent delete คง confirmations/expiry ตาม contract

### 09 — Document Detail v4

หลักฐาน: [PNG](codex_gen_page/09-document-detail-desktop-light-v4.png) · [handoff](09_DOCUMENT_DETAIL_DESIGN_V4.md)

**แก้แล้ว:** Viewing historical revision1 กับ Current revision2 ชัด, Download selected version แยกจาก Edit current version และ Restore as new version; Source for this version อยู่ติด preview

**ภาพแก้ยืนยันเพิ่ม:** Documents active ถูก resource, source CVv4/jobrev3 สอดคล้อง Evaluation014 ในหน้า04/06 แล้ว historical document revision จึงไม่ทำให้เข้าใจว่า session pair เปลี่ยน

**ยังค้าง / P3 และรับงานเมื่อ:** historical ถูกย้ำทั้ง badge/dropdown/banner/history ช่วยความปลอดภัยแต่ลดคำซ้ำได้; preview/download/source ต้องตรง selected revision, Edit current เปลี่ยน context ชัดไม่แก้ historical เงียบๆ, Restore สร้างใหม่ไม่เขียนทับ, promotion ใช้ expected-current guard การเปลี่ยน pictured state ทำให้ delta ไม่ใช่การเทียบ current view เดิมโดยตรง

### 10 — Agent Activity v3

หลักฐาน: [PNG](codex_gen_page/10-agent-activity-desktop-light-v3.png) · [handoff](10_AGENT_ACTIVITY_DESIGN_V3.md)

**แก้แล้ว:** extraction ใช้ Open CV & facts แทน session ปลอม; แยก Needs your decision/Running/terminal และคง actual-status reminder; ไม่ทำ decorative motion แทน state

**ภาพแก้ยืนยันเพิ่ม:** Finished รวม completed/failed โดยไม่เรียกทุกงานว่า Completed; helper ระบุ review แล้ว approve or deny จึงไม่ชี้นำ approve; internal actions ใช้ลูกศรและ pixel compass เล็กลง

**ยังค้าง / P3 และรับงานเมื่อ:** แต่ละ section ค่อนข้างสูงเมื่อมีงานมาก ให้คง attention-first แล้วใช้ compact rows/pagination ตามข้อมูลเดิม; completed/failed/interrupted/cancelled เป็น named state จริง, Review request ไม่ตัดสินใจ, scope/expiry/consumed ยังบังคับเดิม และ extraction ไม่สร้าง session ปลอม; pixel ไม่สื่อสถานะและ motion หยุดเมื่อ waiting

### 11 — Settings v2

หลักฐาน: [PNG](codex_gen_page/11-settings-desktop-light-v2.png) · [handoff](11_SETTINGS_DESIGN_V2.md)

**แก้แล้ว:** global rail ไม่แสร้งว่า Appearance เป็น project setting; browser/installation/selected-project scope อยู่ใต้ section; theme choices เล็กและ apply immediately ชัด; Check AI setup แปลศัพท์ gateway เป็นปัญหาที่ผู้ใช้พยายามแก้

**ยังค้าง / P3:** subtitle “Account-wide preferences” ยังครอบ browser/installation กว้างเกินจริง ใช้คำกลางที่ครอบสาม scope; Webhooks/Account Telegram ต้องแสดงขอบเขตของ control จริงเมื่อเปิด ไม่ให้ label รวมทำให้คิดว่าทุกอย่างเป็น project scope

**รับงานเมื่อ:** tools/sharing/webhooks มี actual project selector ตาม URL เมื่อเปิด, appearance เปลี่ยนทันทีไม่ส่ง Save ปลอม; no-provider มีทาง setup แต่ไม่อ้างพร้อมก่อนตรวจ; account identity/security link ยังไป Account และ secret fields ไม่มี persistence/animation ชวนเปิดเผย ภาพนี้ไม่พิสูจน์ subviews หรือ security behavior

### 12 — Projects v3

หลักฐาน: [PNG](codex_gen_page/12-projects-desktop-light-v3.png) · [handoff](12_PROJECTS_DESIGN_V3.md)

**แก้แล้ว:** ชื่อ project/Open project อยู่ชั้นแรก, shortcuts เป็นชั้นรองมีคำอธิบายหน้าที่; global rail/Theme/Language ตรงชุด Settings และไม่มี counts/timestamps ปลอม

**ภาพแก้ยืนยันเพิ่ม:** guide ใช้ Upload CV, Applications ครอบ saved opportunities และ Documents บอก generated application documents แล้ว ไม่อ้าง CV builder/job notes

**ยังค้าง / P3 และรับงานเมื่อ:** สอง panel ยังคัดลอกคำช่วยเดียวกันและสูงมากเมื่อมีหลาย projects ลดความซ้ำโดยไม่แต่ง timestamps/counts; Open project ไป Overview ที่ถูก ID, guide ไม่อ้าง selected project ที่ยังไม่มี, empty state มี Create first project; shortcuts เป็น navigation ไม่สร้าง resources ใหม่ และไม่ต้องแอนิเมตทุก card

### 13 — New Project v2

หลักฐาน: [PNG](codex_gen_page/13-new-project-desktop-light-v2.png) · [handoff](13_NEW_PROJECT_DESIGN_V2.md)

**แก้แล้ว:** Create project/Cancel ย้ายติด one-field form และ 200-character hint; what-happens-next เป็นข้อมูลหลัง action ไม่แทรกกลางฟอร์ม; theme/language แยก label ชัดและ example เป็น placeholder

**ยังค้าง / P3:** heading folder เป็น decoration ขนาดใกล้ตัวอักษรและ next-step icons/เลขซ้ำสองชุด ลดน้ำหนักโดยคงคำอธิบายว่าไปเพิ่ม CV หลังสร้าง; ไม่ต้องเติม motion ให้ทุกขั้น

**รับงานเมื่อ:** valid name/single POST เดิม, ambiguous creation เก็บ draft และให้ตรวจ Projects ก่อน retry, Cancel ตาม draft policy; success ไป Profile ตาม source ไม่สร้าง CV/job/evaluation ให้อัตโนมัติ; greeting decoration ครั้งเดียวไม่มีผลต่อ submit/focus

### 14 — Public Landing v3

หลักฐาน: [PNG](codex_gen_page/14-landing-desktop-light-v3.png) · [handoff](14_LANDING_DESIGN_V3.md)

**แก้แล้ว:** ไม่มี Change ใต้ evaluated pair, fixed sources ชัด; หน้านิ่งขึ้นและ manual submission อยู่ hero/footer; ไม่ใช้ preview navigation ที่ต่างจาก product

**ภาพแก้ยืนยันเพิ่ม:** Illustrative demo · Sample workspace อยู่บน preview เอง, Awaiting your review เป็น amber แยกจาก coverage/result แล้ว; composition อ่าน hero/action ก่อนรายละเอียดและไม่อ้างเป็น live screenshot

**ยังค้าง / P2 และรับงานเมื่อ:** How it works ควรเปิดข้อมูล prerequisites/provider setup และการใช้ CV ตามจริง ซึ่งยังไม่เห็นในภาพหลัก; label อยู่กับ preview, pair read-only, AI/coverage ไม่ใช่ hiring probability; authenticated/public CTA ตาม Header เดิม; ไม่ขยาย hosting/AI readiness หรือรับประกันผลสมัคร ฟอนต์/สีจริงยึด DESIGN.md ไม่ใช่ raster gradients

### 15 — Login v2

หลักฐาน: [PNG](codex_gen_page/15-login-desktop-light-v2.png) · [handoff](15_LOGIN_DESIGN_V2.md)

**แก้แล้ว:** marketing เหลือสามประโยคสั้นแทน icon/paragraph ใหญ่; form/recovery เด่น, Show มีข้อความ, public header มี Theme/Language แบบเดียวกับ Signup

**ยังค้าง / P3:** split panel ยังแบ่งพื้นที่ให้ marketing ครึ่งหนึ่ง แม้ผู้กลับมาใช้ต้องการเพียง login; เก็บข้อความเป็นชั้นรองและใช้ compact shell เมื่อจอแคบ ไม่ต้องเพิ่ม decoration/security badge

**รับงานเมื่อ:** error/unverified/rate-limit อยู่ใกล้ form, email คงอยู่และ password ไม่ persist; safeNext/cookie/CSRF/account refresh ตาม source; Forgot/Create account หาเจอหลัง error; Show/Hide มี accessible name และ focus ที่ตรวจได้จริง ภาพ happy path นี้ไม่ใช่หลักฐานว่าสถานะเหล่านั้นผ่านแล้ว

### 16 — Sign Up v3

หลักฐาน: [PNG](codex_gen_page/16-signup-desktop-light-v3.png) · [handoff](16_SIGNUP_DESIGN_V3.md)

**แก้แล้ว:** ใช้ split geometry/header/controls ร่วมกับ Login, password rule กับ verification next step อยู่ติด form

**ภาพแก้ยืนยันเพิ่ม:** ลบ in seconds; left steps ระบุ Create account and verify email → Create a project and add CV → Find/evaluate แล้ว; form ระบุ next Check your email จึงเป็นลำดับจริงที่ผู้ใช้คาดได้

**ยังค้าง / P3 และรับงานเมื่อ:** step labels ยาวเมื่อเป็นไทย ต้อง wrap โดยไม่เบียดฟอร์มหรือทำให้เลขลำดับดูเป็น progress ที่เสร็จแล้ว; Check your email หลัง accepted request ไม่อ้าง delivered, account/project/CV เป็นคนละขั้น, fields/rules เดิมไม่มี mandatory extras และไม่มี password persistence; no time guarantee

### 17 — Forgot Password v2

หลักฐาน: [PNG](codex_gen_page/17-forgot-password-desktop-light-v2.png) · [handoff](17_FORGOT_PASSWORD_DESIGN_V2.md)

**แก้แล้ว:** แยกส่งคำขอจากการรับถึง inbox ด้วย “we'll send” แทน “you will receive”; ไม่มี icon blob แย่งฟอร์ม, label/back/CTA ใช้ alignment เดียวและ public header สม่ำเสมอ

**ยังค้าง / P3:** ยังมีเฉพาะ initial state ไม่มีหลักฐาน Check your email/error layout; คงข้อความ success เป็นกลางต่อ account existence และไม่เติม SLA/delivery time ให้ภาพดูน่าเชื่อถือ

**รับงานเมื่อ:** source `forgotPassword(email.trim())`, busy guard/rate-limit/retry, email retention และ Back login เดิม; accepted request ไม่ยืนยัน registered/delivered; provider/email failure ไม่แสดง sent ปลอม ไม่มีการเพิ่ม resend/countdown ที่ source ไม่มี

### 18 — Reset Password v2

หลักฐาน: [PNG](codex_gen_page/18-reset-password-desktop-light-v2.png) · [handoff](18_RESET_PASSWORD_DESIGN_V2.md)

**แก้แล้ว:** ฟอร์มสั้นแนวเดียวกับ recovery, label/hint/reveal ใกล้ fields; มี Back login และ Request new reset link ที่เข้าใจทางออกได้ ไม่เปิดเผย token

**ยังค้าง / P3:** recovery link ที่แสดงแม้ token valid อาจแย่งความสนใจเล็กน้อย ให้คงเป็น secondary text และใช้ข้อความเฉพาะสถานะเมื่อ missing/expired; done/mismatch ยังไม่ได้ pictured

**รับงานเมื่อ:** two-field confirmation/rules เดิม, token scrub และ request after validation; done หลัง API success แล้วไป Login ไม่ auto-login; failed retry คง local entries แต่ไม่ persist password/token ลง generic drafts; error focus/status ต้องพิสูจน์ภายหลัง

### 19 — Verify Email v2

หลักฐาน: [PNG](codex_gen_page/19-verify-email-desktop-light-v2.png) · [handoff](19_VERIFY_EMAIL_DESIGN_V2.md)

**แก้แล้ว:** ลบ promise ว่าจะเลือก/สร้าง project แน่นอน ใช้ Continue to app; sign in if prompted สอดคล้องกับ `/app` session gate; success icon/status และ action เดียวเด่นใน public shell ที่ตรงชุด

**ยังค้าง / P3:** Back to log in ซ้ำทางที่ primary อาจพาไปอยู่แล้ว แต่ยังยอมรับได้ในฐานะ secondary recovery; ต้องสาธิต verifying/failed แยก ไม่ reuse green panel ระหว่างรอ

**รับงานเมื่อ:** guarded `verifyEmail` สำเร็จจริงก่อนแสดง done, refresh session ตาม source และไม่ถือว่า verification เท่ากับ authentication; invalid/expired/missing token มี recovery เดิม ไม่มี auto-redirect countdown/resend helper ใหม่ Motion check reveal เป็นเพียงแผนหลัง true success

### 20 — Account v2

หลักฐาน: [PNG](codex_gen_page/20-account-desktop-light-v2.png) · [handoff](20_ACCOUNT_DESIGN_V2.md)

**แก้แล้ว:** reference clock 17 Oct2026 ทำให้ Active expires17 Nov2026 กับ Expired1 Oct2026 ตรงกัน; scope ระบุ named project/capabilities; Review account deletion บอก password/email confirmation ถัดไป และเลิกอ้างข้อมูลทุกชนิดถูกลบหมด

**ยังค้าง / P3:** Expired แสดงแดงแรงทั้งที่เป็นสภาพสิทธิ์ปกติ อาจใช้ muted/neutral ตาม shared semantic system; ตาราง capabilities ยาวต้อง wrap โดยยังอ่าน project/host ของแถวเดียวกันได้

**รับงานเมื่อ:** state derive จาก actual revoked/expiry clock เดียว, revoke active เท่านั้นและ error/404/reload ตาม contract; verified/unverified/resend ไม่ปลอม; deletion ยังเปิด confirmation เดิม ไม่ลบทันทีและไม่มี animation ชี้นำ ไม่ถือว่าภาพพิสูจน์ enforcement/การลบจริง

### 21 — OAuth Consent v4

หลักฐาน: [PNG](codex_gen_page/21-oauth-consent-desktop-light-v4.png) · [handoff](21_OAUTH_CONSENT_DESIGN_V4.md)

**แก้แล้ว:** one-project/limited-time scope อยู่หัวหน้า; ทั้ง7สิทธิ์ใน fieldset เดียว ไม่จัด Evaluate เป็น read-only; Tailor เป็น proposal/review ก่อน replace primary; application write scopes ไม่ precheck, explicit-opt-in text/Deny/revoke path ชัด

**ยังค้าง / P2:** หน้ายาวและ client/project อยู่ห่าง Allow; ยังไม่มี summary ของ client/project/สิทธิ์ที่เลือก/ระยะเวลาใกล้ decision และ “Application action permissions” ควรระบุชัดว่าเป็น Prepare answers กับ Move stages/add notes สองสิทธิ์ เพื่อไม่เหมารวม Search

**รับงานเมื่อ:** summary derive จาก actual selection ไม่มี API ใหม่; semantics ทั้ง7ข้อ/request defaults/server limits เดิม, write scopes ไม่ precheck, Review ไม่เท่ากับ approval; no-project/expired/busy/error และ safe redirect ยังตาม source, Deny มองเห็นเสมอและไม่เพิ่ม verified publisher badge โดยไม่มีหลักฐาน ภาพไม่พิสูจน์ enforcement

### 22 — Digest Unsubscribe v2

หลักฐาน: [PNG](codex_gen_page/22-digest-unsubscribe-desktop-light-v2.png) · [handoff](22_DIGEST_UNSUBSCRIBE_DESIGN_V2.md)

**แก้แล้ว:** ระบุ saved search linked to this email โดยไม่แต่งชื่อจาก token, ชัดว่ากระทบเพียง digest นี้; Login ลดเป็น text link และ “No login is needed” ป้องกันการเข้าใจว่าเป็นเงื่อนไขก่อนหยุด

**ยังค้าง / P3:** scope ถูกย้ำหลายประโยค อาจรวมเป็นสองบรรทัดเพื่อให้ confirmation สั้นลง; อย่าเปลี่ยนเป็น card success ก่อน API ตอบเพื่อเพิ่มความรู้สึกเสร็จเร็ว

**รับงานเมื่อ:** explicit confirm ก่อน existing token POST, busy/done/error/expired ตาม source, ไม่หยุดทุก account notifications/ลบ saved search; login เป็น optional route เดิม; re-enable ผ่านแอปไม่อ้างทำได้จากหน้านี้ ไม่มี countdown/mascot/celebration บน sensitive decision

## สิ่งที่ผู้ใช้ใหม่ได้จากรอบนี้

เส้นทางเริ่มต้นอ่านง่ายขึ้น: Overview ไม่มี CV → Add CV → เลือก CV context ใน Smart match → fixed evaluation → review เฉพาะข้อเสนอ → document revision → ส่งเองแล้วบันทึก stage Theme/Language มี label ตำแหน่งสม่ำเสมอภายใน shell แต่ละกลุ่ม; global/project/public navigation แยก scope โดยไม่เปลี่ยนสิทธิ์จริง ภาพ Account/recovery อธิบาย outcome และ confirmation ตรงขึ้น สิ่งเหล่านี้เป็นการปรับความเข้าใจจากภาพ ไม่ใช่หลักฐานว่าผู้ใช้ทำ task สำเร็จเร็วขึ้น

ก่อน implementation ต้องคงสิ่งที่ภาพไม่ครอบคลุม: populated Overview/attention, legacy read-only sessions, previous result ระหว่าง run ใหม่, Profile facts CRUD, Applications Board, approval expiry/consumed/retry, scoped redraft, document edit/restore/promotion, integration/secret subviews และ missing/invalid tokens ห้ามลดความสามารถเพราะ layout ใหม่ไม่ได้วาดทุก control และห้ามเพิ่ม endpoint/field เพื่อทำให้ตัวอย่างดูทำงานได้

การวัดภายหลังใช้ [task/measurement plan รอบแรก](CODEX_22_PAGE_DESIGN_REVIEW.md#แผนวัดกับ-prototype-และผู้ใช้จริง) โดยเพิ่มการตรวจ first-run01 และ historical09 แยกจาก state เดิม: ผู้ใช้รู้ next action, เลือก pair/revision ถูก, เข้าใจ Review ≠ Approve และ stage ≠ ส่งใบสมัคร, เลือก project/capability ถูก เป้าหมายที่เขียนไว้ยังเป็น proposed targets; ไม่ใช่ผลที่รอบภาพทำได้แล้ว และไม่ถือคะแนนสูงแทน acceptance ด้าน API/security/a11y

## Motion / pixel art — ประเมินแผนแยกจากภาพนิ่ง

อ้างอิง [shared contract](CODEX_PIXEL_MOTION_V2.md) และ handoff รายหน้า แผนมีขอบเขตที่เหมาะสม: pixel accents เฉพาะพื้นที่ onboarding/work guidance; main navigation ใช้ outline icons เดิม; ไม่มี mascot บน authentication/consent/account deletion/unsubscribe การเคลื่อนไหวหลัก 120–220ms ขึ้นกับ input หรือ API/SSE จริง ส่วน greeting ทำครั้งเดียวไม่เกิน 600ms และ running accent ไม่เกินสองรอบแล้วหยุด แผนนี้ช่วยให้ feedback มีเหตุผลมากกว่าการใส่ animation ทุกที่ แต่ greeting เป็น brand delight ที่เลือกไม่ใช้ได้ ไม่เพิ่มความพร้อมใช้งานหรือสถานะสำเร็จ

ภาพสุดท้ายเห็น pixel compass ชัดใน01และ10 โดย10ย่อให้เป็น accent แล้ว; compass ใน04เป็น outline glyph และ folder/sparkle ใน12/13/14เป็นรายละเอียดตกแต่งมากกว่างาน pixel ที่เด่น จึงไม่อ้างว่าทั้ง7ตำแหน่งที่อนุญาตมี pixel assets ครบหรือเป็น animation family ที่พิสูจน์แล้ว หน้า01ควรย่อ compass ตาม24–40px contract; ไม่ต้องเพิ่ม pixel ให้ทุกหน้าเพื่อให้ครบโควตา

**เกณฑ์รับภายหลัง:**

- Waiting approval/needs input/queued/expired/consumed ต้องคง named state และไม่ใช้ running accent; decorative pixels ต้องไม่สื่อ agent identity, connection, progress หรือความพร้อม
- Reduced motion เอา decorative movement ออกและให้ feedback แบบไม่เคลื่อน; ข้อมูล/action ครบเหมือนเดิม รูป pixel เป็น `aria-hidden`, ไม่ focus/click และไม่บังข้อความ
- Hidden tab หยุด decoration; reconnect/remount ไม่ replay success เก่าหรือประกาศซ้ำ; ไม่ให้ timer เติม progress/complete; request สำเร็จจริงเท่านั้นจึงเปลี่ยน step
- Focus และเป้ากดอยู่กับที่ การเปิด panel ไม่ดันตำแหน่งที่กำลังอ่าน; transition ไม่เปลี่ยน event order หรือข้าม permission gate
- ใช้ asset เล็ก/การเปลี่ยนสถานะที่มีอยู่ ไม่เพิ่ม continuous loop หรือ runtime หนักเพื่อจุดตกแต่ง; ตรวจความคมชัดที่ scale/light/dark และ frame/lifecycle ด้วย prototype จริงภายหลัง

**สถานะหลักฐาน:** ข้างต้นเป็นการประเมินความเหมาะสมของ specification; PNG ไม่ได้เคลื่อนไหว และไม่มีผลตรวจ reduced motion, keyboard, screen reader, performance หรือ lifecycle จากรอบภาพนี้

## ขอบเขตการรับรองและหลักฐานของ A

ครบ22selectedภาพและ22คะแนน; version/image/handoff ในตารางยึด final selection snapshot ค่าเฉลี่ยคำนวณจาก raw weighted scores ด้วย decimal half-up คะแนนไม่ได้เพิ่มตาม written overrides ที่ยังไม่ปรากฏในภาพ ข้อที่ยังไม่ pictured ถูกแยกเป็น implementation acceptance และไม่รับรองว่า source ที่อ่านทำงานถูกต้องทุกกรณี

งานนี้แก้เฉพาะรายงานนี้กับ scratch review data ไม่แก้ application source, images, handoffs, checklist หรือ Hub ไม่ได้ build/run application tests, user tests, detector หรือ Assessment B; ไม่มีการอนุมัติภาพแทน owner และไม่รับประกัน10/10จากการแต่งภาพ การประเมิน B/สังเคราะห์ของผู้ประสานงานทำแยกหลัง A นี้เสร็จ

Questions skipped: งานรีวิวและเกณฑ์เปรียบเทียบถูกระบุครบแล้ว ไม่มีข้อมูลที่ต้องถามเพิ่มเพื่อให้คะแนนชุดที่เลือก



## Parent synthesis after independent B

A completed before B evidence entered synthesis. Scores above remain A judgments; B did not alter them. [Independent B](CODEX_22_PAGE_REVIEW_EVIDENCE_V2.md) verified22selected image/hash/dimension/manifest sets,198handofflinks,22selected/60total embedded prompts,403unchanged sourcebaselinefiles and clean diffcheck. Sample04/06/09/10/14/20/21 found no additional visibleP1. Detector PNG failure/empty directory output is not raster/accessibility verification.

[Current handoff index](CODEX_ALL_PAGES_REDESIGN_V2.md) carries mandatoryP2implementationguardrails for02/04/05/06/14/21; [scoreJSON](codex_gen_page/review-scores-round2-2026-10-17.json) binds all22ratings to frozen selectedhashes. New concepts are22drafts with0newapprovals; six old approvals remain historical. No code, actual animation, browser tests or user study were added.

Questions skipped: ผู้ใช้ระบุให้สร้างครบทุกหน้าและส่งต่อเป็นเอกสารแล้ว จึงไม่มีคำถามเพิ่มเติมที่จำเป็นต่อการส่งมอบรอบนี้
