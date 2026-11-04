# UX foundation (retro-fit): personas, journeys, user flows

Status: draft for owner review, 2026-11-04. Written after the app was built, to find where the design
does not match how people use it. Code read on `develop` at `6373b9d`.

Evidence rules: every finding cites its source. **[E]** = evidence (customer trial, owner test, code, test),
**[H]** = hypothesis that real users must confirm (listed as Q-xx at the end). No interviews or analytics
exist yet, so the personas are hypotheses built on the trial evidence below, not research findings.

## 0. Evidence used

| ID | Source | What it shows |
|---|---|---|
| UXR-01 | Customer trial on prod, 2026-11-03 (customer message relayed by owner) | "อ่าน PDF ไม่ได้" — the first CV upload failed for the trial user (a real Thai CV). Root cause: extraction output cut off (fixed locally, not yet on prod). |
| UXR-02 | Same trial | "web ui ยังใช้งงๆ หรือไม่เข้าใจ", "ปุ่มมันดูเยอะไปหมด ใช้งานดูยาก", asks for fewer clicks and more interactivity. |
| UXR-03 | Owner walkthrough, 2026-11-04 (this session) | Could not tell three uploads of the same CV apart in the CV picker (same name, no file kind). |
| UXR-04 | Owner walkthrough, 2026-11-04 | Did not understand how Find jobs matches a CV, nor why to pick a CV when an experience bank exists (two separate mental models for "my experience"). |
| UXR-05 | Owner walkthrough, 2026-11-04 | Wanted extraction only on an explicit button press; users may not always want their CV turned into facts. |
| UXR-06 | Owner walkthrough, 2026-11-04 | Wanted the preview to show the real file, not extracted text (trust: "is this what the system read?"). |
| UXR-07 | `docs/ux-redesign/UX_SIMPLIFY_PLAN.md` §1.2 (audit 2026-11-03) | Click counts before the simplify pass: first CV 7 clicks / 4 screens; find job → fit score 5 / 3; saved job → score 5 / 4; draft letter 4–5 / 3; record applied 3 / 1. |
| UXR-08 | `tests/e2e/ux-budget.spec.ts` (passes on `develop`) | Visible controls above the fold at 1440: Today ≤6, Find jobs ≤10, My jobs ≤11 + ≤2 per row, Job detail ≤8, Session ≤8, CV empty 3, Documents ≤7, sidebar ≤10. |

Limits: one trial user (UXR-01, 02), one owner (UXR-03 to 06). Nothing yet measures task success or time.

## 1. Personas (hypotheses)

Both are **[H]** built from UXR-01 to 06 and the product scope in `PRODUCT.md`. Validate with Q-01.

### P1 — "แพร" new graduate, first job (primary)
- **Situation:** final-year or new graduate, one Thai CV (often a Canva PDF or Word file), applies to many entry roles in a short window. [H]
- **Goal:** know which postings are worth applying to and get a decent cover letter fast. [H]
- **Tech comfort:** high on phone, medium on desktop tools; expects things to "just read" the file. [H, consistent with UXR-01]
- **Fears:** looking unqualified; AI writing something untrue about her. [H, consistent with UXR-06]
- **Breaks when:** the upload fails silently, too many buttons, words like "session", "revision", "extract". [E: UXR-01, UXR-02]
- **Success moment:** sees a first fit score with reasons within minutes of signing up.

### P2 — "ต้น" experienced, changing direction (secondary)
- **Situation:** 5–10 years' experience, several CV versions (e.g. data vs management), applies selectively, often across languages (Thai CV, English posting). [H, consistent with UXR-03, UXR-04]
- **Goal:** compare a few serious roles, tailor the CV per role honestly, track where each application stands. [H]
- **Tech comfort:** desktop, wants control and to see why a score is what it is. [H, consistent with UXR-04]
- **Fears:** the tool overclaiming; mixing up which CV was used for which job. [E: UXR-03]
- **Breaks when:** CV versions look identical, matching logic is opaque, data duplicated between "CV" and "experience bank". [E: UXR-03, UXR-04]
- **Success moment:** a tailored CV and letter that only use his real facts, and a clear record of what he sent where.

## 2. Journey maps

Stages follow the product's own journey (`PRODUCT.md`). "Now" is the app on `develop` (6373b9d).
Emotion: 😊 good, 😐 neutral, 😟 friction. Pain points get IDs (PP-xx) used in §3 and §4.

### J1 — First time (P1): sign up → first CV → first fit score

| Stage | User action now | Touchpoint (screen) | Feeling | Pain point / evidence |
|---|---|---|---|---|
| 1. Arrive | Reads landing, presses "สร้างบัญชี" | Landing `/` | 😊 | — |
| 2. Sign up | Email + password, then must confirm email (OTP or link) before any AI run | `/signup`, verify | 😐 | **PP-01** AI actions are blocked until email is verified (`lib/accountGate.ts`); the user may not connect the greyed button with the email step. [E: code] |
| 3. Create project | Names a project | `/app/projects/new` | 😐 | **PP-02** "Project" is a concept the user did not come for; a first-time user has nothing to name it after. [H] |
| 4. Add CV | Today → "อัปโหลด CV" → picks file → waits ~10 s while pages are read | Today → CV page | 😟 | **PP-03** Upload can fail on real CVs (UXR-01, fixed locally). **PP-04** 10+ s wait; progress says "reading", no page count. [E: smoke test ~11 s] |
| 5. Check what was read | Opens preview (real file), may press "สกัด CV" | CV page | 😐 | **PP-05** Two artefacts: the file and the "experience bank". Users do not know which one the score uses (UXR-04). **PP-06** "สกัด CV" is jargon. [E: UXR-04, UXR-05] |
| 6. Find a job | Find jobs → search → picks a card | Find jobs | 😐 | **PP-07** Smart match vs keyword search modes; how matching works is not explained on screen (UXR-04). |
| 7. First score | "ดูคะแนนความเหมาะสม" → session page opens and evaluates (one POST) → waits | Session | 😊 after wait | **PP-08** Lands on a page called a session with tabs; the wait (LLM) has no estimate. [E: code `?start=evaluate`] |
| 8. Understand score | Reads 84 %, verdict, requirement rows | Session → evaluation | 😊 | **PP-09** Score uses the CV only, not the experience bank; adding facts later does not change it (UXR-04). |

Moment of truth: stage 4 (upload) and stage 8 (score). The trial broke at stage 4.

### J2 — Returning (P2): search → evaluate → draft → record applied

| Stage | User action now | Touchpoint | Feeling | Pain point / evidence |
|---|---|---|---|---|
| 1. Come back | Opens Today, sees next step + stats | Today | 😊 | — |
| 2. Search | Find jobs, filters (≤30 days), smart match with chosen CV | Find jobs | 😐 | **PP-10** Choosing the CV for matching is easy to miss and same-name CVs look alike (UXR-03, partly fixed: file kind shown). |
| 3. Save / evaluate | Bookmark or evaluate from the card | Find jobs → Session | 😊 | **PP-11** Several CVs with no primary → a dialog appears to pick one (extra step). [E: `EvaluateButton.tsx`] |
| 4. Tailor CV | Session → tailor tab → accept/reject edits backed by facts | Session (tabs) | 😐 | **PP-12** Tailoring uses the experience bank; if empty, suggestions are thin and the user is sent to another page. [E: code, UXR-04] |
| 5. Draft letter | Next-step button "ร่างจดหมาย" → waits → document | Session → Documents | 😐 | **PP-13** The draft lands in Documents; the user must leave the job context to read it. [E: UXR-07 job 4] |
| 6. Apply (outside) | Applies on the employer site | external | — | Out of scope by design (manual submission). |
| 7. Record applied | Marks "สมัครแล้ว" (Session next step, Today, or My jobs) | My jobs | 😊 | — (1 click now) |
| 8. Follow up | Stage changes, notes, practice | My jobs, Session practice tab | 😐 | **PP-14** Practice is reachable only from a session tab or Today's next step at stage "interview". [E: `nextStep.ts`] |

## 3. User flows (with branches and errors)

Notation: `[screen]`, `(action)`, `<decision>`, `!error`. Clicks count presses from the stated start, not typing.
"Now" counts come from the code path on `develop`; budget numbers from UXR-07/08.

### F1 — Add a CV (first time)

```
[Today, no CV] (อัปโหลด CV)               ← 1
  → [CV page] (pick file in OS dialog)     ← 2
     <file type PDF / DOCX / TXT?>
        no → !"ชนิดไฟล์ไม่รองรับ" (pages.uploadInvalidType) → pick again
     <≤ 10 pages?>
        no → !document_too_many_pages → user must shorten the file (no in-app help)   [PP-15]
     <daily upload quota left?>
        no → !quota_exceeded with reset time
     <email verified?>  (only AI runs are gated; upload itself works)
     [reading pages… ~10 s]
        <OCR available?>
           no → !ocr_unavailable "อ่านเอกสารนี้ไม่ได้ ลอง…"   [PP-03]
           blank page → skipped (NO_TEXT)
     [CV card: name · v1 · PDF, "ดูตัวอย่าง", "สกัด CV"]
  (ดูตัวอย่าง) → real file preview         ← 3 (optional)
  (สกัด CV) → extraction run → "สกัดแล้ว N ข้อเท็จจริง"   ← 3–4 (optional)
        <provider configured / verified / quota?> no → reason shown under the button
```
- Now: **2 clicks** to a stored CV, **3–4** to see/extract. Budget before the simplify pass was 7 (UXR-07). ✅ meets the 3-click target.
- Gaps: no "page too long" guidance (PP-15); extraction meaning not explained in user terms (PP-06).

### F2 — Evaluate a job

```
Entry A: [Find jobs] card → (ดูคะแนนความเหมาะสม)        ← 1
Entry B: [Today] next step "ประเมิน" / [My jobs] row (ประเมิน) ← 1
  EvaluateButton:
    <usable CVs?>  none → dialog → "add a CV" path (F1)          [+2 or more]
    <one CV or a primary?> yes → POST session
                           no  → CV picker dialog (choose, Start)   [PP-11, +2]
    <session already exists for CV+job?> yes → open it (no new run)
    !network/server → falls back to the CV picker dialog
  → [Session ?start=evaluate] runs evaluate once
    <email verified?> no → button disabled with "verify email first"   [PP-01]
    <quota?> no → !quota_exceeded with reset time
    [waiting: run status] (no time estimate)                          [PP-08]
    <run failed?> yes → "ลองอีกครั้ง" (retry)                          ← +1
    [Result: % + band + verdict + requirement rows + strengths/risks]
```
- Now: **1 click** (single/primary CV) or **3** (several CVs, no primary). Before: 5 (UXR-07). ✅
- Gaps: score uses CV only (PP-09) — not explained at the point of choice; wait has no estimate (PP-08).

### F3 — Prepare an application (tailor + letter + record)

```
[Session, scored] next step (ร่างจดหมาย)                       ← 1
  <experience bank has facts?>
     no → draft still runs from CV only; tailoring suggestions are thin   [PP-12]
  <quota / verified?> no → disabled with reason
  [waiting]  !failed → retry
  → document appears in the session "documents" list and in [Documents]
  (open document) → [Document detail]                          ← 2   [PP-13]
     (export / edit in builder)                                ← 3+
Optional tailor CV: [Session] tab "เตรียมเอกสาร" → (start tailor) → proposals
     (accept / reject each)  → new CV revision                  ← 3 + n
Record: after applying outside → next step (สมัครแล้ว)          ← 1
     !stage change failed → error message, old stage kept
```
- Now: letter **1 click** to start, **2** to read; record applied **1**. Before: 4–5 and 3 (UXR-07). ✅
- Gaps: reading the letter leaves the job (PP-13); tailoring depends on a bank the user may not have filled (PP-12).

### Click summary (now vs before vs budget)

| Task | Before (UXR-07) | Now (code path) | Target (UX_SIMPLIFY_PLAN §5) | Verdict |
|---|---|---|---|---|
| First CV stored | 7 clicks / 4 screens | 2 / 2 | 3 / 2 | ✅ |
| Find job → fit score | 5 / 3 | 1 / 2 (3 if CV choice needed) | 2 / 2 | ✅ (⚠ several CVs) |
| Saved job → score | 5 / 4 | 1 / 2 | 2 / 2 | ✅ |
| Draft letter after score | 4–5 / 3 | 1 to start, 2 to read / 2 | 2 / 1 | ⚠ reading leaves the job |
| Record applied | 3 / 1 | 1 / 1 | 1 / 1 | ✅ |

Click counts are now fine. The remaining problems are **understanding** (PP-05, 06, 07, 09) and **waiting** (PP-04, 08), which click budgets do not measure.

## 4. Pain points ranked (what to fix next)

Severity 1–4 (4 = blocks the task), impact on P1/P2.

| PP | Problem | Sev | Who | Proposed fix (needs owner OK) |
|---|---|---|---|---|
| PP-03 | Real CV upload can fail (trial) | 4 | P1, P2 | Release the OCR + 16k fix to prod (already on develop); add a clear recovery path (try DOCX/TXT, or paste text). |
| PP-09 / PP-05 | User does not know the score uses the CV only, and what the experience bank is for | 3 | P1, P2 | One sentence at the CV choice and on the score: "คะแนนคิดจาก CV ฉบับนี้"; rename the bank in user terms, e.g. "ข้อเท็จจริงสำหรับเขียนเอกสาร". |
| PP-01 | AI blocked until email is verified, not obvious | 3 | P1 | Show a verify banner on Today with a resend button before the first AI action, not only a disabled button. |
| PP-07 | Matching logic opaque | 2 | P2 | "คำนวณอย่างไร" link next to the CV picker (2–3 lines). |
| PP-08 / PP-04 | Waits without estimate | 2 | P1 | Show "ปกติใช้ราว 20–40 วินาที" from measured run times (Q-03), and pages read "3/5". |
| PP-13 | Reading a draft leaves the job | 2 | P2 | Open the draft in a side panel inside the session. |
| PP-12 | Tailoring thin when bank is empty | 2 | P2 | Before tailoring, offer "สกัด CV ก่อน" in place. |
| PP-02 | "Project" concept on first run | 2 | P1 | Auto-create the first project ("การหางานของฉัน"), let users rename later. |
| PP-06 | "สกัด CV" jargon | 1 | P1 | "ดึงประสบการณ์จาก CV". |
| PP-15 | >10 pages: no help | 1 | P2 | Say which pages to drop, or allow choosing pages. |
| PP-11 | Several CVs, no primary → dialog | 1 | P2 | Ask once to set a primary CV. |
| PP-14 | Practice hard to find | 1 | P2 | Keep as is until users ask (low evidence). |

## 5. Open questions (to validate the hypotheses)

| Q | Question | Why it matters | Recommended answer |
|---|---|---|---|
| Q-01 | Are P1 and P2 the real users of this customer? Who else (HR, career centre staff)? | Personas drive every priority above | Ask the customer for 5 target users; run 5 short tasks during UAT |
| Q-02 | Should the fit score also use experience-bank facts? | Changes PP-09 from copy fix to model change | Keep CV-only (score must match what is sent); explain it |
| Q-03 | What are real wait times (p50/p90) for read CV, evaluate, draft on prod? | Needed for honest estimates (PP-08) | Read from run timestamps on prod after release |
| Q-04 | Auto-create the first project? | Removes a step for P1 but changes the model of projects | Yes, named after the user's goal, renamable |
| Q-05 | Usability test round: when and with whom? | Only real tests confirm the [H] items | Use UAT: 5 users, 5 tasks (sign up→score, save→draft, record applied, find why a score is low, change CV), measure success, time, errors |

## 6. What this does not cover

No wireframes yet (step 4 of the plan): only screens whose structure changes after the owner picks fixes from §4.
No measured task times or success rates; those need Q-05.
