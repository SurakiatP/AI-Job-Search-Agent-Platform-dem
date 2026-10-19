# CV builder with Typst resume templates (part 1 of 4) — design

Status: design approved in chat by the owner on 2026-10-19, section by section ("อนุมัติ"). CR-01 (tailored CVs in templates, preview and edit) approved in chat on 2026-10-19 ("ตามที่แนะนำ"). Written spec awaiting owner review.
Branch: `feat/ux-core-workspaces` (after #27 merged into `develop` at 962666b).
Project level: product. Process: `park-sdlc-kit` (system-analysis); FR ids `FR-CVB-nn`, acceptance criteria `AC-CVB-nn`.

## Goal

Every feature needs a CV first, but a new user may not have one, and the PDF the agent exports today is one dense block of text. This part lets a user build a CV in the app from a form, pick one of three templates, see the real PDF while editing, and save it as an ordinary CV version that evaluation, Smart match and CV tailoring use at once. A CV the agent tailors from a builder CV keeps a template, and the user can preview and edit it.

Success means:
- a user with no CV reaches a usable CV version without uploading a file;
- the PDF has clear sections, reads in ATS text extraction, and renders Thai correctly;
- a tailored copy of a builder CV is rendered in a template and can be opened, previewed and edited.

Traces to TOR FR-C01 (CV input), FR-C02 (AI tailoring), FR-C03 (versions), FR-C04 (CV PDF). The builder itself goes beyond the TOR's upload-only wording; the owner chose it on 2026-10-19 (DEC in chat).

### Why the export is dense today (evidence, 2026-10-19)

The tailored CV stored for document `f0bb09b2…` is 1,949 characters with 8 line breaks, one heading and no bullets: the CV text was extracted flat from the uploaded PDF, the agent rewrote it flat, and `infra/hermes/typst_render.py` (29 lines) laid out what it was given. A better template alone cannot fix this; the CV must be stored as structured data.

### The four parts

1. **This spec:** resume data, three Typst templates, form-based builder, and tailoring of builder CVs on resume data (moved here from part 3 by CR-01).
2. Import an uploaded CV into resume data for the user to check.
3. Tailoring of uploaded CVs on resume data (needs part 2).
4. Extras: more templates, photo, drag-and-drop ordering.

## Decisions

| # | Decision |
|---|---|
| B1 | **Path C.** Our own Typst templates in the existing sandbox render. No fork of Reactive Resume and no new runtime or dependency. Designs follow three Reactive Resume templates (MIT; notice kept in the repo). |
| B2 | **Templates:** `onyx` (single column, serif name, rule under header, skills in a 2-column grid), `kakuna` (single column, centred name, accent section headings with rules), `ditgar` (two columns, accent sidebar with contact, skills, certifications, languages; repeats on every page). Selecting `ditgar` shows a warning that some ATS read two columns out of order. |
| B3 | **No photo** in this part. The photo area of each design is dropped and the header moves up. |
| B4 | **Accent colour:** one of 6 fixed colours: `indigo` #3730A3, `blue` #1D4ED8, `teal` #115E59, `green` #166534, `rose` #9F1239, `slate` #334155 (default `indigo`). Each passes WCAG AA as text on white and with white text on it (checked by a unit test). No free colour picker. |
| B5 | **Sections (13):** basics (name, headline, email, phone, location, profile links), summary, experience, education, skills (optional level), projects, certifications, languages, awards, publications, volunteer, references, interests. Each section can be hidden and reordered; empty sections are not printed. |
| B6 | **References are third-party personal data (PDPA).** Stored and printable, never sent to any AI, never evidence, never in `CVRevisionText`. A switch prints "Available on request" instead of the entries. |
| B7 | **Draft and versions.** One editable draft per CV or per tailored document, autosaved. "Save as new version" creates an immutable revision as today. A revision is never edited. |
| B8 | **Preview is the real PDF** rendered in the sandbox (approach 2). If a queued preview takes more than ~5 s (measured first), stop and decide approach 3 (Typst in the backend) with an ADR. |
| B9 | **Field names follow the Reactive Resume schema** (`basics`, `summary`, `sections.<name>.items[]`) for the fields we use, so its JSON can be imported later. Import itself is out of scope. |
| B10 | **The experience bank stays the source of facts.** Publishing a builder CV writes its entries to `ExperienceItem` with `source = 'owner'`, so the evidence gate keeps working. |
| B11 | Owner only. Agents (grants) and MCP/A2A cannot read or change drafts in this part. |
| B12 | Document language reuses the existing "document language" setting (th/en) for section headings. The builder UI follows the app language. |
| B13 | **Tailoring a builder CV edits `resume_data`, not Markdown** (CR-01). The agent may change only: `summary.content`, `highlights` of experience, projects and volunteer items, and the skills list (add an item, reorder items). It may never change basics, dates, company, institution, education, references, or remove an item. Every changed or added text still cites fact ids and passes the evidence gate. |
| B14 | **Owner edits of a tailored CV never flow back to the experience bank** (CR-01). A tailored CV is job-specific; the bank takes facts only from the source builder CV. The editor tells the owner to add new experience to the source CV. Owner edits do not go through the evidence gate (same as editing Markdown today). |
| B15 | **A tailored CV starts with the source CV's template and accent;** the owner may change both (CR-01). |
| B16 | **Uploaded CVs keep today's flat Markdown tailoring** until part 2 converts them (CR-01). Their document page says "Build a CV in the app to use templates". |
| B17 | **Autopilot tailoring of a builder CV also renders with the template;** manual mode still lets the owner pick proposals before saving (CR-01). |

## Functional requirements

| ID | Requirement | Trace |
|---|---|---|
| FR-CVB-01 | ระบบต้องให้เจ้าของโปรเจกต์สร้าง CV ใหม่จากแบบฟอร์มได้ โดยไม่ต้องอัปโหลดไฟล์ | TOR FR-C01, DEC 2026-10-19 |
| FR-CVB-02 | ระบบต้องบันทึกร่างของ CV ที่สร้างจากตัวสร้างโดยอัตโนมัติหลังผู้ใช้หยุดพิมพ์ 1 วินาที | B7 |
| FR-CVB-03 | หาก ร่างถูกบันทึกจากอีกแท็บหลังจากที่ผู้ใช้โหลดร่างมา ระบบต้องปฏิเสธการบันทึกด้วย `draft_conflict` และไม่เขียนทับ | B7 |
| FR-CVB-04 | เมื่อผู้ใช้ขอพรีวิว ระบบต้องสร้าง PDF จริงจากเทมเพลตที่เลือกและแสดงในหน้าแก้ไข | B8 |
| FR-CVB-05 | ระบบต้องให้เลือกเทมเพลต `onyx`, `kakuna` หรือ `ditgar` และสีเน้นหนึ่งใน 6 สี | B2, B4 |
| FR-CVB-06 | เมื่อผู้ใช้กด "บันทึกเป็นเวอร์ชันใหม่" ระบบต้องสร้าง `CVRevision` ใหม่ พร้อมไฟล์ PDF, ข้อความ CV และรายการในคลังประสบการณ์ ในธุรกรรมเดียว | B7, B10, TOR FR-C03 |
| FR-CVB-07 | หาก การเรนเดอร์ล้มเหลวระหว่างบันทึกเวอร์ชัน ระบบต้องไม่สร้างข้อมูลใดและเก็บร่างไว้ | B7 |
| FR-CVB-08 | ระบบต้องไม่ส่งข้อมูลบุคคลอ้างอิงให้ AI ใด ๆ และไม่ใช้เป็นหลักฐาน | B6 |
| FR-CVB-09 | ทุกหน้าที่ต้องมี CV ก่อน ระบบต้องมีทางเลือก "สร้าง CV ในระบบ" คู่กับ "อัปโหลด CV" | Goal |
| FR-CVB-10 | เมื่อ AI ปรับ CV ที่สร้างจากตัวสร้าง ระบบต้องแก้เฉพาะฟิลด์ที่อนุญาตใน B13 และทุกข้อความที่แก้ต้องผ่านตัวตรวจหลักฐาน | B13, TOR FR-C02 |
| FR-CVB-11 | ระบบต้องเรนเดอร์ CV ที่ AI ปรับแล้ว (จาก CV ตัวสร้าง) ด้วยเทมเพลตและสีของ CV ต้นฉบับ ทั้งโหมดเลือกเองและอัตโนมัติ | B15, B17 |
| FR-CVB-12 | ระบบต้องให้เจ้าของเปิดพรีวิว PDF ของ CV ที่ AI ปรับแล้วจากหน้าเอกสาร | CR-01 |
| FR-CVB-13 | ระบบต้องให้เจ้าของแก้ไข CV ที่ AI ปรับแล้ว (จาก CV ตัวสร้าง) ในตัวสร้างแบบเดียวกัน และบันทึกเป็นฉบับใหม่ของเอกสารนั้น | CR-01 |
| FR-CVB-14 | ระบบต้องไม่ส่งการแก้ไขของเจ้าของใน CV ที่ปรับแล้วกลับเข้าคลังประสบการณ์ | B14 |
| FR-CVB-15 | ในกรณีที่ CV ต้นทางเป็นไฟล์ที่อัปโหลด ระบบต้องปรับ CV ด้วยวิธีเดิม (Markdown) และแสดงว่าเทมเพลตใช้ได้กับ CV ที่สร้างในระบบ | B16 |
| FR-CVB-16 | หาก ข้อมูลร่างไม่ผ่านเกณฑ์ตรวจ (ขนาด, จำนวน, ลิงก์, วันที่, คีย์ที่ไม่รู้จัก) ระบบต้องปฏิเสธด้วย `resume_invalid` และระบุช่องที่ผิด | Validation |
| FR-CVB-17 | ระบบต้องให้เฉพาะเจ้าของโปรเจกต์อ่าน แก้ พรีวิว และบันทึกร่างได้ | B11 |

## Acceptance criteria

| ID | FR | Given / When / Then |
|---|---|---|
| AC-CVB-01 | 01, 06 | Given a project with no CV, when the owner builds a CV with a name and one experience item and saves a new version, then a `CVRevision` exists, it is selectable in New evaluation, and an evaluation can start with it. |
| AC-CVB-02 | 02 | Given an open builder, when the owner types and waits 1 s, then the draft is saved and the status shows "Saved · hh:mm". |
| AC-CVB-03 | 03 | Given the same draft open in two tabs, when tab B saves after tab A, then tab B gets `draft_conflict` and tab A's content is unchanged. |
| AC-CVB-04 | 04, 05 | Given a draft, when the owner switches template or accent, then the next preview PDF uses the new template or accent. |
| AC-CVB-05 | 07 | Given a draft and a render failure, when the owner saves a new version, then no `CVRevision`, file, text or bank row is written and the draft is unchanged. |
| AC-CVB-06 | 08 | Given a draft with references, when it is published and then tailored, then neither `CVRevisionText` nor any prompt sent to the model contains a reference's name or contact. |
| AC-CVB-07 | 09 | Given a project with no CV, when the owner opens Overview, CV & experience, New evaluation or Smart match, then each offers both "Upload CV" and "Build a CV". |
| AC-CVB-08 | 10 | Given a builder CV, when the model proposes an edit to `basics.name`, a date, a company or education, then that edit is rejected and not saved. |
| AC-CVB-09 | 10 | Given a builder CV, when the model proposes a highlight that cites no live fact, then the evidence gate rejects it as today. |
| AC-CVB-10 | 11 | Given a builder CV in `kakuna` / `teal`, when it is tailored in manual and in autopilot mode, then the tailored PDF is rendered with `kakuna` / `teal`. |
| AC-CVB-11 | 12 | Given a tailored builder CV, when the owner opens it on the Documents page, then a PDF preview of the latest revision is shown. |
| AC-CVB-12 | 13, 14 | Given a tailored builder CV, when the owner edits a highlight and saves, then a new document revision is created with the change, and the experience bank is unchanged. |
| AC-CVB-13 | 15 | Given an uploaded CV, when it is tailored, then the document is Markdown as today and its page shows "Build a CV in the app to use templates". |
| AC-CVB-14 | 16 | Given a draft, when a field breaks a validation rule (e.g. a `javascript:` link, 1,001 characters, 51 items), then the save returns 422 `resume_invalid` with that field's path; the boundary values (1,000 characters, 50 items) are accepted. |
| AC-CVB-15 | 17 | Given a builder CV in project P1, when another user's project owner or an agent grant calls any draft route, then it gets 404 or 403 and nothing changes. |

## Data

Migration `0033_cv_builder`.

**`resume_drafts`** (new): `id` (PK), `project_id` (FK, cascade), exactly one of `cv_id` (FK `cvs`, cascade) or `document_id` (FK `documents`, cascade), unique per owner object; `resume_data` JSON, `template_id` VARCHAR(20) check in (`onyx`,`kakuna`,`ditgar`), `accent` VARCHAR(20) check in the 6 names, `document_language` check in (`th`,`en`), `preview_file_id` UUID null, `updated_at`. Builder CVs and tailored builder documents have one row; uploaded CVs and Markdown documents have none.

**`cv_revisions`** gains `resume_data` JSON null and `template_id` VARCHAR(20) null. Uploaded revisions keep both null.

**`document_revisions`** gains `resume_data` JSON null, `template_id` VARCHAR(20) null and `accent` VARCHAR(20) null (CR-01). Markdown documents keep them null; a revision has either `resume_data` or `content_markdown`.

**`experience_items.kind`** check gains `award`, `publication`, `volunteer`, `reference`, `interest`, `language`. Rows of kind `reference` are excluded wherever experience is sent to AI or used as evidence.

Downgrade drops the table and columns and restores the old check (fails if new kinds exist, by design).

### `resume_data` shape

```json
{
  "basics": {"name": "", "headline": "", "email": "", "phone": "", "location": "",
             "profiles": [{"id": "", "network": "", "url": ""}]},
  "summary": {"content": ""},
  "sections": {
    "experience": {"hidden": false, "items": [{"id": "", "company": "", "position": "", "location": "",
                   "start": "2023-01", "end": null, "current": true, "highlights": [""]}]},
    "education": {"hidden": false, "items": [{"id": "", "institution": "", "degree": "", "area": "", "grade": "", "start": "", "end": ""}]},
    "skills": {"hidden": false, "items": [{"id": "", "name": "", "level": null, "keywords": [""]}]}
  },
  "order": ["summary", "experience", "education", "skills"],
  "references_on_request": false
}
```

Other sections follow the same pattern with their own fields: `projects` (name, role, url, start, end, highlights), `certifications` (name, issuer, date, url), `languages` (name, level), `awards` (title, awarder, date, summary), `publications` (title, publisher, date, url), `volunteer` (organization, role, start, end, highlights), `references` (name, relation, contact), `interests` (name).

**Validation** (Pydantic, at the API): whole document ≤ 200 KB; ≤ 50 items per section; ≤ 20 highlights per item; each text ≤ 1,000 characters (same as the experience bank); dates `YYYY` or `YYYY-MM`; URLs only `http`, `https`, `mailto`; item `id` is a UUID string; `level` null or 1–5; unknown keys rejected.

### Publish a builder CV ("Save as new version"), one transaction

1. Validate the draft; require `basics.name` and at least one non-empty section.
2. Render the final PDF (same path as preview) and store it as the revision file.
3. Create `CVRevision` (next revision number) with `resume_data` and `template_id` copied from the draft.
4. Write `CVRevisionText` generated from `resume_data` in section order (headings, then one line per field or highlight), skipping references and hidden sections. Not extracted from the PDF.
5. Sync the experience bank: each item becomes or updates `ExperienceItem` rows (`source='owner'`, kind per section, role/organization/period filled). Items removed from the draft are soft-removed. Item `id` links draft entries to bank rows.

If rendering fails, nothing is written and the draft is kept.

### Publish a tailored document (CR-01)

Same validation and render. Creates a `DocumentRevision` (next number) with `resume_data`, `template_id`, `accent` and the PDF file. No experience-bank sync (B14).

## Tailoring a builder CV (CR-01)

1. `tailor_cv` on a CV revision with `resume_data` sends the model the allowed fields only (B13), each with a stable path, plus the facts list. References and hidden sections are never sent.
2. The model returns edits as `{"path": "sections.experience.items[<id>].highlights[2]" | "summary.content" | "sections.skills.items", "op": "replace" | "add" | "reorder", "text": "...", "evidence_ids": [...]}`. Paths outside B13 are rejected before the gate.
3. Each `replace` or `add` edit goes through `require_evidence` as today. `reorder` of skills needs no evidence (it adds no claim).
4. Manual mode shows the proposals as today; the owner picks; autopilot applies the passing edits.
5. The result is a document with a `DocumentRevision` holding `resume_data` (template and accent from the source CV), rendered to PDF. A `resume_drafts` row is created for the document so the owner can edit it (FR-CVB-13).
6. Uploaded CVs keep the current Markdown path unchanged (B16).

## Rendering

- Files: `infra/hermes/templates/{common,onyx,kakuna,ditgar}.typ` and `infra/hermes/templates/NOTICE` (Reactive Resume MIT notice).
- Each render writes `resume.json`, `labels.json` (section headings for the document language) and the template files into the run workspace. The bridge `export` op gains `engine="typst-template"` with a `template` argument and runs `typst compile --font-path /usr/share/fonts` in the existing network-disabled sandbox. No image rebuild: templates are copied in per run.
- Templates read data with Typst `json()` and print strings only, so user text can never become Typst code.
- New run operation `resume_preview`: no AI, no tokens; does not block other document exports; a newer preview request cancels a queued older one for the same draft. The PDF is written to `resume_drafts.preview_file_id`, replacing the previous preview file.
- Multi-page output is allowed in all three templates.

### Must be proven first (step 1 of implementation)

| Check | Pass | If it fails |
|---|---|---|
| Queued preview time, warm sandbox, median of 10 | ≤ 5 s | Stop; ADR for approach 3 |
| Thai line breaking in Typst | Long Thai lines wrap between words | Insert zero-width spaces from a backend Thai word segmenter |
| Copied text of Thai names (today "ศรีรีสมบูรณ์") | `pdftotext` returns the text as typed | Try another Typst version or font; else record as a known limitation with the test output |
| Serif Thai font for onyx/kakuna names | Noto Serif Thai present in the image | Use Noto Sans Thai bold instead (no image change) |

## API (also in `docs/contracts/application-api.yaml`)

- `GET /resume-templates` → templates `{id, name, ats_safe}` and the 6 accents.
- `POST /projects/{pid}/cvs/builder` `{name, from_experience: bool}` → `CVView` (201). With `from_experience`, the draft is filled from the live experience bank.
- Draft routes, the same for `/projects/{pid}/cvs/{cvId}/draft` and `/projects/{pid}/documents/{documentId}/draft` (CR-01):
  - `GET .../draft` → draft. 404 `not_found` for uploaded CVs and Markdown documents.
  - `PUT .../draft` `{resume_data, template_id, accent, document_language, updated_at}` → draft. Stale `updated_at` → 409 `draft_conflict`.
  - `POST .../draft/preview` → 202 `RunView`; `GET .../draft/preview.pdf` → the latest preview (404 until one exists).
  - `POST .../draft/publish` → 201 `CVRevisionView` (CV) or `DocumentRevisionView` (document).
- `DocumentRevisionView` gains `template_id` and `has_resume_data` (CR-01).
- Rate limits (`rate_limits.LIMITS`): `resume_draft_save` 60/60 s, `resume_preview` 20/60 s per user.
- All are owner-session only, CSRF-protected, project-scoped like the existing CV routes.

### Errors (new)

| Code | HTTP | When | User sees (th) | User can |
|---|---|---|---|---|
| `draft_conflict` | 409 | Stale `updated_at` | ร่างนี้ถูกแก้จากที่อื่น โหลดร่างล่าสุดแล้วลองอีกครั้ง | Reload the draft |
| `resume_invalid` | 422 | Validation fails | ข้อมูลบางช่องไม่ถูกต้อง ดูช่องที่มีเครื่องหมาย | Fix the marked fields |
| `resume_incomplete` | 422 | Publish without name or content | ใส่ชื่อและข้อมูลอย่างน้อยหนึ่งหัวข้อก่อนบันทึก | Fill name and a section |
| `render_failed` | 502 | Typst render fails | สร้าง PDF ไม่สำเร็จ ข้อมูลของคุณยังอยู่ ลองอีกครั้ง | Retry |

## UI

- Every place that requires a CV offers both **Upload CV** and **Build a CV**: Overview getting started (step 1), CV & experience page (empty state and add button), New evaluation dialog (no CV), Smart match (no CV). Builder CVs show **Edit in builder**.
- Route `/app/projects/:id/cvs/:cvId/builder`; tailored documents use `/app/projects/:id/documents/:documentId/builder` with the same editor (CR-01). 1440: form left, sticky PDF preview right. 390: tabs Edit / Preview.
- Top bar: CV name, template picker (3 thumbnails), 6 accent swatches, document language, save status ("Saved · 10:42"), **Save as new version**.
- Form: 13 collapsible sections with add/remove item, move up/down (keyboard), hide section, move section. Plain inputs only; a multi-line field gives one PDF bullet per line; month/year dates with "Present". References section explains it is never sent to AI and has the "Available on request" switch. Skill level is optional.
- Autosave ~1 s after typing stops; preview ~2 s after, or "Update preview". Preview failure keeps the last PDF with a message and retry. Save failure shows a banner and keeps the draft in `localStorage` until saved.
- Publish validates, then confirms that it creates "CV version n" (usable for evaluation and tailoring at once) or "document version n" for a tailored CV.
- First open: if the experience bank has items, ask "Start from your experience bank?"; otherwise an empty form with example placeholders.
- **Tailored CV (CR-01):** the Documents page shows the PDF preview of a template document and an **Edit** button that opens the builder. The editor shows a note: "Changes here stay in this tailored CV. Add new experience to your source CV." Markdown documents keep today's view and show "Build a CV in the app to use templates".
- Thai and English copy for everything; light and dark themes; the PDF preview stays white.

## Assumptions about the world

| ID | Assumption | Depends | Owner | Check | If false |
|---|---|---|---|---|---|
| A-CVB-01 | The model follows the JSON edit format | FR-CVB-10 | Model provider (via LiteLLM) | Parser rejects malformed edits; integration test with fake runtime; one live run | Malformed edits are dropped; the run reports no edits, as today |
| A-CVB-02 | Typst in the Hermes image handles Thai shaping and line breaking | FR-CVB-04, 11 | Typst upstream (pinned 0.14.2) | Step-1 checks above | Fallbacks in the step-1 table |

## Testing

- **Backend unit:** `resume_data` validation (size, counts, bad URL schemes, unknown keys, dates); `CVRevisionText` generation order and the exclusion of references and hidden sections; experience-bank sync (add, update, soft-remove, kinds); tailoring edit paths: allowed paths accepted, forbidden paths rejected before the gate, references never in the prompt.
- **Backend integration:** create builder CV (empty and `from_experience`); draft save and 409 conflict (CV and document drafts); publish writes revision, file, text and bank rows in one transaction and writes nothing when rendering fails; tailored-document publish writes no bank rows; `tailor_cv` on a builder CV (manual and autopilot, fake runtime) produces a document revision with `resume_data`, the source template and accent; uploaded CV tailoring unchanged; uploaded CV has no draft (404); project isolation; grants denied; rate limits.
- **Template render:** all 3 templates × Thai and English × short and long (multi-page) synthetic data. Check: valid PDF, Thai fonts embedded, extracted text contains every section heading; first page saved as a PNG for review.
- **Playwright:** no CV → build → publish → start an evaluation with that version; autosave and offline draft recovery; switch template and accent; hide and reorder sections by keyboard; open a tailored CV, preview, edit and save; 390 and 1440, Thai and English, light and dark.
- Test names start with the AC id they prove (e.g. `test_ac_cvb_05_render_failure_writes_nothing`).
- Synthetic data only; no real personal data in fixtures.

## Out of scope

Photo, custom fonts and spacing, drag-and-drop, importing an uploaded CV (part 2), tailoring uploaded CVs on resume data (part 3), DOCX, importing Reactive Resume JSON files, agent (MCP/A2A) access to drafts.

## Risks

- Preview over 5 s forces approach 3 and an ADR before the UI is built.
- Doubled Thai characters in copied text may not be fixable in this part; ATS would then read some Thai names wrongly. Recorded with evidence if so.
- CR-01 adds roughly half again to this part's size (estimate, basis: one more draft owner, a second tailoring path and document UI).

## CR-01 — tailored builder CVs use templates and can be previewed and edited

Requested by the owner on 2026-10-19: the earlier draft listed as a risk that a builder CV tailored before part 3 would lose its template. The owner asked that templates support tailored CVs and that users can open a preview and edit them. Approved with all recommended answers (B13–B17) on 2026-10-19.

### Impact analysis

| Layer | Impact |
|---|---|
| FR | New FR-CVB-10 to 15. FR-CVB-01 to 09 unchanged. |
| Data | `cv_drafts` renamed to `resume_drafts` with a CV-or-document owner; `document_revisions` gains `resume_data`, `template_id`, `accent`. Not yet built, so no existing rows. |
| Existing records | Existing documents and revisions are Markdown and stay so; they keep today's view and editing. No migration of content. |
| API | Document draft routes added; `DocumentRevisionView` gains two fields (additive, existing clients unaffected). |
| Code | `services/tailoring.py` (second prompt and edit parser for resume data), `workers/executor.py` (`_tailor_base` and `_export_drafts` choose the path by `resume_data`), document routes in `api/rest.py`, Documents page and builder route in the frontend. Evidence gate (`require_evidence`) unchanged and reused. |
| Tests to re-run | Tailoring, evidence gate, documents, submit autopilot and durable-run suites, plus `test_contract` for the YAML. |
| Agents (MCP/A2A) | `tailor_cv` skill output for builder CVs now yields a template document; skill input unchanged. |
| Options considered | (a) do nothing: tailored builder CVs lose their template (rejected by owner); (b) this CR; (c) wait for part 3 (rejected: builder users would see the old flat PDF meanwhile). |
| Decided by | Owner, 2026-10-19. |

## As built (2026-10-19)

Differences from the design above, decided during implementation and verified with tests and a live run:

- **Preview does not go through the run queue.** `HermesRuntime.render_typst` compiles in a throwaway container of the pinned Hermes image (no network, no capabilities, read-only root, 512 MB, 1 CPU, 30 s), files in through stdin and the PDF out on stdout. Measured 0.2–0.7 s per render; the queued export path measured 4.1–4.7 s. No `resume_preview` run operation exists; previews are not stored.
- **Template and accent live in one JSON column `resume_style`** on `cv_revisions` and `document_revisions` (not two varchar columns), so older migration tests that seed revisions with raw SQL keep working.
- **Tailoring keeps the find/replace edit format.** For a builder CV the prompt is told only the summary and bullets may change, and `resume.apply_text_edits` places each gated edit into the summary or a highlight; an edit whose text is anywhere else (name, dates, employer, school) is rejected. A multi-line edit becomes several bullets. Same outcome as B13, no new model output format.
- **Owner facts carry `experience_items.builder_cv_id`**, so republishing a builder CV soft-removes only its own stale facts.
- **Generated PDFs use file kind `resume_render`.** A pending one left by an aborted publish is marked unavailable by reconciliation.
- **Known limitation, unchanged:** copied text of some Thai syllables is doubled by Typst 0.14.2 with Noto Thai fonts; the rendered page is correct.

## CR-02 — Thai address, personal details, page flow, faster preview, CV name (owner approved 2026-10-20)

Asked by the owner after using the builder: the address was one free-text line, the page felt 1–2 s slow,
long CVs had no page rules, and the CV name was not shown or editable in the builder.

| ID | Requirement |
|---|---|
| FR-CVB-18 | The system must store a Thai address (house/road, subdistrict, district, province as ISO `TH-nn`, 5-digit postcode). The CV shows district and province unless the owner ticks "show the full address"; drafts from before CR-02 keep using their free-text location. |
| FR-CVB-19 | The system must offer a "personal details" section (date of birth or age, nationality, military status, LINE ID, driving licence, expected salary, available from), hidden by default and never sent to AI. |
| FR-CVB-20 | Text sent to AI (`plain_text`) must contain only district and province from the address, never the full address or personal details. |
| FR-CVB-21 | When the CV is longer than one page, a section heading must not end a page alone, entries of up to 4 bullets must not split across pages, and pages from 2 on must show the owner's name and "page n/total". Ditgar shows its sidebar on page 1 only. |
| FR-CVB-22 | After an edit the draft must be saved 0.4 s after typing stops and the preview rebuilt right after the save, at most once per 3 s (server limit 20 previews a minute). The preview shows the page count and advises 1–2 pages when longer than 2. |
| FR-CVB-23 | The builder must show the CV name (or the tailored document's title) under the page title; the owner can edit it there (Enter or leaving saves, Esc cancels, empty is not saved). |

Impact: `resume_data` gains `basics.address`, `basics.address_full`, `personal`, `personal_hidden` and the
section name `personal` (defaults fill old drafts; the frontend normalises them on load). New route
`PATCH /projects/{id}/documents/{document_id}` (`DocumentRename`); `GET /resume-templates` also lists the
77 provinces; draft responses carry `name`. Measured render time 0.17 s, so the old delay was the 1 s save
wait plus the 1 s preview wait.

Known limit: Typst cannot widen a grid column per page, so on Ditgar pages 2+ the main column keeps its
width (the tint stops after page 1).

Tests: `backend/tests/unit/test_resume.py` (`test_cr02_*`), `backend/tests/integration/test_cv_builder.py`
and `test_cv_builder_tailoring.py` (`test_cr02_*`), `tests/e2e/cv-builder.spec.ts` (`CR-02 …`). The
keyboard-order e2e test now expects `personal` after `summary` (changed by this CR).
