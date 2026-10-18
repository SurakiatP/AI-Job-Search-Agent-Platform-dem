# 22 Page Design Review — มุมมองผู้ใช้ใหม่

วันที่: 2026-10-17  
Reviewer: `gpt-6.1-sol` · reasoning effort: **high**  
วิธี: **Assessment A — independent expert visual review**; ใช้แนวทาง Impeccable ด้าน hierarchy, cognitive load, discoverability และ emotional journey การตรวจหลักฐานเชิงเครื่องมือ Assessment B และ synthesis เป็นงานแยกของผู้ประสานงาน

> ตรวจภาพที่เลือกจริงครบ **22/22 หน้า** ด้วย `view_image` รวม 22 PNG ที่ไม่ซ้ำกัน ใช้หน้า 04 v2 และหน้า 18 v1 ที่แก้ header แล้ว ไม่รวม 04 v1 ที่ superseded; ไม่ใช้การอ่าน source หรือชื่อไฟล์แทนการดูภาพ

## ขอบเขตและการตีความคะแนน

ประเมินภาพ concept ที่เลือก **ตามสิ่งที่เห็นในภาพ** จากมุมมองคนที่ยังไม่รู้คำศัพท์หรือโครงสร้างระบบ แล้วอ่าน handoff และแหล่ง source ที่ handoff อ้างเพื่อแยกความผิดพลาดของภาพออกจากพฤติกรรมที่ควรรักษา ภาพทั้งหมดเป็นข้อมูลสมมติ desktop/light/English ไม่ใช่หน้าจอแอปที่นำ concept นี้ไปพัฒนาแล้ว

คะแนนเป็น **expert simulated walkthrough ratings** ไม่ใช่ผล usability test ไม่มีผู้ใช้จริง ไม่มี task success rate หรือเวลาทำงานที่วัดได้ในรอบนี้ และไม่ยืนยัน contrast/WCAG, keyboard/screen reader, mobile, dark mode, ภาษาไทย หรือความปลอดภัยจาก PNG เอกสารนี้ไม่อนุมานการอนุมัติ: **01–06 ได้รับอนุมัติเดิม** (04 ใช้ v2; 05 เฉพาะ List) ส่วน **07–22 เป็น draft รอ owner review**

| มิติ | น้ำหนัก | คำถามที่ใช้ให้คะแนน |
|---|---:|---|
| Beauty (B) | 25% | องค์ประกอบ ตัวอักษร จังหวะพื้นที่และรายละเอียดดูเรียบร้อยและเป็นระบบเพียงใด |
| New-user ease (E) | 35% | คนไม่รู้ระบบเข้าใจว่าหน้านี้ทำอะไร เริ่มตรงไหน และคาดผลของการกดได้เพียงใด |
| Layout / hierarchy (L) | 25% | ลำดับการอ่าน ตำแหน่ง action และความสัมพันธ์ของข้อมูลช่วยให้ตัดสินใจเพียงใด |
| Trust / status / source clarity (T) | 15% | ภาพอธิบายสถานะ ขอบเขตอำนาจ ข้อมูลต้นทางและความไม่แน่นอนได้ตรงเพียงใด |

ทุกมิติ 0–10; รวม = `0.25B + 0.35E + 0.25L + 0.15T` ปัดหนึ่งตำแหน่ง โดยคำนวณจากค่ามิติที่แสดง คะแนน 5 หมายถึงมีอุปสรรคหลัก, 7 หมายถึงใช้งานแนวคิดได้แต่ต้องเรียนรู้, 8 หมายถึงแนวคิดแข็งแรงพร้อมแก้จุดชัดเจน, 9 หมายถึงแทบไม่มีข้อสงสัยในภาพที่ตรวจ ส่วน 10 คือ quality bar ที่กำหนดไว้ ไม่ใช่คำรับประกันจากการแต่งภาพ

**เกณฑ์ลำดับงาน:** P1 = ความหมายหรือขอบเขตสิทธิ์อาจทำให้เข้าใจผิด ต้องแก้แม้คะแนนรวมสูง; P2 = อุปสรรคการเริ่มใช้งาน/นำทาง โดยคะแนนรวม **ต่ำกว่า 8.0** ต้องอยู่ในคิวปรับก่อนรอบอนุมัติถัดไป; P3 = ปรับรายละเอียดของหน้าที่คะแนนตั้งแต่ 8.0 และไม่มี semantic blocker ไม่มี P0 ที่ยืนยันจากหลักฐาน PNG เพียงอย่างเดียว

**10/10 quality bar:** ผู้ใช้บอกเป้าหมายหน้าและ action หลักได้โดยไม่ต้องรู้โครงสร้างภายใน; แยกผลเก่ากับงานปัจจุบัน แยก source revision กับ document revision และรู้ว่าต้องส่งใบสมัครเอง; หน้าร่วมใช้ shell/copy/status เดียวกัน; action สำคัญมีบริบทและทางกลับ; สถานะว่าง/รอ/ผิดพลาด/ไม่มีสิทธิ์/ข้อมูลเก่าออกแบบครบ จากนั้นต้องพิสูจน์กับ prototype และผู้ใช้จริงก่อนกล่าวว่าเข้าใกล้เกณฑ์นี้ การแก้สี ระยะห่าง หรือถ้อยคำอย่างเดียวไม่รับประกันคะแนน 10

## คะแนนรวมและลำดับปรับ

ภาพรวมสวยและเป็นระเบียบในระดับดี โดยจุดแข็งคือ list/inspector, คู่ source revision และข้อความว่าผู้ใช้ส่งใบสมัครเอง แต่ประสบการณ์คนเริ่มต้นยังติดที่ศัพท์ การเปิดงานต่อ การตั้งค่า provider และความหมายของสถานะ คะแนนเฉลี่ยแบบให้น้ำหนักแต่ละหน้าเท่ากันคือ **7.8/10** ไม่ใช่คะแนน usability ที่วัดจากผู้ใช้ หรือคะแนน production readiness

| # | Page | B | E | L | T | Overall | Priority |
|---|---|---:|---:|---:|---:|---:|---|
| 01 | Overview / Dashboard | 8.2 | 7.5 | 8.0 | 8.0 | **7.9** | P2 |
| 02 | Job Search Workspace | 8.0 | 7.0 | 7.5 | 8.0 | **7.5** | P2 |
| 03 | Evaluation Sessions index | 8.3 | 7.5 | 8.5 | 8.5 | **8.1** | P3 |
| 04 | Evaluation Session Workspace v2 | 8.4 | 7.5 | 8.0 | 7.0 | **7.8** | P1 |
| 05 | Applications — List | 8.2 | 8.0 | 8.0 | 8.5 | **8.1** | P3 |
| 06 | Job Detail | 8.1 | 7.5 | 8.0 | 8.0 | **7.9** | P2 |
| 07 | CV & Experience | 7.8 | 7.0 | 7.5 | 8.0 | **7.5** | P2 |
| 08 | Documents library | 8.0 | 7.0 | 8.0 | 7.5 | **7.6** | P2 |
| 09 | Document Detail | 8.2 | 7.5 | 8.0 | 8.0 | **7.9** | P2 |
| 10 | Agent Activity / Console | 7.8 | 7.0 | 7.5 | 6.5 | **7.3** | P1 |
| 11 | Settings | 7.9 | 7.0 | 7.5 | 7.5 | **7.4** | P2 |
| 12 | Projects | 7.7 | 7.5 | 8.0 | 8.0 | **7.8** | P2 |
| 13 | New Project | 7.5 | 8.5 | 7.5 | 8.5 | **8.0** | P3 |
| 14 | Public Landing | 8.4 | 7.5 | 8.0 | 6.5 | **7.7** | P1 |
| 15 | Login | 8.0 | 8.5 | 8.0 | 8.0 | **8.2** | P3 |
| 16 | Sign Up | 8.0 | 8.0 | 8.0 | 7.5 | **7.9** | P2 |
| 17 | Forgot Password | 8.1 | 8.7 | 8.5 | 8.2 | **8.4** | P3 |
| 18 | Reset Password | 8.1 | 8.4 | 8.5 | 8.0 | **8.3** | P3 |
| 19 | Verify Email | 8.0 | 8.2 | 8.2 | 6.5 | **7.9** | P2 |
| 20 | Account | 8.0 | 7.5 | 8.0 | 5.5 | **7.5** | P1 |
| 21 | OAuth Consent | 7.8 | 7.5 | 7.5 | 8.7 | **7.8** | P2 |
| 22 | Digest Unsubscribe | 8.0 | 8.5 | 8.5 | 8.5 | **8.4** | P3 |

เฉลี่ยรายมิติ: B **8.0**, E **7.7**, L **8.0**, T **7.7** จุดที่ต้องปรับจึงเป็นความเข้าใจและความน่าเชื่อถือมากกว่าการเติมของตกแต่ง มี **15 หน้า** ที่คะแนนรวมต่ำกว่า 8.0; หน้า 04/10/14/20 เป็น P1 จาก semantic issues ตามรายละเอียด ไม่ใช่การยืนยันช่องโหว่ที่รันพบ

### สิ่งที่ต้องแก้ก่อนใช้ภาพเป็น reference รอบถัดไป

| ลำดับ | ภาพ/บริเวณ | สิ่งที่บล็อกคุณภาพ | เกณฑ์ปลดบล็อก |
|---|---|---|---|
| 1 | 20 — Agent access / Danger zone | Active และ Expired มีวันหมดอายุเดียวกันในปี 2024; คำอ้างลบข้อมูลทั้งหมดกว้างกว่าหลักฐานที่ภาพรับรองได้ | สถานะอิงเวลาเดียวกันอย่างสอดคล้อง, active grant ยังไม่หมดอายุ, copy deletion ตรง contract และมี confirmation ตาม source |
| 2 | 14 — sample evaluation | Change ที่ CV/job pair สอนให้คิดว่าแก้ source ใต้ผลเดิมได้ | ใช้ immutable pair; เปลี่ยนผ่าน new evaluation; navigation ตรงแอปหลัก |
| 3 | 10 — extraction action | Open session บนงานที่อาจไม่มี session ทำให้คาด destination ผิด | route ตาม actual run context; sessionless extraction ไป CV/run context ที่รองรับ |
| 4 | 04 — workflow header | จุดเขียวไม่มีชื่อขณะ Awaiting approval สื่อ live/running ได้ | แสดง named state จริงหรือเอาจุดออก; รอคนอย่างชัดเจน |

หลังแก้ P1 ให้รวม shell/theme/language controls และ first-run/provider-missing flow แล้วค่อยปรับ spacing/typography รายหน้า การแก้ข้อกำหนดใน handoff อย่างเดียวไม่ถือว่าภาพได้รับการแก้หรืออนุมัติแล้ว

## ผลรายหน้า

### 01 — Overview / Dashboard

หลักฐาน: [selected image](codex_gen_page/01-overview-desktop-light-v1.png) · [handoff](01_OVERVIEW_DESIGN.md) · source: `frontend/src/features/overview/OverviewPage.tsx`

**จุดแข็งที่เห็น:** Needs your attention อยู่บนสุดและแยก Review/Continue ตามงาน; Continue your work วาง CV/job version คู่กับผล; Primary CV อยู่ใกล้ทางเริ่มค้นหา

**ปัญหาและการแก้:**

1. **P2 — first-run ยังไม่ปรากฏ:** พื้นที่กลางทั้งหมดเป็นข้อมูลที่มีอยู่แล้ว ผู้ใช้เพิ่งสร้างโปรเจกต์ยังไม่เห็นจุดเริ่มของตน ออกแบบภาพ companion no-CV ให้มี Add first CV เป็น action หลักและ Find jobs เป็นทางเลือก **รับงานเมื่อ:** ไม่มีข้อมูลตัวอย่างกลายเป็นข้อมูลจริง และผู้ใช้รู้ว่าจะทำอะไรหลังสร้างโปรเจกต์
2. **P2 — ความหมายสถานะ/คำผิด:** Saved เป็นเขียวที่แถวแรก แต่ไม่ใช่ความสำเร็จของ agent; Recent documents แถวล่างมี “Kevision 1” แก้เป็น Revision และใช้ Saved แบบ neutral ร่วมกับหน้า 05 **รับงานเมื่อ:** Saved, Completed, Ready มีบทบาทต่างกันชัดในทุกหน้า

**handoff ช่วยไว้แล้ว:** ระบุ no-CV/partial-resource states และแก้ typo/สีไว้ แต่ยังไม่ใช่สิ่งที่ภาพหลักพิสูจน์ได้

### 02 — Job Search Workspace

หลักฐาน: [selected image](codex_gen_page/02-job-search-desktop-light-v1.png) · [handoff](02_JOB_SEARCH_DESIGN.md) · source: `frontend/src/features/search/SearchPage.tsx`, `AdvancedFilters.tsx`, `SavedSearches.tsx`

**จุดแข็งที่เห็น:** list/inspector เปรียบเทียบงานได้โดยไม่เสียบริบท; CV selector อยู่ใกล้ Smart match; แยก AI estimate กับ keyword count และเตือนว่าไม่ใช่โอกาสได้งาน

**ปัญหาและการแก้:**

1. **P2 — action stack หนาแน่น:** ช่วงบนมี mode, CV, query, location, work mode, filters, presets และ Save search ก่อนถึงผลลัพธ์ ผู้ใช้ใหม่ต้องแยกการตั้งค่าถึงหลายกลุ่ม จัดลำดับ query → Search แล้วเปิดรายละเอียดตามโหมด พร้อมคำอธิบายสั้นว่า Smart match ใช้ CV และ provider **รับงานเมื่อ:** first search ทำได้โดยไม่ต้องเข้าใจ saved searches หรือ advanced filters
2. **P2 — ตัวเลขกับหลักฐานไม่ครบกัน:** inspector แสดง 6/8 skills แต่มี matched chips แค่ 3 และ missing 2; 78% อาจถูกเทียบตรงกับ 3.7/5 ในหน้า 04 เพิ่มจำนวนที่ซ่อน/แสดง evidence ครบ และอธิบายว่า Search ranking กับ session assessment เป็นคนละผล **รับงานเมื่อ:** ทุก count มี evidence ที่เปิดดูได้และไม่ทำให้คิดว่าเป็น hiring probability

**handoff ช่วยไว้แล้ว:** ระบุชัดว่าต้องไม่แต่ง rationale/API ใหม่ ต้องแสดง evidence ที่เหลือ และรักษา save/evaluate idempotency; อย่าเพิ่ม backend field เพื่อเลียนแบบภาพ

### 03 — Evaluation Sessions index

หลักฐาน: [selected image](codex_gen_page/03-evaluation-sessions-desktop-light-v1.png) · [handoff](03_EVALUATION_SESSIONS_DESIGN.md) · source: `frontend/src/features/sessions/SessionsPage.tsx`, `NewSessionDialog.tsx`

**จุดแข็งที่เห็น:** ตารางอ่าน CV/job pair และ contextual action พร้อมกัน; Previous evaluation ป้องกันการมองคะแนนเก่าเป็นผลของงานที่กำลังรออนุมัติ; legacy read-only มีชื่อบอกตรง

**ปัญหาและการแก้:**

1. **P3 — copy ด้านล่างอธิบาย implementation:** “opens the existing pairing dialog” และ “exact CV version and job posting” เน้นกลไกมากกว่าสิ่งที่ผู้ใช้ได้ เปลี่ยนเป็นคำอธิบายหนึ่งประโยคว่าผลจะผูกกับ CV และประกาศเวอร์ชันที่เลือก **รับงานเมื่อ:** ไม่ต้องรู้ว่า dialog คืออะไรเพื่อเริ่มประเมิน
2. **P3 — Completed ยังคลุมเครือ:** คอลัมน์ชื่อ Status อยู่คู่ Evaluation ทำให้คนใหม่อาจคิดว่าทั้ง session จบแล้ว ใช้ชื่อ “Current activity” หรือเพิ่ม operation ในแถวที่มีงานต่อเนื่อง **รับงานเมื่อ:** ผู้ใช้แยก evaluation ที่เสร็จแล้วกับ preparation ที่ยังรอได้ โดยไม่เพิ่ม `SessionView.status`

**handoff ช่วยไว้แล้ว:** มี derived-state rules, approval validity และ result/run ordering; ต้องรักษากฎเหล่านี้เมื่อปรับ copy

### 04 — Evaluation Session Workspace (v2)

หลักฐาน: [selected image v2](codex_gen_page/04-evaluation-workspace-desktop-light-v2.png) · [handoff](04_EVALUATION_WORKSPACE_DESIGN.md) · source: `frontend/src/features/chat/SessionPage.tsx`, `RunTimeline.tsx`, `ApprovalCard.tsx`, `TailorCard.tsx`

**จุดแข็งที่เห็น:** source pair เต็มความกว้างและ Fixed pairing อยู่ตรงกลาง; ผล evaluation กับ Tailor CV รออนุมัติแสดงพร้อมกันโดยไม่ลบผลเก่า; เตือนให้ใช้ข้อเท็จจริงรองรับ CV

**ปัญหาและการแก้:**

1. **P1 — จุดเขียวไม่มีชื่อ:** มุมขวาบน Agent workflow มีจุดเขียวทั้งที่งาน Awaiting approval ทำให้เข้าใจว่า live/ทำงานอยู่ เปลี่ยนเป็น state label ที่ตรงกับข้อมูลจริงหรือเอาออก **รับงานเมื่อ:** ขณะรอคนต้องไม่มีสัญญาณแอบอ้าง connection/progress และไม่ resume เอง
2. **P2 — ทาง review ซ้ำและ next step แข่งกัน:** Review change บน banner, Review CV changes ใน workflow, Review ในเอกสาร และ Open document preparation ใต้ผล ต่างเด่นพอจะทำให้ไม่แน่ใจลำดับ ใช้ action หลักหนึ่งตำแหน่งสำหรับ pending request แล้วให้ที่อื่นเป็น contextual link **รับงานเมื่อ:** ผู้ใช้บอกได้ว่ากำลังตรวจข้อเสนอใด และ Review ยังไม่ใช่ Approve/แทน primary CV

**handoff ช่วยไว้แล้ว:** ระบุแก้ green dot, promotion expected-current-CV guard, request expiry/consumed และ actual SSE events; motion ใน spec ยังไม่ได้พิสูจน์จากภาพนิ่ง

### 05 — Applications (List)

หลักฐาน: [selected List image](codex_gen_page/05-applications-list-desktop-light-v1.png) · [handoff](05_APPLICATIONS_DESIGN.md) · source: `frontend/src/features/jobs/JobsPage.tsx`, `frontend/src/features/applications/ApplicationBoard.tsx`

**จุดแข็งที่เห็น:** ตาราง stage/contact/activity สแกนง่าย; List/Board switch อยู่ใกล้ query; tracking-only notice ระบุว่าการเปลี่ยน stage ไม่ส่งใบสมัคร

**ปัญหาและการแก้:**

1. **P3 — การเปลี่ยน stage ค้นพบยาก:** ตารางแสดง stage เป็น badge และมี ellipsis โดยไม่บอกว่าจะแก้ตรงไหน ใส่ action “Change stage” ที่มองเห็นได้เมื่อเลือกแถวหรือในเมนูที่มีชื่อชัด **รับงานเมื่อ:** ผู้ใช้ย้าย Saved → Applied ได้และอธิบายได้ว่าเป็นการบันทึกเท่านั้น พร้อม pending/rollback เมื่อบันทึกล้มเหลว
2. **P3 — Last activity เป็นวันที่อย่างเดียว:** คนใหม่รู้ว่างานใดใหม่กว่าแต่ยังไม่รู้ทำอะไรต่อ ใช้รายละเอียด event เฉพาะเมื่อ API มีจริง; มิฉะนั้นระบุคำแนะนำเปิด opportunity เพื่อดู activity **รับงานเมื่อ:** ไม่สร้างกำหนดการสัมภาษณ์หรือ next action ที่ไม่มีข้อมูล

**handoff ช่วยไว้แล้ว:** stage semantics/rollback และ contact/history แยกใน Job Detail ครบ; Board เป็น written spec ที่ยังไม่มีภาพ ไม่ให้คะแนน Board จากภาพนี้

### 06 — Job Detail

หลักฐาน: [selected image](codex_gen_page/06-job-detail-desktop-light-v1.png) · [handoff](06_JOB_DETAIL_DESIGN.md) · source: `frontend/src/features/jobs/JobsPage.tsx` (`JobDetailPage`)

**จุดแข็งที่เห็น:** stage อยู่เหนือรายละเอียดและมี tracking-only reminder; fixed CV v4/job rev3 คู่กับผล; Write email ระบุว่าเปิดแอปอีเมล ลดการเข้าใจว่า agent ส่งให้

**ปัญหาและการแก้:**

1. **P2 — score เด่นกว่าเหตุผล/การกระทำ:** 4.2/5 เป็นข้อความใหญ่ที่สุดรองจากหัวหน้า ขณะที่ gaps และ evidence อยู่ท้ายกล่อง ปรับให้ summary และข้อจำกัดอยู่ติด score และให้ Open evaluation มองเห็นเท่าเทียม **รับงานเมื่อ:** ผู้ใช้ตัดสินใจจากหลักฐานได้ ไม่ได้อาศัย Strong alignment อย่างเดียว
2. **P2 — next step ข้ามบริบทได้:** Prepare documents เด่นบนหัว แต่เป็นหน้า Interview และ latest evaluation จึงไม่ชัดว่ากดแล้วเปิด session เดิมหรือสร้างงานใหม่ เพิ่มคำช่วย/label ตาม destination จริงและคง pending-approval state **รับงานเมื่อ:** ไม่เกิดการเริ่ม run ซ้ำเพราะคาดผลจากชื่อปุ่มผิด

**handoff ช่วยไว้แล้ว:** รักษา authoritative SessionView pair, mailto, safe report และการเปิด session จริง; contact avatar/gradient เป็น artifact ที่ไม่ต้องนำไปสร้าง

### 07 — CV & Experience

หลักฐาน: [selected image](codex_gen_page/07-cv-experience-desktop-light-v1.png) · [handoff](07_CV_EXPERIENCE_DESIGN.md) · source: `frontend/src/features/profile/ProfilePage.tsx`, `ExperienceBank.tsx`

**จุดแข็งที่เห็น:** Primary badge และคำอธิบายว่าผลเดิมไม่เปลี่ยนตาม CV ใหม่ช่วยความเข้าใจ; facts มี provenance จาก CV กับ added manually; preferences แยกจากรายการ

**ปัญหาและการแก้:**

1. **P2 — อ่าน CV ยากกว่าจัดการ CV:** แถวแรกมี Upload version / Extract experience / menu แต่ไม่มี Preview ที่มองเห็นได้ จัดให้ชื่อ CV/Preview เป็นทางอ่านหลักและอธิบายผลของ extraction ใกล้ปุ่ม **รับงานเมื่อ:** ผู้ใช้ตรวจไฟล์และเวอร์ชันก่อนเริ่ม match ได้โดยไม่เดา ellipsis
2. **P2 — Experience bank ซ้ำทั้ง tab และกล่อง:** เลือก CV library แต่มีรายการ bank และ Open experience bank อยู่ข้างล่าง ทำให้ไม่รู้ว่าต้องทำอะไรกับ facts ที่ extracted อธิบายว่าตรวจ/แก้ข้อเท็จจริงที่ tab นั้น และลด preview ให้เป็นสรุปทางเข้า **รับงานเมื่อ:** ผู้ใช้แยก CV ต้นฉบับ, revision, facts และ tailored output ได้ และไม่เพิ่มประสบการณ์ที่ไม่มีหลักฐาน

**handoff ช่วยไว้แล้ว:** extraction queued/failed/provider gates และ CRUD/evidence provenance ครบ แต่ภาพไม่แสดง first-upload หรือ extraction review states

### 08 — Documents library

หลักฐาน: [selected image](codex_gen_page/08-documents-desktop-light-v1.png) · [handoff](08_DOCUMENTS_DESIGN.md) · source: `frontend/src/features/documents/DocumentsPage.tsx`, `TrashView.tsx`

**จุดแข็งที่เห็น:** type tabs, explicit Partial และ Undo trash สร้างความมั่นใจ; แยก Document revision จาก CV version ด้วยข้อความใต้ตาราง

**ปัญหาและการแก้:**

1. **P2 — Source evaluation จำไม่ได้:** คอลัมน์ Session014/012 ไม่บอก role หรือ CV/job pair ผู้ใช้ใหม่ต้องจำรหัส เติมชื่อ role/company และ source link ที่ resolve จากข้อมูลจริง **รับงานเมื่อ:** เลือก Northstar tailored CV ที่ถูกงานได้โดยไม่จำ session number; unresolved source ต้องบอก unavailable
2. **P2 — ทางสร้างเอกสารอ้อมและ icon ผิดภาษา:** Open evaluations ด้านบนใช้ external-link glyph ทั้งที่เป็นหน้าภายใน คำว่า Documents อาจทำให้คาดว่า upload ได้ เพิ่มคำอธิบาย “Create documents from an evaluation” ผ่าน route เดิมและ icon ภายใน **รับงานเมื่อ:** no-documents state พาไปขั้นตอนจริงโดยไม่เพิ่ม workflow upload ที่ไม่มีอยู่

**handoff ช่วยไว้แล้ว:** internal icon correction, empty-filter/reset, trash confirmation และ pending approvals; sorting arrow เป็นข้อเสนอ ไม่ใช่หลักฐาน backend sort

### 09 — Document Detail

หลักฐาน: [selected image](codex_gen_page/09-document-detail-desktop-light-v1.png) · [handoff](09_DOCUMENT_DETAIL_DESIGN.md) · source: `frontend/src/features/documents/DocumentsPage.tsx` (`DocumentDetailPage` / editor)

**จุดแข็งที่เห็น:** preview มีพื้นที่อ่านจริง; Current revision และ Manual edit/Agent generated history อธิบายที่มา; source panel แยก CV/job/evaluation

**ปัญหาและการแก้:**

1. **P2 — historical revision ยังไม่ถูกสาธิต:** ภาพแสดง Current อย่างเดียว แต่ Restore อยู่ข้าง rev1 การกลับไปดูเก่าอาจทำให้ไม่แน่ใจว่า Download/Edit ใช้ revision ใด ออกแบบ historical selected companion พร้อม banner และ action labels ที่ผูก revision **รับงานเมื่อ:** เลือก rev1 แล้ว preview/download/source เปลี่ยนตรงกัน และ Restore สร้าง revision ตาม contract ไม่เขียนทับประวัติ
2. **P2 — export/edit consequences ไม่ใกล้ปุ่ม:** Download ไม่ระบุไฟล์/เวอร์ชัน และข้อความ “Editing creates a new document revision” อยู่ล่างสุด panel ขวา ย้ายผลของการ edit มาใกล้ Edit content; แสดง download format เฉพาะที่รองรับ **รับงานเมื่อ:** ผู้ใช้ทำนายผล edit/restore ได้ก่อนทำ และ promotion ไป primary CV มี confirmation/expected-current guard แยกกัน

**handoff ช่วยไว้แล้ว:** selected-revision provenance, Markdown editor, async save/restore และ promotion guard ระบุไว้ชัด ไม่ได้พิสูจน์จากภาพ Current นี้

### 10 — Agent Activity / Console

หลักฐาน: [selected image](codex_gen_page/10-agent-activity-desktop-light-v1.png) · [handoff](10_AGENT_ACTIVITY_DESIGN.md) · source: `frontend/src/features/console/ConsolePage.tsx`, `TimelineTab.tsx`, `ApprovalsTab.tsx`

**จุดแข็งที่เห็น:** amber human review อยู่เหนือ list; waiting ใช้ข้อความไม่ใช่ spinner; timeline อธิบายว่า agent หยุดที่คนและ approval เฉพาะ requested action

**ปัญหาและการแก้:**

1. **P1 — extraction ถูกเรียกว่า Open session:** แถว CV experience extraction อ้าง Data Analyst CV v4 แต่ action ยังเป็น Open session ทั้งที่อาจไม่มี evaluation session เปลี่ยนตาม actual context เป็น View extraction/Open CV **รับงานเมื่อ:** ทุกปุ่มไป destination ที่มีจริง; ไม่สร้าง session ปลอมเพื่อรองรับภาพ
2. **P2 — detail มีหลายทางเข้าแต่ขอบเขตยังไม่ชัด:** Open session ซ้ำในแถวและ panel; แถว selected กับ timeline detail ใช้ชื่อกว้าง Document preparation ขณะที่ approval เป็น CV changes ให้แสดง operation/request ที่กำลังรอและหนึ่ง action หลัก **รับงานเมื่อ:** ผู้ใช้บอกได้ว่าการ review นี้เปลี่ยนอะไรและยังไม่ใช่การอนุมัติทุกงาน; เหตุการณ์ไม่มีใน source ต้องไม่แสดงว่า Completed

**handoff ช่วยไว้แล้ว:** sessionless routing และ actual-event-only timeline ระบุชัด; ยังไม่มีภาพ retry/interrupted/expired approval หรือ reconnect

### 11 — Settings

หลักฐาน: [selected image](codex_gen_page/11-settings-desktop-light-v1.png) · [handoff](11_SETTINGS_DESIGN.md) · source: `frontend/src/features/settings/SettingsPage.tsx`, `ProjectSharing.tsx`, `WebhookSettings.tsx`

**จุดแข็งที่เห็น:** Appearance section แยกชัด; Light/Dark/System มีข้อความพร้อม selection; ระบุ browser-local preference และ Account settings สำหรับ identity/security

**ปัญหาและการแก้:**

1. **P2 — scope และศัพท์ยังยาก:** app-level Settings อยู่ใน project rail แต่ AI gateway / Tools / Sharing / Webhooks มีขอบเขตต่างกัน ใส่ global/project scope ที่ชื่อ section และคำอธิบาย AI gateway เป็นการตั้งค่า provider ที่ต้องใช้กับงาน AI **รับงานเมื่อ:** ผู้ใช้ใหม่หาทางแก้ “AI unavailable” ได้และไม่เข้าใจว่าการเปลี่ยน provider เป็นเฉพาะ browser/theme
2. **P2 — appearance ใช้พื้นที่เกินเนื้อหา:** theme previews สามรูปและ Readability copy กินหน้าจอส่วนใหญ่ แต่ไม่เพิ่มการตัดสินใจ ลดภาพ theme และรวมข้อความรอง เหลือพื้นที่บอกผลและ scope **รับงานเมื่อ:** controls สำคัญและสถานะการ apply อ่านได้ในลำดับเดียว โดยไม่มี Save ปลอมเพราะ source apply ทันที

**handoff ช่วยไว้แล้ว:** secret handling และ sharing/webhook boundaries อยู่ใน subviews ที่ไม่ได้ pictured; ห้ามใช้คะแนนหน้านี้เป็น security acceptance ของ subviews เหล่านั้น

### 12 — Projects

หลักฐาน: [selected image](codex_gen_page/12-projects-desktop-light-v1.png) · [handoff](12_PROJECTS_DESIGN.md) · source: `frontend/src/features/projects/ProjectsPage.tsx`

**จุดแข็งที่เห็น:** global rail ต่างจาก project workspace อย่างเหมาะสม; subtitle อธิบายการแยก CV/jobs/documents; New project และ Open project ชัด

**ปัญหาและการแก้:**

1. **P2 — project rows ซ้ำและ choices เท่ากัน:** ทุกแถวมีคำอธิบายเดิมและสาม shortcuts บวก Open project ผู้ใช้ใหม่ไม่รู้จะเข้าทางไหนดี ให้ Open project เป็นจุดเริ่มที่เด่นสุดและลด shortcuts เป็น secondary **รับงานเมื่อ:** เลือกโปรเจกต์ถูกโดยดูชื่อและบริบทจริง ไม่ต้องแต่ง timestamps/counts ที่ API ไม่มี
2. **P2 — onboarding ขาดการต่อเข้าการเริ่มจริง:** แถบล่างสอน Add CV → Find → Evaluate แต่เป็นข้อความไม่มีทางไปของ project ที่เลือก เปลี่ยนเป็น guidance ใน empty state/Overview ของโปรเจกต์ หรือผูก action กับ project ที่ชัดเจน **รับงานเมื่อ:** คนไม่มีโปรเจกต์เห็น Create first project หนึ่งทาง และทุก deep link รักษา project ID

**handoff ช่วยไว้แล้ว:** no-fake-counts และ isolation ถูกต้อง; ภาพ populated ไม่ได้พิสูจน์ empty state หรือ cross-project authorization

### 13 — New Project

หลักฐาน: [selected image](codex_gen_page/13-new-project-desktop-light-v1.png) · [handoff](13_NEW_PROJECT_DESIGN.md) · source: `frontend/src/features/projects/NewProjectPage.tsx`, `frontend/src/app/drafts.tsx`

**จุดแข็งที่เห็น:** มีแค่ชื่อที่ต้องกรอก; Cancel กับ All projects ช่วยออกจากงาน; อธิบายข้อมูลแยกตาม project และลำดับเริ่มใช้

**ปัญหาและการแก้:**

1. **P3 — CTA ไกลจากข้อมูลเดียว:** checklist ขนาดใหญ่แทรกระหว่างชื่อกับ Create project ทำให้ one-field task ดูเป็น wizard ย้าย next steps เป็นข้อความรองหลัง action/ด้านข้าง และบอกว่าหลังสร้างจะไปเพิ่ม CV **รับงานเมื่อ:** ไม่ทำให้เข้าใจว่าระบบจะสร้าง CV/job/evaluation ให้พร้อมกัน
2. **P3 — theme/language control อ่านผิด:** มุมซ้ายล่างเป็น sun icon คู่คำ English ดูเหมือน control เดียว แยก label/control ตาม shell กลาง **รับงานเมื่อ:** ผู้ใช้เลือกภาษาและธีมโดยคาดผลได้

**handoff ช่วยไว้แล้ว:** single POST, required/maxLength, retained draft และ ambiguous-creation recovery; ไม่ใช้ชื่อสมมติในภาพเป็น default ที่ส่งจริง

### 14 — Public Landing

หลักฐาน: [selected image](codex_gen_page/14-landing-desktop-light-v1.png) · [handoff](14_LANDING_DESIGN.md) · source: `frontend/src/features/landing/LandingPage.tsx`, `frontend/src/components/Header.tsx`

**จุดแข็งที่เห็น:** headline และ Create an account เด่น; product preview ทำให้เห็นงานที่ทำได้จริงมากกว่าคำโฆษณาอย่างเดียว; footer statement ชัดว่าผู้ใช้ส่งใบสมัครเอง

**ปัญหาและการแก้:**

1. **P1 — preview สอน mental model ผิด:** ภาพตัวอย่าง evaluated result มี Change ที่ CV/job pair และ navigation CVs/Saved jobs ต่างจากแอปหลัก ลบ Change และใช้ actual navigation/Fixed pairing; เปลี่ยน pair ผ่าน New evaluation เท่านั้น **รับงานเมื่อ:** landing ไม่ทำให้คาดว่าจะเปลี่ยน source ใต้ผลเดิม และไม่แสดง static sample ว่าเป็น approval จริง
2. **P2 — สัญญาเริ่มใช้งานยังไม่ครบ:** hero บอกประโยชน์แต่ไม่อธิบายว่าผู้ใช้ต้องมี CV และต้องตั้งค่า AI provider เมื่อใด เพิ่ม disclosure สั้นตาม source-supported setup และ privacy destination จริง; ลด eyebrow ที่ไม่ช่วยตัดสินใจ **รับงานเมื่อ:** ผู้ใช้รู้ prerequisites และบทบาท AI โดยไม่มีคำรับประกันผลสมัคร/คะแนน และ typography ตรง DESIGN.md

**handoff ช่วยไว้แล้ว:** ระบุภาพ Change/Job 3 of 12/nav/eyebrow corrections ไว้; คะแนนยังคิดจากภาพที่เห็น ไม่เพิ่มคะแนนเพราะแก้ไว้ในข้อความ

### 15 — Login

หลักฐาน: [selected image](codex_gen_page/15-login-desktop-light-v1.png) · [handoff](15_LOGIN_DESIGN.md) · source: `frontend/src/features/auth/AuthPages.tsx` (`LoginPage`, `AuthShell`), `PasswordInput.tsx`

**จุดแข็งที่เห็น:** email/password มี label; Log in เด่นและมี Forgot password/Create account; reveal control อยู่ใน field ตามความคุ้นเคย

**ปัญหาและการแก้:**

1. **P3 — marketing กินพื้นที่ของ returning task:** panel ซ้ายมีข้อความประโยชน์สามชุด แต่ไม่ช่วย login ลดน้ำหนัก/ความกว้างเพื่อให้ฟอร์มและ recovery เป็นจุดสนใจ **รับงานเมื่อ:** ใช้ shell เดียวกับ Signup/Recovery และฟอร์มไม่ถูกดันลงเมื่อข้อความยาว
2. **P3 — happy path อย่างเดียว:** ไม่มีบริเวณ error/unverified/rate limit ที่เห็นในภาพ จัด variant ที่แสดงข้อความกู้คืนใต้ field/form โดยรักษา email **รับงานเมื่อ:** กลับไปทำงานเดิมผ่าน safe next ได้, reveal มี accessible name, password ไม่ persist และไม่เปิดเผย account existence เกิน backend policy

**handoff ช่วยไว้แล้ว:** safeNext/cookie/CSRF/autocomplete/error policy ระบุครบ; ภาพไม่ยืนยันพฤติกรรมหรือความปลอดภัยเหล่านั้น

### 16 — Sign Up

หลักฐาน: [selected image](codex_gen_page/16-signup-desktop-light-v1.png) · [handoff](16_SIGNUP_DESIGN.md) · source: `frontend/src/features/auth/AuthPages.tsx` (`SignupPage`, `AuthShell`)

**จุดแข็งที่เห็น:** กรอกเพียง email/password; password rule 10–128 ปรากฏก่อน submit; มีข้อความว่าจะส่ง verification link และทางกลับ Login

**ปัญหาและการแก้:**

1. **P2 — onboarding sequence ข้ามขั้น:** ด้านซ้ายจาก Create account ไป Add CV ทันที แต่ข้อความด้านขวาบอกต้อง verify email และยังมี Create project แทรกจริง ปรับเป็น flow ที่ไม่ทำให้เข้าใจว่า account creation เปิด workspace พร้อมแล้ว และลบ “only takes a minute” ที่ยังไม่มีการวัด **รับงานเมื่อ:** ผู้ใช้รู้ว่าจะพบ Check your email และเมื่อใดจึงสร้างโปรเจกต์/เพิ่ม CV
2. **P2 — identity shell เปลี่ยนจาก Login:** หน้า 15 ใช้ card split ทั้งคู่ แต่หน้า 16 ใช้ full-height left area/right floating card และ language pill ต่างกัน ใช้ geometry/header/control ชุดเดียวกัน **รับงานเมื่อ:** สลับ Login ↔ Signup ↔ Recovery แล้วยังหาฟอร์มและ navigation จุดเดิมได้

**handoff ช่วยไว้แล้ว:** signup success เป็น Check your email ไม่ใช่ dashboard; email delivery ไม่รับประกัน และไม่มี extra fields/consents ที่ไม่รองรับ

### 17 — Forgot Password

หลักฐาน: [selected image](codex_gen_page/17-forgot-password-desktop-light-v1.png) · [handoff](17_FORGOT_PASSWORD_DESIGN.md) · source: `frontend/src/features/auth/AuthPages.tsx` (`ForgotPasswordPage`)

**จุดแข็งที่เห็น:** งานเดียว email field เดียวและ Send reset link เด่น; Back to log in อยู่ก่อน panel; ข้อความ If an account exists ช่วยไม่ยืนยันว่าที่อยู่นั้นมีบัญชี

**ปัญหาและการแก้:**

1. **P3 — ข้อความยังฟังเป็นคำรับประกัน delivery:** ท้าย panel บอก “you will receive reset instructions” แม้ยังไม่ส่ง request ปรับเป็นผลของการขอแบบเป็นกลางและคง account-enumeration policy ใน success state **รับงานเมื่อ:** success หมายถึงรับคำขอ ไม่ใช่ส่งถึง inbox แล้ว; ไม่บอกว่าบัญชีมีอยู่หรือไม่
2. **P3 — มีเฉพาะก่อนส่ง:** พื้นที่ใต้ปุ่มยังไม่แสดงความสัมพันธ์ pending/error/Check your email เตรียม companion states ในพื้นที่เดียวกัน ไม่เพิ่ม countdown/resend ที่ไม่มี contract **รับงานเมื่อ:** ส่งซ้ำไม่ได้ระหว่าง busy; rate limit/request failure มีทาง retry และ email คงอยู่; back route ยังค้นพบได้

**handoff ช่วยไว้แล้ว:** neutral success/copy, duplicate guard และไม่รับประกัน delivery; พื้นที่ว่างรอบฟอร์มเหมาะกับงานสั้น ไม่จำเป็นต้องเติม marketing หรือ dashboard data

### 18 — Reset Password

หลักฐาน: [selected corrected image](codex_gen_page/18-reset-password-desktop-light-v1.png) · [handoff](18_RESET_PASSWORD_DESIGN.md) · source: `frontend/src/features/auth/AuthPages.tsx` (`ResetPasswordPage`, `useUrlToken`)

**จุดแข็งที่เห็น:** New/Confirm password แยก label ชัด, hint 10–128 ใกล้ช่องแรก; Save new password เด่นและไม่มี token แสดง; มีทางกลับ Login

**ปัญหาและการแก้:**

1. **P3 — mismatch/expired ยังไม่มีภาพ:** สอง field ที่เติมแล้วดูพร้อม submit แต่ยังไม่แสดงว่าถ้าไม่ตรงกันจะอธิบายตรงไหน เพิ่ม field-associated mismatch และ missing/expired-link variant ที่พาไป Request new link **รับงานเมื่อ:** ไม่ล้าง password เพราะความผิดพลาดที่แก้ได้, ไม่ใช้ expired token ส่งซ้ำ และไม่มี token value ในข้อความ/UI
2. **P3 — post-save expectation ยังไม่ระบุ:** คำว่า Save ชัดด้าน mutation แต่คนใหม่อาจคาดว่าเข้าระบบทันที เพิ่มข้อความรองหรือ done view ว่าบันทึกแล้วไป Log in **รับงานเมื่อ:** ไม่ auto-login หรือแสดง saved ก่อน API สำเร็จ; public header/brand/control ใช้ร่วมกับหน้า 15–19

**handoff ช่วยไว้แล้ว:** useUrlToken scrubbing, same rules, confirmation check, no persisted drafts และ login after done; PNG ไม่พิสูจน์การ scrub URL หรือการจัดการ password

### 19 — Verify Email

หลักฐาน: [selected image](codex_gen_page/19-verify-email-desktop-light-v1.png) · [handoff](19_VERIFY_EMAIL_DESIGN.md) · source: `frontend/src/features/auth/AuthPages.tsx` (`VerifyEmailPage`)

**จุดแข็งที่เห็น:** Email verified เป็น outcome ตรง มีข้อความควบคู่ check icon; มี Continue to workspace เพียง action หลัก ไม่มี countdown หรือสัญญาว่าคะแนน/ใบสมัครพร้อมแล้ว

**ปัญหาและการแก้:**

1. **P2 — สัญญาปลายทางเฉพาะเจาะจงเกิน source:** ใต้ปุ่มบอก “You'll choose or create a project next” แต่ source ไป `/app` และ session gate ตัดสินปลายทาง อาจต้อง Login หรือไป project เดิม ลบคำสัญญานี้หรือใช้ข้อความกลาง **รับงานเมื่อ:** ข้อความตรงกับ routing จริงและไม่ถือว่าการ verify แปลว่ามี authenticated session แล้ว
2. **P2 — outcome เดียวไม่ครอบคลุมความลังเล:** ภาพ success ไม่แสดง verifying/invalid/expired ซึ่งเป็นจุดที่คนใหม่ต้องการความมั่นใจที่สุด ออกแบบสามสถานะแยกกันโดยไม่คง green success ระหว่างรอ/failed **รับงานเมื่อ:** success ปรากฏหลัง server ยืนยันเท่านั้น, request guard กัน invoke ซ้ำ, invalid token มี Login/recovery ที่ source รองรับ

**handoff ช่วยไว้แล้ว:** ยกเลิก next-project promise และรักษา working/failed states ไว้แล้ว; ภาพยังมีคำสัญญา จึงยังหัก T

### 20 — Account

หลักฐาน: [selected image](codex_gen_page/20-account-desktop-light-v1.png) · [handoff](20_ACCOUNT_DESIGN.md) · source: `frontend/src/features/account/AccountPage.tsx`

**จุดแข็งที่เห็น:** global rail และ Account active สื่อ scope; email verification แยกจาก agent grant; permissions/project/host/expiry/revoke อยู่ในแถวเดียว; Danger zone แยกจากงานประจำและปุ่มไม่แย่งสายตา

**ปัญหาและการแก้:**

1. **P1 — ตัวอย่างสิทธิ์ขัดกันเอง:** Agent access แถว Research assistant ระบุ Active และ Nov 17, 2024 ส่วน Document helper วันหมดอายุเดียวกันแต่ Expired; ณ วันที่รีวิว 2026-10-17 ทั้งสองวันอยู่ในอดีต แก้ fixture/วันที่ตาม reference clock และอิง revoked/expiry ตาม source **รับงานเมื่อ:** Active ยังไม่หมดอายุจริงใน clock เดียวกัน; Expired/Revoked ไม่แสดง Revoke ที่ใช้ไม่ได้; วันที่/สถานะต้องเปลี่ยนจากข้อมูลเดียวกัน
2. **P1 — deletion copy อ้างผลกว้าง:** “All your data, projects and agent access will be irreversibly removed” ดูเหมือนรับรองผลต่อข้อมูลทุกชนิด/สำเนา ใช้ผลลัพธ์ตรง account-deletion contract ที่ตรวจแล้ว และสาธิต confirmation ปัจจุบันที่ใช้ password/email **รับงานเมื่อ:** ไม่ขยายผลเกิน contract, กดหน้าแรกเปิด dialog ไม่ลบทันที, cancel/failure กลับสู่ข้อมูลเดิมได้

**handoff ช่วยไว้แล้ว:** ระบุ generated date mismatch และห้ามขยาย deletion consequences; คง resend เฉพาะ unverified, logout, active-only revoke และ 404-idempotent handling อย่าตีความ PNG ว่าพิสูจน์ revoke/delete สำเร็จ

### 21 — OAuth Consent

หลักฐาน: [selected image](codex_gen_page/21-oauth-consent-desktop-light-v1.png) · [handoff](21_OAUTH_CONSENT_DESIGN.md) · source: `frontend/src/features/oauth/ConsentPage.tsx`, `frontend/src/locales/settings.en.json`

**จุดแข็งที่เห็น:** แสดง client/return host, project, duration และสิทธิ์ครบ **7 ข้อ**; สอง application write scopes ไม่ถูกติ๊ก; ข้อ Prepare application answers and request approval กับ “Never marks a job applied” ไม่แอบอ้างการส่งใบสมัคร; Deny มองเห็นและมีทาง revoke ที่ Account

**ปัญหาและการแก้:**

1. **P2 — consequences ของ Tailor CV ยังสั้นเกินไป:** กลาง panel ใช้ “Adapt your CV” โดยไม่อธิบาย draft/proposal เทียบกับการแทน primary CV เพิ่มคำช่วยตาม exact capability/approval boundary ว่าคำขอนี้ทำอะไรได้ และการเปลี่ยน base CV ยังต้องผ่าน approval ตามระบบ **รับงานเมื่อ:** ผู้ใช้ไม่คิดว่า checkbox นี้อนุญาตให้แทนต้นฉบับหรือเปิดสิทธิ์โครงการอื่น และไม่ขยายสิทธิ์ที่ server ไม่ให้
2. **P2 — การตัดสินใจอยู่ไกลจากสรุปสิ่งที่เลือก:** seven rows ทำให้ footer ต้องไล่กลับขึ้นอ่าน client/project เพิ่มสรุปสั้นที่ derive จาก selection เช่น client → project → จำนวนสิทธิ์/วัน ใกล้ Allow โดยเก็บรายละเอียดครบและไม่ซ่อน write scope **รับงานเมื่อ:** เลือก project/permission/expiry แล้ว summary เปลี่ยนตรงกัน; write scopes ต้องเลือกเอง; Allow/Deny ยังอยู่ใกล้และเท่าเทียมด้านอ่านออก

**handoff ช่วยไว้แล้ว:** exact localized capability meanings, existing defaults/request lookup, expiry, no-project/expired, redirect validation; ภาพ read-only default เป็นตัวอย่าง ไม่เปลี่ยน source defaults และไม่ให้ verified publisher badge โดยไร้หลักฐาน

### 22 — Digest Unsubscribe

หลักฐาน: [selected image](codex_gen_page/22-digest-unsubscribe-desktop-light-v1.png) · [handoff](22_DIGEST_UNSUBSCRIBE_DESIGN.md) · source: `frontend/src/features/digest/UnsubscribePage.tsx`

**จุดแข็งที่เห็น:** ขึ้นต้นเป็นคำถามก่อน mutation, Stop this digest เป็น action หลัก; scope ระบุเฉพาะ saved search และบอก re-enable ได้; Login เป็นทางรองโดยไม่บอกว่าต้อง login เพื่อหยุด

**ปัญหาและการแก้:**

1. **P3 — “this saved search” ระบุจากหน้าไม่ได้:** ไม่มีชื่อ search จึงต้องจำอีเมลที่เปิดมา แต่ source ไม่มีชื่อให้แสดง ห้ามแต่งชื่อจาก token; ปรับคำช่วยให้ผูกกับ digest email ที่เปิดลิงก์นี้มา และรักษาข้อความว่ากระทบเพียงรายการนั้น **รับงานเมื่อ:** ผู้ใช้ไม่เข้าใจว่าหยุดทุก notification/account และไม่เพิ่ม personal-data lookup/API เพื่อแต่งภาพโดยพลการ
2. **P3 — scope explanation ซ้ำและทางรองใหญ่:** intro กับ helper อธิบายเรื่องเดียวกัน ขณะที่ Login มีขนาดเกือบเท่า Stop รวมคำอธิบายเป็นหนึ่งย่อหน้าและลด secondary navigation **รับงานเมื่อ:** Stop ทำได้โดยไม่เข้าสู่ระบบ; หลัง API success จึงแสดง stopped; expired/error มีทางแก้จริงและไม่แสดงสำเร็จค้าง

**handoff ช่วยไว้แล้ว:** explicit confirm, idle/busy/done/expired/error, existing token POST และ /login เท่านั้น; ยังไม่ให้คะแนนการทำงานจริงหรือความปลอดภัยของ token จากภาพ

## ความสอดคล้องข้ามหน้าและจุดสะดุดของผู้ใช้ใหม่

1. **Shell เปลี่ยนหน้าตามากกว่าบทบาทที่เปลี่ยน:** rail กว้างไม่เท่ากัน, logo มีทั้งไม่มี icon/briefcase/file/globe, กลุ่ม Utilities บางหน้ามีบางหน้าไม่มี, Account หายจากหน้า 02, theme มี moon+Light mode, sun+English, toggle, icon pair และ dropdown ไม่ใช่เพียงความต่างสวยงาม แต่ทำให้สิ่งที่เรียนจากหน้าก่อนใช้กับหน้าถัดไปไม่ได้ ควรมี canonical project shell, global shell และ public/auth shell อย่างละชุด แล้วรักษา geometry/labels/controls ภายในชุด; global/project scope เป็นความต่างที่ตั้งใจและควรเก็บไว้
2. **Revision มีหลายความหมายที่ถูกต้องแต่ต้องใช้คำคงเส้นคงวา:** CV version, Job revision และ Document revision ไม่ควรถูกย่อเป็น rev/v ปนกันโดยไร้บริบท หน้า 03/04 อธิบาย fixed pairing ดี; หน้า 14 กลับมี Change จึงขัดหลักเดียวกัน กำหนด source strip แบบเดียวและให้ historical document แสดง source ของ revision ที่เลือก
3. **สถานะกำลังพูดถึงคนละสิ่ง:** Saved/Applied เป็นการติดตามโอกาส, Completed/Running เป็น run, Ready/Partial เป็นเอกสาร, Awaiting approval เป็นการตัดสินใจ ไม่ควรใช้สีหรือคำ Completed แทนกัน ผลเก่าที่สำเร็จยังอยู่ได้ขณะ run ใหม่รอคน; approval หมดอายุ/ใช้แล้วต้องไม่ดู actionable
4. **คำเรียก approval หลากหลาย:** Awaiting approval, Waiting for approval, Pending review, Human review needed, Owner review required อาจถูกต้องตาม object แต่ภาพยังไม่สอนความสัมพันธ์ ควรแยก “Review proposed changes” เป็นการเปิดดู กับ “Approve this action” เป็น decision ชัดเจน ระบุ scope และผลของการอนุมัติในจุดตัดสินใจจริง
5. **ศัพท์ข้อมูลภายในหลุดสู่คนใหม่:** Session014, AI gateway, existing pairing dialog และ deterministic keyword comparison มีความหมายเชิงระบบ แต่ขาดคำแปลเป็นสิ่งที่จะทำ ใช้ชื่อ job/company เป็นชื่อหลัก เก็บ ID ในรายละเอียด และอธิบาย AI provider/keyword comparison แบบภาษาคน โดยไม่เปลี่ยน contracts
6. **ภาพสวยด้วยข้อมูลเต็ม แต่ first-run ขาดหลักฐาน:** 01/03/05/07/08/10/12 เป็น populated state เกือบทั้งหมด ภาพของผู้ใช้วันแรกต้องไม่มีตัวอย่าง score/ready/documents แอบกลายเป็นข้อมูลจริง จัด companion empty/provider-missing/loading/failure/expired states ก่อนสรุปว่าประสบการณ์เริ่มใช้งานพร้อม
7. **ภาพตัวอย่างขาด continuity:** Northstar Health/Analytics/ชื่อย่อ, CV v3/v4, Job v1/v3, ปี 2024/2026 และ session IDs เปลี่ยนระหว่าง concept ไม่ใช่หลักฐาน bug แต่ขัดการ walkthrough ต่อเนื่อง ใช้ synthetic fixture เดียวสำหรับ journey หลัก พร้อมแยกตัวอย่าง alternate states ไม่ให้กลายเป็นข้อกำหนด hardcode
8. **การตกแต่งยังไม่ตรง shared rules ทั้งหมด:** มี apparent gradients บน rail/buttons, avatar ในหน้า 06, typography/heading scale และ rounded badge หลากหลาย; หน้าส่วนใหญ่ Beauty ดีแต่ยังไม่เป็นระบบเดียวกันเต็มที่ ใช้ DESIGN.md tokens/flat surfaces/icon family เป็น authority โดยรักษา hierarchy ของภาพที่อนุมัติแล้ว การรับรองสี/ฟอนต์จริงต้องตรวจ DOM/render ที่ implementation ภายหลัง

## จำลองการเดินทางของคนที่เพิ่งเข้าใช้

นี่คือการเดินเรื่องโดยผู้รีวิว ไม่ใช่การสังเกตผู้ใช้จริง ทุกความรู้สึก/ความเสี่ยงด้านล่างเป็นข้อคาดการณ์ที่ต้องตรวจใน prototype

| ช่วง | ผู้ใช้พยายามทำอะไร | สิ่งที่ภาพช่วย | จุดที่ยังต้องแก้/พิสูจน์ |
|---|---|---|---|
| 14 → 16 | เข้าใจเครื่องมือและสมัคร | headline, sample workspace, สัญญาว่าผู้ใช้ควบคุมการสมัครเอง | ให้ preview ตรง fixed-pair semantics; รู้ก่อนสมัครว่ามี verification และการตั้งค่า AI ตามจริง |
| 16 → 19 → 15/12 | ตรวจอีเมลแล้วเข้า workspace | signup บอกจะมี verification link | ทดสอบ pending/done/failed/expired แยกกัน; ห้ามข้ามไปอ้างว่า verified หรือ authenticated โดยไม่มี API ยืนยัน |
| 12 → 13 → 07 | สร้างบ้านให้การค้นหาและใส่ CV | project isolation และ one-field form ชัด | สร้างแล้วไป Profile ตาม source; first-upload และ provider-missing ต้องพาไปทำต่อได้; อย่าขอให้ตั้งค่า integration ทุกอย่างก่อนใช้ส่วนที่ไม่ต้องใช้ AI |
| 07 → 02 | ตรวจ CV แล้วค้นหางาน | Primary default และ CV selector | ต้องเปิด preview/source revision ได้ง่าย; รู้ว่า Smart match ส่งเนื้อหา CV ที่จำเป็นให้ configured provider และแยกจาก keyword search |
| 02 → 03/04 | บันทึกงานและเริ่มประเมิน | Save & evaluate และ fixed pairing | ผล search percentage ไม่เท่ากับ session 0–5; รอ/ล้มเหลวแล้วไม่สร้าง job/session ซ้ำ; result ต้องมี authoritative pair |
| 04 ↔ 10 | เตรียมเอกสารและตรวจข้อเสนอ | amber review และ timeline หยุดที่คน | คนต้องรู้ว่า Review เปิดดู, Approve ตัดสินใจเฉพาะ action; ห้าม spinner/green dot ทำให้คิดว่างานเดินต่อเอง; แยกผลเก่ากับ run ปัจจุบัน |
| 04 → 08 → 09 | อ่าน แก้ และดาวน์โหลดเอกสาร | source/history และ current revision | เลือกเอกสารถูก job โดยไม่จำ ID; ดู historical revision แล้ว source/download ต้องตรงกัน; promotion ไม่เงียบแทน primary CV |
| 09 → 06 → 05 | ส่งใบสมัครเองแล้วติดตาม | tracking-only copy, Write email เปิด email app, stages | ไม่มีการส่งใบสมัครอัตโนมัติหรือเปลี่ยน Applied เพราะเตรียมคำตอบเสร็จ; การบันทึก stage ต้องมี feedback/rollback |
| 01 | กลับมาวันถัดไป | Needs attention และ Continue work | task priority ต้องอิง pending request จริง ไม่ double count; source ล้มเหลวไม่กลบรายการที่ใช้ได้ |
| 15 → 17 → 18 → 15 | ลืมรหัสและกลับเข้ามา | recovery เป็นทางแยกจาก Login | privacy-preserving response, token expired/missing, password mismatch, done แล้วให้ login ตาม source ไม่สัญญา auto-login |
| 20/11/21 | จัดการบัญชี/ตั้งค่า/ให้สิทธิ์ client | แยก destination ออกจาก workflow สมัครงาน | พิสูจน์ scope, client/redirect identity, write scopes opt-in, one-time secret handling และ revocation ใน UI จริง |
| 22 | หยุด digest จากอีเมล | ควรมี confirmation สั้นเฉพาะ saved search | เปิดลิงก์ต้องยังไม่ unsubscribe; success หลัง API สำเร็จเท่านั้น; ไม่กระทบทุก email/account |

**อารมณ์ที่ควรดูแล:** จุดเปิดตัวให้ความรู้สึกเป็นระเบียบแล้ว แต่ valley อยู่ที่ verify/provider setup และช่วงรอ approval หากไม่มีเส้นทางต่อที่ชัดจะเปลี่ยนจากความมั่นใจเป็นความไม่แน่ใจ ความสำเร็จสุดท้ายควรเป็น “เอกสารที่ตรวจแล้วพร้อมให้คุณส่ง” และ “บันทึกสถานะสำเร็จ” ที่มีข้อมูลยืนยัน ไม่ใช่การเฉลิมฉลองว่า AI ได้สมัครหรือมีโอกาสได้รับงาน

## แผนวัดกับ prototype และผู้ใช้จริง

ค่าต่อไปนี้เป็น **proposed targets ที่ยังไม่ได้วัด** ต้องปรับหลัง pilot ไม่มีการนำผลทดสอบ implementation เก่ามาใช้รับรอง concept เหล่านี้

**ขั้นแรก:** ทำ clickable prototype ของ journey หลักโดยใช้ synthetic CV/job/document fixture เดียว พร้อม first-run, pending, unavailable-provider, ambiguous-write, expired approval/token และ historical revision ที่มีผลจริงตาม spec ตรวจโดย expert ก่อนเชิญผู้ใช้เพื่อไม่ให้การทดสอบวัดเพียงลิงก์ขาด

**รอบ formative:** ผู้ใช้ใหม่ 6–8 คนที่ยังไม่รู้ระบบ ครอบคลุมผู้หางานครั้งแรกและคนเคยเปลี่ยนงาน; แบ่ง Thai/English ตามผู้ใช้เป้าหมายจริง อย่าใช้ N เล็กนี้อ้างเปอร์เซ็นต์แทนประชากร ให้ผู้เข้าร่วมคิดออกเสียงและบันทึกจุดลังเล/ผิดความหมาย/ต้องขอความช่วยเหลือ คะแนนความง่ายหลัง task ใช้ SEQ 1–7 ส่วน trust ใช้คำถามให้เล่าความเข้าใจ ไม่ใช่ถามนำว่าปลอดภัยไหม

| Task ที่ให้ทำโดยไม่บอกชื่อเมนู | สิ่งที่เก็บจริง | เป้าหมายที่เสนอสำหรับรอบแก้ถัดไป |
|---|---|---|
| สมัครและตรวจลิงก์หมดอายุ/ใช้แล้ว | ทางที่เลือก ความเข้าใจสถานะและ recovery | ไม่มีใครเข้าใจว่า pending/error คือยืนยันสำเร็จ; recovery สำเร็จโดยไม่บอกทางหลัง pilot |
| สร้าง project อัปโหลด CV และหาต้นฉบับที่ใช้ | unassisted completion, wrong-project choice, revision comprehension | อย่างน้อย 7/8 ทำได้หากรอบนั้นมี 8 คน; ไม่มี wrong-project mutation; SEQ median ≥6/7 |
| ค้นหา เลือกงานและเริ่ม evaluation จาก revision ที่ระบุ | first click, evidence lookup, duplicate attempt, interpretation | ไม่มีใครเรียก score ว่าโอกาสได้งาน; ทุกคนบอก CV/job pair ถูกก่อนเริ่ม |
| รับมือ provider missing/failed run แล้วทำต่อ | recovery completion, draft loss, misleading retry | ไม่สูญ draft; ไม่เกิด duplicate write; อย่างน้อย 7/8 หาทางแก้ได้ในรอบ N=8 |
| เปิดข้อเสนอ CV แล้วเลือก decline/approve ที่กำหนด | ความเข้าใจ Review vs Approve, scope, ผลต่อ primary CV | ทุกคนแยกสอง action ได้; ไม่มี broad approval โดยไม่ตั้งใจ; expired request ตัดสินใจไม่ได้ |
| หาเอกสารของงานหนึ่ง ดู rev เก่าแล้วดาวน์โหลด | wrong document/revision, source lookup, outcome comprehension | ไม่มี wrong-revision download ใน task; ทุกคนบอกได้ว่า document revision ต่างจาก CV version |
| ส่งเองนอกแอปแล้วบันทึก Applied และจำลอง save failure | tracking mental model, rollback/retry, duplicate action | ไม่มีใครเข้าใจว่าการย้าย stage ส่งใบสมัคร; failure ไม่แสดงสำเร็จหรือทิ้งบันทึกอื่น |
| ให้สิทธิ์ client เฉพาะ project และสิทธิ์ที่โจทย์กำหนด | client/redirect recognition, scope mistakes, write opt-in | ไม่มี unintended write scope/cross-project grant; ผู้ใช้บอกทาง revoke ได้จากข้อมูลที่มีจริง |
| หยุด digest เฉพาะ saved search | confirmation understanding, wrong-scope assumption | ไม่มีใครเข้าใจว่าหยุดทั้งบัญชี; ไม่ mutate ก่อนกดยืนยัน |

เวลา task ควรเก็บเพื่อหาช่วงลังเล แต่ตั้งเกณฑ์เวลาจาก pilot ก่อน ห้ามเขียนว่า “ลดเวลา X%” หากยังไม่มี baseline เทียบกัน หลังแก้ความเข้าใจหลักแล้วจึงทำ summative study ที่คำนวณ sample size/ความไม่แน่นอน และรายงานจำนวนสำเร็จจริงพร้อม N

**ตรวจ implementation แยกจาก user study:** keyboard/focus order, screen-reader announcements, contrast จากสีจริง, zoom/reflow, touch targets และ long text; Thai/English, light/dark, mobile/tablet/desktop; no-access/partial resource, API error/retry/idempotency, SSE reconnect/current-vs-historical result, expiry/consumed approvals, CSRF/safe redirects/secret lifecycle และ cross-project isolation ต้องมีหลักฐานเฉพาะ ไม่อนุมานจากภาพ คะแนนดีไม่ได้ใช้แทน acceptance ด้านเหล่านี้

## Review boundary

รายงานนี้เสนอการแก้ concept และ acceptance criteria ไม่ใช่อนุมัติให้นำทุกข้อไปขยาย backend/API ห้ามสร้าง fields/endpoints/progress/events เพื่อให้ภาพดูครบ; รักษา source contracts, exact revisions, owner-only actions, one-time secrets, pending-approval และ manual submission ตาม handoff การนำภาพที่อนุมัติ 01–06 ไปแก้ยังต้องให้ owner เห็นความต่าง ส่วน 07–22 ยังเป็น draft จนกว่าจะมีคำอนุมัติโดยตรง

ตรวจความครบถ้วนของเอกสารรอบ A: มี 22 page sections, 22 score rows และ 22 unique selected PNG links ซึ่งพบไฟล์ครบ; ตรวจสูตรคะแนนด้วย decimal rounding ครบ 22 แถว ไม่มีสูตรผิด ค่าเฉลี่ยก่อนปัด **7.845** ปัดหนึ่งตำแหน่งเป็น **7.8** ตรวจเฉพาะความครบถ้วนของ report ไม่ได้ build แอป รัน application tests ทำ browser interaction หรือ user tests และไม่ใช่ Assessment B artifact/detector review

Questions skipped: ผู้ใช้ขอรีวิวครบ 22 หน้าไว้แล้ว ประเด็นที่ต้องตัดสินใจถูกเขียนเป็นข้อเสนอและเกณฑ์รับงาน ไม่มีการอนุมาน approval เพิ่ม



## Synthesis หลัง Assessment B อิสระ

ผู้ประสานงานได้รับ A ที่เสร็จแล้วก่อนนำผล B มาสังเคราะห์ คะแนนข้างต้นเป็นของ A และไม่ได้ปรับจาก detector หรือให้คะแนนเพิ่มเพราะมีคำแก้ใน handoff

[รายงาน B](CODEX_22_PAGE_REVIEW_EVIDENCE.md) ยืนยัน selected image/handoff/manifest/hash22/22, handoff links99/99, selected prompt22/22และทุก PNG23/23, source baseline403ไฟล์ไม่เปลี่ยน และ `git diff --check` ผ่าน B ไม่อ่าน A และตรวจภาพกลุ่มเสี่ยง7หน้าโดยอิสระ พบประเด็นสอดคล้องกันเรื่อง extraction/session, mutable pairing ใน preview, next-project promise และ expiry/deletion copy

Detector ลองกับ PNG จริงแล้วไม่สำเร็จ (exit1/ENOENT แม้ตรวจว่าไฟล์มีอยู่และ hashตรง) และ directory scanให้ `[]` ไม่ใช่หลักฐานว่าภาพผ่าน UI detector ดังนั้นผลชุดนี้คือ expert static-concept review พร้อม artifact evidence; ไม่ใช่ full runtime/browser/accessibility audit ไม่มีการวัดผู้ใช้จริงหรืออ้าง build/regression ใหม่

สูตรคะแนนทั้ง22แถวตรวจซ้ำแล้ว ค่าเฉลี่ยไม่ปัด7.845→7.8/10 ดู [คะแนนพร้อม image hash](codex_gen_page/review-scores-2026-10-17.json) และ [snapshot](codex_gen_page/review-snapshot-2026-10-17.json)

ลำดับทำต่อ: แก้ P1บน04/10/14/20 → รวม shared shell/state/source labels → แก้ความยากของSearch/CV/Settings → ทำprototypeและทดสอบตามtargetsข้างต้น การออกแบบภาพครบ22หน้าไม่ได้อนุมัติ07–22หรือทำให้productionพร้อมโดยอัตโนมัติ

Questions skipped: ผู้ใช้ระบุให้ทำครบและให้คะแนนพร้อมคำแนะนำแล้ว จึงไม่มีคำถามเพิ่มเติมที่จำเป็นต่อรายงานรอบนี้
