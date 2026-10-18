# Glossary — user-facing terms

One term per concept. "In code" names stay unchanged; this table governs UI copy only (Q-01, approved 2026-10-18).

| Concept | English UI | Thai UI | In code | Avoid in UI |
|---|---|---|---|---|
| Immutable CV snapshot | CV version (e.g. "Data Analyst CV · v4") | CV ฉบับที่ 4 | `cv_revision` | CV revision, rev |
| Immutable job snapshot | Job posting version | ประกาศงาน ฉบับที่ n | `job_revision` | Job rev, revision ID |
| CV + job pair of an evaluation | Compared using | ใช้เปรียบเทียบ | session `cv_revision_id` + `job_revision_id` | Fixed sources |
| AI fit result | AI fit, shown as `x / 5` with band | ความเหมาะสมโดย AI `x / 5` | `fit_score` | percent AI score, hiring chance |
| Deterministic keyword coverage | Skills found (n of m, or n%) | ทักษะที่พบ | `keyword_coverage`, `ats` | ATS score, Rule-based coverage |
| Evaluation session | Evaluation, named by job title · company | การประเมิน | `session` | Evaluation014, session ID |
| External MCP/A2A client with a grant | Connected assistant | ผู้ช่วยที่เชื่อมต่อ | `grant`, agent | Agent access |
| Pending approval request | Waiting for you | รอคุณตัดสินใจ | `waiting_approval` | Approval inbox |
| Setting scope: device | This browser | เบราว์เซอร์นี้ | localStorage | This device |
| Setting scope: server-wide | Whole app (admin) | ทั้งระบบ (ผู้ดูแล) | gateway/installation | This installation |
| Setting scope: project | This project | โปรเจกต์นี้ | project settings | Selected project |
| Application stage change | Tracking only — does not contact the employer | บันทึกติดตามเท่านั้น ไม่ได้ส่งถึงนายจ้าง | `stage` | Submit, apply (as an action) |
