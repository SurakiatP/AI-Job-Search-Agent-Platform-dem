# Glossary — user-facing terms

One term per concept. "In code" names stay unchanged; this table governs UI copy only (Q-01, approved 2026-10-18).

| Concept | English UI | Thai UI | In code | Avoid in UI |
|---|---|---|---|---|
| Immutable CV snapshot | CV version (e.g. "Data Analyst CV · v4") | CV ฉบับที่ 4 | `cv_revision` | CV revision, rev |
| Immutable job snapshot | Job posting version | ประกาศงาน ฉบับที่ n | `job_revision` | Job rev, revision ID |
| CV + job pair of an evaluation | Compared using | ใช้เปรียบเทียบ | session `cv_revision_id` + `job_revision_id` | Fixed sources |
| AI fit result | Fit score shown as `x%` with band (old results: `x / 5`) | คะแนนความเหมาะสม `x%` | `score_percent` | hiring chance |
| Deterministic keyword coverage | Skills found (n of m, or n%) | ทักษะที่พบ | `keyword_coverage`, `ats` | ATS score, Rule-based coverage |
| Evaluation session | Evaluation, named by job title · company | การประเมิน | `session` | Evaluation014, session ID |
| External MCP/A2A client with a grant | Connected assistant | ผู้ช่วยที่เชื่อมต่อ | `grant`, agent | Agent access |
| Pending approval request | Waiting for you | รอคุณตัดสินใจ | `waiting_approval` | Approval inbox |
| Setting scope: device | This browser | เบราว์เซอร์นี้ | localStorage | This device |
| Setting scope: server-wide | Whole app (admin) | ทั้งระบบ (ผู้ดูแล) | gateway/installation | This installation |
| Setting scope: project | This project | โปรเจกต์นี้ | project settings | Selected project |
| Application stage change | Tracking only — does not contact the employer | บันทึกติดตามเท่านั้น ไม่ได้ส่งถึงนายจ้าง | `stage` | Submit, apply (as an action) |

## Journey round terms (CH-14, 2026-11-04)

Source: `docs/design/journey-flow-proposal.md` section 4. Same rules as above: the "In code" names stay; this table governs UI copy.

| Concept | English UI | Thai UI | In code | Avoid in UI |
|---|---|---|---|---|
| Facts the AI may use to write documents | My facts | ข้อเท็จจริงของฉัน | experience bank, `/experience`, `ExperienceItem` | Experience bank, คลังประสบการณ์ |
| Reading a CV into facts (AI) | Pull experience from CV | ดึงประสบการณ์จาก CV | `extract`, `experience-extractions` | Extract CV, สกัด CV, สกัดประสบการณ์ |
| Result of pulling | Pulled N facts | ดึงแล้ว N ข้อเท็จจริง | `extracted_count` | Extracted, สกัดแล้ว |
| Facts not yet pulled from a CV | Not pulled yet | ยังไม่ได้ดึง | `extracted_at = null` | Not extracted, ยังไม่สกัด |
| Session | Job page (never "session" in new copy) | หน้างาน | `session` | เซสชัน, Session |
| CV revision | version n | ฉบับที่ n | `cv_revision` | revision, เวอร์ชัน |
| Run the fit check | Evaluate | ประเมิน | `evaluate_job` | Run evaluation |
| Main CV used when you press Evaluate | Main CV | CV หลัก | `is_primary` | Default CV |
| CV used for the fit score | CV used for the score | CV ที่ใช้คิดคะแนน | `cv_revision_id` | Source CV |
| CV file kinds | PDF, Word, TXT | PDF, Word, TXT | `mime_type` | Text file (use TXT) |
