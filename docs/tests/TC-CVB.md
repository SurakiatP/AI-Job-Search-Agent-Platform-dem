# Test cases — CV builder with Typst templates (CVB)

Spec: `docs/superpowers/specs/2026-10-19-cv-builder-design.md` (owner approved 2026-10-19).
Written before development, as required for product level. Test names start with the TC id, e.g. `test_tc_cvb_05_render_failure_writes_nothing`; Playwright titles start with `TC-CVB-nn`.

## Risk ranking

| Risk | P × I | Source | AC | Priority |
|---|---|---|---|---|
| Third-party contact data (references) reaches an AI provider | 2 × 3 | B6, PDPA | AC-CVB-06 | P0 `critical` |
| Another project or an agent reads or changes a draft | 2 × 3 | B11 | AC-CVB-15 | P0 `critical` |
| Tailoring changes facts it may not touch (name, dates, employer) | 2 × 3 | B13 | AC-CVB-08 | P0 `critical` |
| An unevidenced claim enters a tailored CV | 2 × 3 | B13, evidence gate | AC-CVB-09 | P0 `critical` `regression` |
| Publish writes half a version (file without revision, bank rows without text) | 2 × 3 | B7 | AC-CVB-05 | P0 `critical` |
| New user cannot reach a usable CV | 2 × 3 | Goal | AC-CVB-01 | P0 `critical` `smoke` |
| Unsafe link (`javascript:`) or oversized data stored or printed | 2 × 2 | Validation rules | AC-CVB-14 | P1 |
| Two tabs overwrite each other | 2 × 2 | B7 | AC-CVB-03 | P1 |
| Owner edits of a tailored CV leak into the experience bank | 2 × 2 | B14 | AC-CVB-12 | P1 |
| Tailored builder CV loses its template | 2 × 2 | CR-01 | AC-CVB-10 | P1 |
| Uploaded-CV tailoring regresses | 2 × 2 | B16 | AC-CVB-13 | P1 `regression` |
| Autosave silently loses typing | 2 × 2 | B7 | AC-CVB-02 | P1 |
| No way to build a CV from a page that requires one | 1 × 2 | Goal | AC-CVB-07 | P2 |
| Template or accent switch not applied | 1 × 2 | B2, B4 | AC-CVB-04 | P2 |
| Tailored CV preview not shown | 1 × 2 | CR-01 | AC-CVB-11 | P2 |

## Test data and setup

- Backend: `api_context` and `db_session` fixtures (`backend/tests/conftest.py`), fake model runtime as in `backend/tests/integration/test_cv_tailoring.py`, fixed clock where time matters.
- Playwright: `useSyntheticApplication` (`tests/fixtures/application.ts`) plus a new builder fixture to be added in `tests/fixtures/` by the developer.
- Synthetic Thai data only: name "สมชาย ตัวอย่าง", email `candidate@example.test`, phone `000-000-0000`, company "บริษัท ตัวอย่าง จำกัด". Reference: "สมหญิง ผู้อ้างอิง", `referee@example.test`, `000-111-2222`.
- Row data for multi-case TCs: `tests/data/cvb/TC-CVB-<nn>.json`.

---

## TC-CVB-01 Build a CV from nothing and evaluate with it
AC: AC-CVB-01 · `P0 critical smoke` · Level: e2e · Automate: yes
Pre-condition: project with no CV; job "Data Analyst · บริษัท ตัวอย่าง จำกัด" saved (fixture).

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Open Overview | — | Getting started step 1 shows "Upload CV" and "Build a CV" |
| 2 | Press "Build a CV", answer "Start from your experience bank?" with "Empty form" | CV name "CV ทดลอง" | Builder opens with an empty form and a preview area |
| 3 | Fill name and one experience item | name "สมชาย ตัวอย่าง"; company "บริษัท ตัวอย่าง จำกัด"; position "Data Analyst"; start 2023-01; Present; one highlight "สร้างรายงานยอดขายรายเดือน" | Status shows "Saved · hh:mm" |
| 4 | Press "Save as new version", confirm | — | Confirmation names "CV version 1"; then a success message |
| 5 | Open New evaluation | — | CV list contains "CV ทดลอง · v1" |
| 6 | Start the evaluation with that CV and the job | — | Evaluation page opens and shows the compared CV "CV ทดลอง · v1" |

Cleanup: none (fresh synthetic project per test).

## TC-CVB-02 Autosave after typing stops
AC: AC-CVB-02 · `P1` · Level: e2e · Automate: yes
Pre-condition: builder CV "CV ทดลอง" with a draft (API seed).

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Type in Headline | "Data Analyst" | No save request while typing |
| 2 | Wait 1.5 s | — | Exactly one draft save request; status "Saved · hh:mm" |
| 3 | Reload the page | — | Headline is "Data Analyst" |

## TC-CVB-03 Draft conflict between two tabs
AC: AC-CVB-03 · `P1` · Level: api · Automate: yes
Pre-condition: builder CV with draft; client A and B both GET the draft (same `updated_at` T0).

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | A: PUT draft with `updated_at`=T0 | headline "A" | 200; body `updated_at` T1 > T0 |
| 2 | B: PUT draft with `updated_at`=T0 | headline "B" | 409 `draft_conflict` |
| 3 | GET draft | — | headline "A", `updated_at` T1 |
| 4 | Repeat 1–3 on a tailored document draft (`/documents/{id}/draft`) | same | same results |

## TC-CVB-04 Template and accent switch reaches the PDF
AC: AC-CVB-04 · `P2` · Level: api · Automate: yes
Pre-condition: builder CV with name and one experience item; fake sandbox records the render request.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | PUT draft, POST preview | `onyx`, `indigo` | Render request names template `onyx`, accent `#3730A3` |
| 2 | PUT draft, POST preview | `ditgar`, `teal` | Render request names `ditgar`, `#115E59` |
| 3 | GET `/resume-templates` | — | 3 templates; `ditgar` has `ats_safe: false`; 6 accents |

## TC-CVB-05 Render failure on publish writes nothing
AC: AC-CVB-05 · `P0 critical` · Level: api · Automate: yes
Pre-condition: builder CV with valid draft and one published version (v1); fake sandbox set to fail the next render.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Count rows | — | Record counts of `cv_revisions`, `cv_revision_texts`, `files`, live `experience_items` for the project |
| 2 | POST publish | — | 502 `render_failed` |
| 3 | Count rows again | — | All counts unchanged; latest revision still v1 |
| 4 | GET draft | — | Draft content and `updated_at` unchanged |
| 5 | Make sandbox succeed; POST publish | — | 201; revision v2; one new file; one text row; bank rows synced |

## TC-CVB-06 References never reach the model or the CV text
AC: AC-CVB-06 · `P0 critical` · Level: api · Automate: yes
Pre-condition: builder CV whose draft has one reference ("สมหญิง ผู้อ้างอิง", `referee@example.test`, `000-111-2222`) and one experience item; fake model runtime records every prompt.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | POST publish | — | 201 |
| 2 | Read `CVRevisionText` of the new revision | — | Contains none of: "สมหญิง", "referee@example.test", "000-111-2222" |
| 3 | List experience items | — | One row of kind `reference` exists; experience-to-AI export (`bank_vocabulary`, facts list) excludes it |
| 4 | Start `tailor_cv` (autopilot) on the revision with a job | — | Recorded prompt contains none of the three strings |
| 5 | Cite the reference row id as evidence in a fake edit | — | Edit rejected by the gate (`evidence_required`) |
| 6 | Set `references_on_request` true, publish, extract PDF text | — | PDF text contains the "Available on request" label and none of the three strings |

## TC-CVB-07 Every CV-required page offers Build a CV
AC: AC-CVB-07 · `P2` · Level: e2e · Automate: yes
Pre-condition: project with no CV.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Open Overview | — | "Upload CV" and "Build a CV" visible |
| 2 | Open CV & experience | — | Both actions visible in the empty state |
| 3 | Open New evaluation dialog | — | Both actions visible instead of the CV list |
| 4 | Open Search → Smart match | — | Both actions visible in the no-CV message |

## TC-CVB-08 Tailoring cannot touch protected fields
AC: AC-CVB-08 · `P0 critical` · Level: api · Automate: yes
Pre-condition: builder CV revision with one experience item, one education item; fake model returns the edits in the data file, each citing a live fact.
Test data: `tests/data/cvb/TC-CVB-08.json`

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Run `tailor_cv` (manual) with the row's edit | row `input` | Proposal list excludes the edit (row `expected: rejected`) or includes it (`expected: allowed`) |
| 2 | Apply all proposals | — | Resulting `resume_data` equals the source for every protected path |

## TC-CVB-09 Unevidenced highlight is rejected
AC: AC-CVB-09 · `P0 critical regression` · Level: api · Automate: yes
Pre-condition: builder CV revision; fact list has "Python" only.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Fake model adds highlight "ใช้ Kubernetes ใน production" citing the Python fact | — | Edit fails the gate; not in proposals or in the autopilot result |
| 2 | Fake model adds highlight "เขียน Python วิเคราะห์ข้อมูล" citing the Python fact | — | Edit passes and appears |

## TC-CVB-10 Tailored builder CV keeps template and accent
AC: AC-CVB-10 · `P1` · Level: api · Automate: yes
Pre-condition: builder CV revision rendered with `kakuna` / `teal`; one passing fake edit.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Run `tailor_cv` in autopilot | — | New `DocumentRevision` has `resume_data`, `template_id` `kakuna`, `accent` `teal`; render request names `kakuna` |
| 2 | Run `tailor_cv` in manual mode, apply the proposal | — | Same three values on the new revision |
| 3 | GET the document's draft | — | 200; `template_id` `kakuna`, `accent` `teal` |

## TC-CVB-11 Preview of a tailored CV on the Documents page
AC: AC-CVB-11 · `P2` · Level: e2e · Automate: yes
Pre-condition: tailored builder document with one revision and a stored PDF (fixture).

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Open Documents → the tailored CV | — | A PDF preview of the latest revision is shown and an "Edit" button is visible |

## TC-CVB-12 Editing a tailored CV makes a new version and leaves the bank alone
AC: AC-CVB-12 · `P1` · Level: api + e2e · Automate: yes
Pre-condition: tailored builder document v1; bank has N live items.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Open Edit; note shown | — | Text "Changes here stay in this tailored CV. Add new experience to your source CV." |
| 2 | Change the first highlight, save as new version | "สร้างแดชบอร์ดยอดขาย" | Document revision v2 exists; its `resume_data` has the new highlight |
| 3 | Count live bank items | — | Still N; no row with the new text |

## TC-CVB-13 Uploaded CV tailoring is unchanged
AC: AC-CVB-13 · `P1 regression` · Level: api + e2e · Automate: yes
Pre-condition: uploaded CV revision (no `resume_data`).

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Run `tailor_cv` (autopilot) | — | New `DocumentRevision` has `content_markdown`, `resume_data` null; export uses the Markdown path |
| 2 | GET the document's draft | — | 404 `not_found` |
| 3 | Open the document page | — | Shows "Build a CV in the app to use templates" and today's Markdown view |
| 4 | Existing suite `test_cv_tailoring.py` | — | All tests pass unchanged |

## TC-CVB-14 Resume data validation
AC: AC-CVB-14 · `P1` · Level: api · Automate: yes
Pre-condition: builder CV with a valid draft.
Test data: `tests/data/cvb/TC-CVB-14.json` (one row per case, valid boundaries included)

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | PUT draft with the row's change | row `input` | Row `expected`: 200, or 422 `resume_invalid` with the failing field path |
| 2 | POST publish with empty name | `basics.name` "" | 422 `resume_incomplete` |
| 3 | POST publish with name but every section empty | — | 422 `resume_incomplete` |

## TC-CVB-15 Drafts are owner-only and project-scoped
AC: AC-CVB-15 · `P0 critical` · Level: api · Automate: yes
Pre-condition: project P1 with a builder CV; project P2 owned by another user; a grant on P1 with every capability.

| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | P2 owner: GET/PUT/preview/publish P1's draft | — | 404 for each, no change |
| 2 | Grant on P1: same four calls | — | 403 for each, no change |
| 3 | Owner session without CSRF token: PUT | — | 403 |
| 4 | Owner: 61 draft saves within 60 s | — | 61st returns 429 `rate_limited` |
