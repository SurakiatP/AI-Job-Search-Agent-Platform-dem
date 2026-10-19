# CV builder with Typst resume templates (part 1 of 4) — design

Status: design approved in chat by the owner on 2026-10-19, section by section ("อนุมัติ"); written spec awaiting owner review.
Branch: `feat/ux-core-workspaces` (after #27 merged into `develop` at 962666b).

## Goal

Every feature needs a CV first, but a new user may not have one, and the PDF the agent exports today is one dense block of text. This part lets a user build a CV in the app from a form, pick one of three templates, see the real PDF while editing, and save it as an ordinary CV version that evaluation, Smart match and CV tailoring use at once.

Success means: a user with no CV reaches a usable CV version without uploading a file; the PDF has clear sections, reads in ATS text extraction, and renders Thai correctly.

### Why the export is dense today (evidence, 2026-10-19)

The tailored CV stored for document `f0bb09b2…` is 1,949 characters with 8 line breaks, one heading and no bullets: the CV text was extracted flat from the uploaded PDF, the agent rewrote it flat, and `infra/hermes/typst_render.py` (29 lines) laid out what it was given. A better template alone cannot fix this; the CV must be stored as structured data. Parts 2 and 3 apply the same data to uploaded CVs and to tailoring.

### The four parts

1. **This spec:** resume data, three Typst templates, form-based builder.
2. Import an uploaded CV into resume data for the user to check.
3. AI tailoring edits resume data (highlights, skills) instead of rewriting Markdown, keeping the chosen template.
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
| B7 | **Draft and versions.** One editable draft per CV, autosaved. "Save as new version" creates an immutable `CVRevision` as today. A revision is never edited. |
| B8 | **Preview is the real PDF** rendered in the sandbox (approach 2). If a queued preview takes more than ~5 s (measured first), stop and decide approach 3 (Typst in the backend) with an ADR. |
| B9 | **Field names follow the Reactive Resume schema** (`basics`, `summary`, `sections.<name>.items[]`) for the fields we use, so its JSON can be imported later. Import itself is out of scope. |
| B10 | **The experience bank stays the source of facts.** Publishing writes builder entries to `ExperienceItem` with `source = 'owner'`, so the evidence gate keeps working. |
| B11 | Owner only. Agents (grants) and MCP/A2A cannot read or change drafts in this part. |
| B12 | Document language reuses the existing "document language" setting (th/en) for section headings. The builder UI follows the app language. |

## Data

Migration `0033_cv_builder`.

**`cv_drafts`** (new): `cv_id` (PK, FK `cvs`, cascade), `project_id` (FK, cascade), `resume_data` JSON, `template_id` VARCHAR(20) check in (`onyx`,`kakuna`,`ditgar`), `accent` VARCHAR(20) check in the 6 names, `document_language` check in (`th`,`en`), `preview_file_id` UUID null, `updated_at`. One row per builder CV; uploaded CVs have none.

**`cv_revisions`** gains `resume_data` JSON null and `template_id` VARCHAR(20) null. Uploaded revisions keep both null.

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

### Publish ("Save as new version"), one transaction

1. Validate the draft; require `basics.name` and at least one non-empty section.
2. Render the final PDF (same path as preview) and store it as the revision file.
3. Create `CVRevision` (next revision number) with `resume_data` and `template_id` copied from the draft.
4. Write `CVRevisionText` generated from `resume_data` in section order (headings, then one line per field or highlight), skipping references and hidden sections. Not extracted from the PDF.
5. Sync the experience bank: each item becomes or updates `ExperienceItem` rows (`source='owner'`, kind per section, role/organization/period filled). Items removed from the draft are soft-removed. Item `id` links draft entries to bank rows.

If rendering fails, nothing is written and the draft is kept.

## Rendering

- Files: `infra/hermes/templates/{common,onyx,kakuna,ditgar}.typ` and `infra/hermes/templates/NOTICE` (Reactive Resume MIT notice).
- Each render writes `resume.json`, `labels.json` (section headings for the document language) and the template files into the run workspace. The bridge `export` op gains `engine="typst-template"` with a `template` argument and runs `typst compile --font-path /usr/share/fonts` in the existing network-disabled sandbox. No image rebuild: templates are copied in per run.
- Templates read data with Typst `json()` and print strings only, so user text can never become Typst code.
- New run operation `cv_preview`: no AI, no tokens; does not block other document exports; a newer preview request cancels a queued older one for the same CV. The PDF is written to `cv_drafts.preview_file_id`, replacing the previous preview file.
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
- `GET /projects/{pid}/cvs/{cvId}/draft` → draft. 404 `not_found` for uploaded CVs.
- `PUT /projects/{pid}/cvs/{cvId}/draft` `{resume_data, template_id, accent, document_language, updated_at}` → draft. Stale `updated_at` → 409 `draft_conflict`.
- `POST /projects/{pid}/cvs/{cvId}/draft/preview` → 202 `RunView`; `GET .../draft/preview.pdf` → the latest preview (404 until one exists).
- `POST /projects/{pid}/cvs/{cvId}/draft/publish` → 201 `CVRevisionView`.
- Rate limits (`rate_limits.LIMITS`): `cv_draft_save` 60/60 s, `cv_preview` 20/60 s per user.
- All are owner-session only, CSRF-protected, project-scoped like the existing CV routes.

## UI

- Every place that requires a CV offers both **Upload CV** and **Build a CV**: Overview getting started (step 1), CV & experience page (empty state and add button), New evaluation dialog (no CV), Smart match (no CV). Builder CVs show **Edit in builder**.
- Route `/app/projects/:id/cvs/:cvId/builder`. 1440: form left, sticky PDF preview right. 390: tabs Edit / Preview.
- Top bar: CV name, template picker (3 thumbnails), 6 accent swatches, document language, save status ("Saved · 10:42"), **Save as new version**.
- Form: 13 collapsible sections with add/remove item, move up/down (keyboard), hide section, move section. Plain inputs only; a multi-line field gives one PDF bullet per line; month/year dates with "Present". References section explains it is never sent to AI and has the "Available on request" switch. Skill level is optional.
- Autosave ~1 s after typing stops; preview ~2 s after, or "Update preview". Preview failure keeps the last PDF with a message and retry. Save failure shows a banner and keeps the draft in `localStorage` until saved.
- Publish validates, then confirms that it creates "CV version n", usable for evaluation and tailoring at once.
- First open: if the experience bank has items, ask "Start from your experience bank?"; otherwise an empty form with example placeholders.
- Thai and English copy for everything; light and dark themes; the PDF preview stays white.

## Testing

- **Backend unit:** `resume_data` validation (size, counts, bad URL schemes, unknown keys, dates); `CVRevisionText` generation order and the exclusion of references and hidden sections; experience-bank sync (add, update, soft-remove, kinds).
- **Backend integration:** create builder CV (empty and `from_experience`); draft save and 409 conflict; publish writes revision, file, text and bank rows in one transaction and writes nothing when rendering fails; uploaded CV has no draft (404); project isolation; grants denied; rate limits.
- **Template render:** all 3 templates × Thai and English × short and long (multi-page) synthetic data. Check: valid PDF, Thai fonts embedded, extracted text contains every section heading; first page saved as a PNG for review.
- **Playwright:** no CV → build → publish → start an evaluation with that version; autosave and offline draft recovery; switch template and accent; hide and reorder sections by keyboard; 390 and 1440, Thai and English, light and dark.
- Synthetic data only; no real personal data in fixtures.

## Out of scope

Photo, custom fonts and spacing, drag-and-drop, importing an uploaded CV (part 2), AI tailoring on resume data (part 3), DOCX, importing Reactive Resume JSON files, agent (MCP/A2A) access to drafts.

## Risks

- Preview over 5 s forces approach 3 and an ADR before the UI is built.
- Doubled Thai characters in copied text may not be fixable in this part; ATS would then read some Thai names wrongly. Recorded with evidence if so.
- Existing tailoring (part 3 not done) still writes flat Markdown for uploaded CVs; builder CVs tailored before part 3 lose their template in the tailored copy.
