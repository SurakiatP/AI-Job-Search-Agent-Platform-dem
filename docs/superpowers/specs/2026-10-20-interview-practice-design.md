# Interview practice — CR-IVP-01

Status: design approved by the owner 2026-10-20 (all recommendations accepted; company information comes from the job posting only). Written spec approved by the owner 2026-10-20.

## The why

The owner (a job seeker in Thailand) has an evaluation session for one CV and one job, and an interview coming. Today the session shows one list of preparation tips and nothing to practise with. They need to rehearse the questions this particular job is likely to ask, answer them with their own real experience, learn the technical topics the job needs, and know what to work on before the day.

Research basis: structured, job-related questions predict job performance best (Sackett et al. 2022: structured interviews r = .42, unstructured .19). Behavioural ("tell me about a time") and situational ("what would you do if") are the two proven formats (U.S. OPM). The sections below follow that.

## Scope

- **PR 1:** practice sets (create, rename, delete with undo), question generation for 8 sections, written answering, technical flashcards with self-rating, the session tab, moving the preparation list into it.
- **PR 2:** AI scoring of written answers, the end-of-set report (strengths, skills to add, preparation plan), optional AI check of a typed flashcard answer, the sidebar overview page.
- **Out of scope:** voice answers, fetching company websites (the AI sandbox stays offline), live chat-style interviewer, links to courses.

## Functional requirements

### Practice sets
- **FR-IVP-01** An owner can create a practice set in a session that has a CV/job pair. They choose a name (default "ชุดซ้อม n"), the sections, the number of questions per section (1–6, total ≤ 30) and a level (`entry`, `mid`, `senior`).
- **FR-IVP-02** A session can hold up to 20 sets. Sets can be renamed (1–120 characters) and deleted. Delete hides the set at once and shows an undo notice. A deleted set is removed for good when its session is permanently deleted.
- **FR-IVP-03** Creating a set starts one AI run (`interview_generate`) that writes the questions. The set shows "กำลังสร้างคำถาม" until the run ends; a failed run leaves the set with a retry button.

### Sections and sources
- **FR-IVP-04** The sections are:

| id | Thai name | Built from | Answer form | Scored (PR 2) |
|---|---|---|---|---|
| `intro` | แนะนำตัวและแรงจูงใจ | CV, job, company text in the posting | written | yes |
| `behavioral` | ประสบการณ์ที่ผ่านมา (STAR) | job requirements, experience bank | written | yes |
| `situational` | สถานการณ์สมมติ | duties in the posting | written | yes |
| `technical` | ความรู้เชิงเทคนิค | skills in the posting and the CV | flashcard | self-rated |
| `cv_deep_dive` | เจาะลึก CV | CV, experience bank | written | yes |
| `gaps` | จุดที่ยังขาด | `missing`/`partial` requirements of the latest evaluation report | written | yes |
| `company` | บริษัทและวัฒนธรรม | company name and text in the posting | written | yes |
| `logistics` | เงื่อนไขการจ้าง | posting, personal details the owner filled | guidance only | no |

- **FR-IVP-05** Company information comes only from the job posting (`job_revisions.company` and `description`). If the posting says little about the company, the `company` section says so and asks general questions instead of inventing facts.
- **FR-IVP-06** Each question carries `why` (one line: which requirement or CV line it comes from). Each set also gets up to 5 "คำถามที่ควรถามกลับ" built from the posting.
- **FR-IVP-07** Each written question may carry a model answer and each flashcard a back side. Any sentence that states the owner's experience must cite experience-bank facts and pass the existing evidence gate (`require_evidence`). An answer that fails is dropped and replaced by "ยังไม่มีข้อเท็จจริงในคลังพอสำหรับคำตอบตัวอย่าง"; the run does not fail.
- **FR-IVP-08** Personal details (birth date, salary, LINE id, …) are never sent to AI, as today. `logistics` guidance uses only the posting.

### Practising
- **FR-IVP-09** Written questions: the owner types an answer (≤ 4,000 characters) and saves it as an attempt. Up to 20 attempts per question are kept, newest first. The owner can mark a question "พร้อมแล้ว".
- **FR-IVP-10** Flashcards: front = question, back = key points and the model answer. Flip by click, tap or Space; arrows move; "จำได้แล้ว" / "ยังไม่แม่น" (also keys 1 and 2, swipe right / left on touch). Shuffle. At the end of a round: counts per pile and "ทบทวน n ใบที่ยังไม่แม่น". Ratings are saved per card. With reduced motion the flip becomes a cross-fade.
- **FR-IVP-11** The set page shows progress per section: written questions marked ready, cards rated "จำได้แล้ว".

### Scoring and report (PR 2)
- **FR-IVP-12** "ขอความเห็น" on an attempt starts one `interview_grade` run. It returns a 1–5 score on five dimensions, each with its anchor text: `structure` (STAR complete), `relevance` (answers this job), `evidence` (specific, with numbers), `clarity` (concise), `company_fit` (fits the posting). It also returns STAR parts found in the answer (sentence spans labelled S/T/A/R), what to add, and experience-bank facts the owner did not use. `logistics` is never scored.
- **FR-IVP-13** A second attempt shows its scores next to the previous attempt's ("ผลลัพธ์ 2 → 4").
- **FR-IVP-14** "สรุปชุดซ้อม" starts one `interview_report` run: strengths, skills to build (from `gaps`, low scores and "ยังไม่แม่น" cards), a preparation plan as topics (no links), and readiness per section in words. No overall pass mark and no hiring probability.
- **FR-IVP-15** Optional for a flashcard: type an answer before flipping and ask AI to check it (`interview_grade` with a correctness verdict instead of the five dimensions).
- **FR-IVP-16** Practice runs (`interview_generate`, `interview_grade`, `interview_report`) count against a separate daily quota `USER_DAILY_PRACTICE_QUOTA` (default 60) and not against `USER_DAILY_RUN_QUOTA`. Self-rating flashcards uses no quota.

### Where it lives
- **FR-IVP-17** The session gets a tab "ซ้อมสัมภาษณ์" between "คำตอบสมัครงาน" and "ประวัติ". It lists the sets and holds the preparation list from the evaluation report, renamed "สิ่งที่ควรเตรียมก่อนสัมภาษณ์", with "สร้างชุดซ้อม". The list leaves "คำตอบสมัครงาน", which keeps only the application-form card.
- **FR-IVP-18** A set opens at `/app/projects/:projectId/sessions/:sessionId/practice/:setId`.
- **FR-IVP-19** (PR 2) A sidebar item "ซ้อมสัมภาษณ์" lists every set in the project grouped by job, newest first. New sets are created only from a session.
- **FR-IVP-20** Every AI-written question, answer, score and report carries the AI label.
- **FR-IVP-21** Owner only. Agents with grants (MCP/A2A) cannot read or create practice sets.

## Acceptance criteria

- [ ] **AC-IVP-01** `P0` · FR-IVP-01, 03 — Given a paired session, when the owner creates a set with `behavioral` ×3 and `technical` ×4, then one `interview_generate` run is queued, and on success the set has 3 written questions and 4 flashcards, each with a `why`.
- [ ] **AC-IVP-02** `P0` · FR-IVP-07 — Given the AI returns a model answer whose number is not in the cited facts, when the run completes, then that answer is replaced by the "no facts" text and the run still completes.
- [ ] **AC-IVP-03** `P0` · FR-IVP-08 — The prompt of every practice run contains no personal-detail field values.
- [ ] **AC-IVP-04** `P0` · FR-IVP-21 — Another user and a grant token get 404 on every practice route.
- [ ] **AC-IVP-05** `P1` · FR-IVP-02 — Rename to "รอบสอง" persists; delete hides the set and undo brings it back; a 21st set is refused with `practice_set_limit`.
- [ ] **AC-IVP-06** `P1` · FR-IVP-10 — In the browser, Space flips the card, 2 marks "ยังไม่แม่น", the end screen shows "ทบทวน 1 ใบที่ยังไม่แม่น", and ratings survive a reload.
- [ ] **AC-IVP-07** `P1` · FR-IVP-09 — Saving two attempts lists both, newest first; "พร้อมแล้ว" updates section progress.
- [ ] **AC-IVP-08** `P1` · FR-IVP-17 — The "ซ้อมสัมภาษณ์" tab shows the preparation list; "คำตอบสมัครงาน" no longer does.
- [ ] **AC-IVP-09** `P0` · FR-IVP-12 (PR 2) — Given a graded attempt, the response holds five scores 1–5, STAR spans that lie inside the answer text, and no `logistics` question can be graded.
- [ ] **AC-IVP-10** `P0` · FR-IVP-16 (PR 2) — With `USER_DAILY_RUN_QUOTA` used up, practice runs still start; with the practice quota used up they are refused with `quota_exceeded` and evaluation runs still start.
- [ ] **AC-IVP-11** `P1` · FR-IVP-14 (PR 2) — The report has strengths, skills to build, plan topics and per-section readiness, and contains no URL and no percentage.

## Data model (migration 0036)

```
interview_sets        id, project_id, session_id, name(≤120), level, sections JSON [{id, count}],
                      status (generating|ready|failed), run_id, reverse_questions JSON, report JSON (PR 2),
                      created_at, deleted_at
interview_questions   id, set_id, project_id, section, position, prompt(≤600), why(≤300),
                      key_points JSON, model_answer(≤3000, nullable), evidence_ids JSON,
                      ready bool, card_rating (know|learning|null)
interview_attempts    id, question_id, project_id, answer(≤4000), feedback JSON (PR 2), created_at
```

Cascades follow the session: purging a session deletes its sets. Runs keep `input_snapshot.set_id` / `attempt_id`.

## Impact

| Layer | Change |
|---|---|
| DB | Migration 0036: three tables; `runs.operation` allows the three new operations. |
| Runs / executor | Three operations with JSON-only prompts like `evaluate_job`; evidence gate on answers; separate quota count. |
| REST, OpenAPI | `GET/POST /sessions/{id}/practice-sets`, `PATCH/DELETE /practice-sets/{id}`, `POST …/restore`, `GET …/{id}` (questions), `POST /practice-questions/{id}/attempts`, `PATCH /practice-questions/{id}` (ready, rating); PR 2: grade and report endpoints. |
| MCP / A2A | None (owner only, checked by AC-IVP-04). |
| Frontend | Session tab, set page (written answer + flashcards), create/rename/delete dialogs; PR 2 feedback view, report, sidebar page. Built with /impeccable. |
| Session purge | Also deletes practice sets (FR-IVP-02). |
| Records created before | None; the preparation list keeps its data and only moves tab. |

## Assumptions and questions

- **A-IVP-01** Limits (6 per section, 30 per set, 20 sets, 20 attempts, quota 60) are estimates; the owner may change them.
- **A-IVP-02** The configured model returns this JSON reliably, as for the evaluation report; an invalid reply fails the run with retry.
- **Q-IVP-01** Answered 2026-10-20 (owner): deleted sets do not go to the project trash; the undo notice is enough.
