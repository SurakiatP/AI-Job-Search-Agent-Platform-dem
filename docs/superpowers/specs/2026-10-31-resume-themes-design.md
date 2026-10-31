# Resume themes: 12 presets, theme builder, shareable theme files (SPEC-RTH)

Status: DRAFT for owner review, 2026-10-31. Project level: product. Branch `feat/resume-themes` (from `develop` 40b1b9c).
Part 1 of 3 inspired by AienTech/dossier. Parts 2 (more job sources) and 3 (Startups page) get their own specs.

## 1. Why (who, job, outcome)

- **Who:** a job seeker who builds a CV in the CV builder and exports it as PDF.
- **Job:** make the CV look like their own and fit the job (ATS-plain for portals, more designed for people), then reuse or share that look.
- **Outcome:** choose from 12 ready themes, adjust one in a builder with a live preview, and export or import a theme as a small file.
- **Owner's words (2026-10-31):** "ธีมเรซูเม่ 12 แบบ + ตัวสร้างธีม แชร์เป็นไฟล์ได้", UI in the style of the two reference recordings (the Aksara app: airy light background, white rounded cards, solid blue primary, numbered section labels, left menu) but in this app's colours; no black in the UI.

## 2. Understanding written back

| Said by the owner | Assumption (to confirm, see section 11) |
|---|---|
| 12 themes like Dossier | 6 existing templates keep their ids; 6 more are added. Themes may share a layout and differ in tokens. |
| Theme builder | A form over a closed set of options, not a code editor. |
| Shareable as a file | One small JSON file, validated on import. No Typst code travels in it. |
| Aksara style, our colours | Visual language from the recordings, tokens from `DESIGN.md` (indigo primary `#4F46E5`, background `#F6F7FB`). |

## 3. Current state (evidence)

- `backend/src/job_search_platform/services/resume.py`: `TEMPLATES` (onyx, kakuna, ditgar, lotus, teak, saffron; value = reads in order for ATS), `PHOTO_TEMPLATES` (lotus, teak, saffron), `ACCENTS` (6 named colours), `render_bundle(data, template, accent, lang, photo)` writes `resume.json`, `labels.json`, `theme.json` and compiles with Typst.
- Templates live in `backend/src/job_search_platform/data/resume_templates/*.typ` and import `common.typ`; user data is only read with `json()` and printed as text.
- `GET /resume-templates` (`api/resume.py`) lists templates, accents and provinces. `resume_drafts` rows carry `template_id` and `accent`.
- Fonts referenced by `common.typ`: Open Sans, Libertinus Serif, Noto Sans Thai, Noto Serif Thai.

## 4. Scope

In: 12 preset themes, custom themes per user, builder UI with live preview, export/import file, using a theme on a CV, tests.
Out: a public theme gallery, user-written Typst, uploading fonts, changing CV content or the AI tailoring flow, parts 2 and 3.

## 5. Theme model

A theme is data, never code.

```json
{ "format": "jsp-resume-theme", "version": 1, "name": "My theme",
  "layout": "onyx", "tokens": { "accent": "#3730A3", "font_pair": "sans", "size": "normal",
                                "density": "normal", "heading_style": "rule" } }
```

| Field | Allowed values |
|---|---|
| `name` | 1–60 characters, trimmed, no control characters |
| `layout` | one of the layout ids that exist as `.typ` files (closed set in code) |
| `accent` | `#RRGGBB` with contrast ratio >= 4.5 against white (text on white must stay readable) |
| `font_pair` | `sans` or `serif`, each mapped in code to fonts already in `common.typ` |
| `size` | `small`, `normal`, `large` (fixed point sizes in code) |
| `density` | `compact`, `normal`, `relaxed` (fixed spacing scale in code) |
| `heading_style` | `plain`, `rule`, `band` |

- Unknown keys, wrong types or out-of-range values reject the whole file.
- `ats_safe` and `photo` are not stored; both are derived from `layout` (same flags the six templates have today).
- The 12 presets are constants in code (id, Thai and English display name, layout, tokens). Presets cannot be edited or deleted; "duplicate" creates a custom theme.
- Existing ids onyx, kakuna, ditgar, lotus, teak, saffron stay as preset ids with the tokens that reproduce today's output, so saved CVs render the same.

## 6. Functional requirements

| ID | Requirement |
|---|---|
| FR-RTH-01 | The system shall offer 12 preset themes in the builder and in the CV template picker, each with a name and a thumbnail. |
| FR-RTH-02 | The six existing template ids shall render exactly as before for CVs that already use them. |
| FR-RTH-03 | When the owner changes a token, the system shall show an updated preview rendered by the server from the current CV data. |
| FR-RTH-04 | The system shall let the owner save a theme as a custom theme (max 20 per owner) and duplicate any theme. |
| FR-RTH-05 | The system shall export a theme as a `.json` file with the format in section 5. |
| FR-RTH-06 | When a file is imported, the system shall validate it fully before saving; if any rule fails, it shall save nothing and name the first failing rule. |
| FR-RTH-07 | The system shall never put theme file content into Typst source; only the validated values from `theme.json` reach the template. |
| FR-RTH-08 | The system shall let the owner apply a preset or custom theme to a CV, and shall show whether it reads in order for ATS and whether it prints a photo. |
| FR-RTH-09 | While a custom theme is used by a CV draft or revision, the system shall refuse to delete it and say how many CVs use it. |
| FR-RTH-10 | The system shall render all 12 presets in Thai and English. |
| FR-RTH-11 | Custom themes shall be visible only to their owner. |

## 7. Acceptance criteria (Given / When / Then)

- **AC-RTH-01** `P0` traces FR-RTH-02. Given a CV drafted with template `kakuna` and accent `teal` before this change, When it is exported after the change, Then the Typst input (`theme.json` values and template file) is identical to before. TC: golden bundle comparison for all six ids.
- **AC-RTH-02** `P0` traces FR-RTH-06, FR-RTH-07. Given a theme file with an extra key, an `accent` of `#FFFF00`, a `layout` of `../x`, or a 5 KB body, When it is imported, Then the response is 422, no theme row is created, and the error names the rule.
- **AC-RTH-03** `P0` traces FR-RTH-05, FR-RTH-06. Given a saved custom theme, When it is exported and imported again, Then a second custom theme exists with equal tokens and a name made unique by a numeric suffix.
- **AC-RTH-04** `P1` traces FR-RTH-10. Given sample CV data in Thai and in English, When each of the 12 presets is rendered, Then Typst compiles and the PDF has at least one page with the CV name present as text.
- **AC-RTH-05** `P1` traces FR-RTH-09. Given a custom theme used by 2 CVs, When the owner deletes it, Then the response is 409 with `used_by = 2` and the theme remains.
- **AC-RTH-06** `P1` traces FR-RTH-11. Given owner A's custom theme, When owner B requests it by id, Then the response is 404.
- **AC-RTH-07** `P1` traces FR-RTH-03. Given the builder is open, When the owner changes `density`, Then within 3 seconds on the test environment the preview shows the new spacing, and a failed render keeps the previous preview and shows a retry message.
- **AC-RTH-08** `P2` traces FR-RTH-08. Given a preset whose layout is not ATS-safe, When it is selected, Then the picker shows the "not read in order for ATS" note.
- **AC-RTH-09** `P1` UI. Given a 1440 px desktop and a 390 px phone, When the builder opens, Then no content overflows horizontally, every control has a visible focus ring, and with `prefers-reduced-motion` no transition longer than 0 ms runs. No colour in the builder is black or near-black.

## 8. Design

**Backend**
- New table `resume_themes` (id, owner_id, name, layout, tokens JSONB, created_at, updated_at); unique (owner_id, name). One migration.
- `services/resume_themes.py`: pydantic models with `extra="forbid"`, the preset constants, `validate_file(bytes)`, contrast check, layout and font maps.
- `render_bundle` accepts a resolved theme (layout + tokens). Layout file chosen from the closed set; tokens written into `theme.json` next to the existing keys. `common.typ` reads `size`, `density`, `font_pair`, `heading_style` with defaults equal to today's values (this is what keeps AC-RTH-01 true).
- `resume_drafts.template_id` may be a preset id or `custom:<uuid>`; `accent` stays for presets and is ignored for custom themes (the theme owns its accent).
- API (under the existing resume router): `GET /resume-themes` (presets + own custom), `POST /resume-themes` (save), `POST /resume-themes/import`, `GET /resume-themes/{id}/export`, `DELETE /resume-themes/{id}`, `POST /resume-themes/preview` (theme + CV id → PDF/PNG bytes; rate limited like other renders).
- `GET /resume-templates` keeps working and lists the 12 presets for older clients.

**Frontend** (`features/builder` and a new `features/themes`; built with `park-sdlc-kit:impeccable` at implementation time, Operate mode)
- Three zones: theme cards on the left (12 presets, then custom, with `01 //` style numbered labels), live preview in the centre on a white page card over a soft indigo-tinted background, controls on the right (accent, font pair, size, density, heading style, layout).
- Buttons: duplicate, save, export, import (file picker plus drag and drop). Thai-first copy. Colours only from `DESIGN.md` tokens.

## 9. Test plan (tests first, mutation checks)

| TC | Covers | Level |
|---|---|---|
| TC-RTH-01 | golden Typst bundle for 6 old ids unchanged | unit |
| TC-RTH-02 | import rejects each bad-file case, one data row per case | api |
| TC-RTH-03 | export then import round trip, name suffix | api |
| TC-RTH-04 | render 12 presets x 2 languages | integration (Typst) |
| TC-RTH-05 | delete blocked while used; owner isolation | api |
| TC-RTH-06 | preview success and failure | api |
| TC-RTH-07 | builder at 1440 and 390 px, reduced motion, no black | e2e + screenshots |

Mutation checks before commit: remove the contrast check, remove `extra="forbid"`, drop the layout allowlist, and drop the owner filter; each must make at least one test fail.

## 10. Risks and assumptions

- A-RTH-01 The fonts in `common.typ` are installed in the render image; the font maps use only those. To verify against the Dockerfile before building.
- A-RTH-02 Six more presets can be made by new token sets plus a small number of new layouts; the number of new `.typ` files is decided in the plan after reading the six existing ones.
- A-RTH-03 Preview uses the same server render as export (about 1 s per render is acceptable); no client-side renderer.
- Risk: a custom accent on a coloured header band needs white text; the contrast rule applies to the accent against white and against the text colour used on bands.

## 11. Open questions

- **Q-RTH-01** Deleting a theme that CVs use: block (recommended, as in FR-RTH-09) or fall back to onyx? Owner decides.
- **Q-RTH-02** Names for the 6 new presets (Thai and English)? Recommended: I propose names at plan time from the layout style; owner approves with the screenshots.
- **Q-RTH-03** Should the theme file carry the owner's name or email? Recommended: no, only the fields in section 5.
