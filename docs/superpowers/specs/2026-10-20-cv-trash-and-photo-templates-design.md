# CV trash and photo templates — CR-CVT-01

Status: owner approved 2026-10-20 (all recommended answers accepted: bank facts stay, old templates stay photo-free, three new layouts as proposed).

## The why

The owner (job seeker) deletes a CV by mistake and cannot get it back, unlike evaluations and documents. Thai employers often expect a photo on a CV, and the builder has no way to add one.

## Part 1: CV trash

- **FR-CVT-01** Deleting a CV moves it to the trash (the existing soft delete, `cvs.removed_at`). The CV list shows an undo notice.
- **FR-CVT-02** `GET /projects/{id}/cvs?view=trash` lists trashed CVs that are not purged, newest first, with `trashed_at`.
- **FR-CVT-03** `POST /cvs/{id}/restore` takes a CV out of the trash. If the project has no primary CV at that moment, the restored CV becomes primary. A purged or unknown CV is 404.
- **FR-CVT-04** `DELETE /cvs/{id}/permanent` works only on a trashed CV (else 409 `cv_not_trashed`). It deletes uploaded files, parsed CV text, builder data and draft, rendered PDFs, job match scores and the CV's photos. It keeps the CV name and revision numbers (rows marked `purged_at`), so evaluations still say "CV: name · v2", and keeps evaluations, documents made from the CV, and experience-bank facts.
- **FR-CVT-05** A file still used elsewhere (a document revision, run artifact, approval, or another CV's builder data) is not deleted; only the CV's link to it is removed.
- **FR-CVT-06** If a run on one of the CV's revisions is queued, running or waiting for approval, or an approval to promote into it is open, permanent delete is refused with 409 `cv_in_use`.
- **FR-CVT-07** The project trash page gets a third tab "CV"; the sidebar count includes trashed CVs.

## Part 2: photo and three photo templates

- **FR-CVP-01** The builder's basics section lets the owner add a photo: JPG or PNG, at most 2 MB, cropped to 3:4 in the browser. The owner can change or remove it.
- **FR-CVP-02** `POST /projects/{id}/resume-photos` stores the photo as a private file (`kind = resume_photo`) and returns its id; `GET /projects/{id}/resume-photos/{file_id}` returns it to the owner. The server checks the file's first bytes, not the declared type. Owner only.
- **FR-CVP-03** Resume data gets `basics.photo` (a file id or empty). It is never part of the text sent to AI. Tailored CVs keep it, because tailoring edits text only.
- **FR-CVP-04** Three new templates show the photo: `lotus` (one column, square photo top right; ATS-safe), `teak` (accent sidebar, round photo on top; not ATS-safe), `saffron` (full-width colour header with round photo; ATS-safe). Without a photo each lays out cleanly with no empty box.
- **FR-CVP-05** The existing templates (onyx, kakuna, ditgar) never show the photo; when a photo is set and one of them is chosen, the builder says "This template does not show a photo".
- **FR-CVP-06** A photo id that is not a live `resume_photo` file of the same project is rejected on save (`resume_invalid`, field `basics.photo`).

## Acceptance criteria

- [ ] **AC-CVT-01** `P0` — Given a trashed CV, when restored, then it is listed again and its revisions are usable; with no other primary it is primary.
- [ ] **AC-CVT-02** `P0` — Given a trashed builder CV used by an evaluation, when purged, then its files, text, draft and match scores are gone, the session still shows the CV name and revision, and its bank facts remain.
- [ ] **AC-CVT-03** `P0` — Given a live CV, permanent delete returns 409 `cv_not_trashed`; given a running run on it, 409 `cv_in_use`.
- [ ] **AC-CVT-04** `P1` — The trash page has a CV tab; restoring there lowers the sidebar count.
- [ ] **AC-CVP-01** `P0` — Given a JPEG photo and template `lotus`, when previewed, then the render bundle contains the photo bytes and the theme names it; with `onyx` it does not.
- [ ] **AC-CVP-02** `P0` — A GIF, a renamed text file, or a 3 MB file is rejected; another project's photo id is rejected on save.
- [ ] **AC-CVP-03** `P0` — The text sent to AI never contains the photo id.
- [ ] **AC-CVP-04** `P1` — The owner can add, see and remove a photo in the builder, and sees the note on a photo-free template.

## Impact

| Layer | Change |
|---|---|
| DB | Migration 0035: `cvs.purged_at`; `files.kind` allows `resume_photo`. |
| REST | `GET cvs?view=trash`, `POST cvs/{id}/restore`, `DELETE cvs/{id}/permanent`, photo upload/read; `CVView.trashed_at`; new template ids. OpenAPI updated. |
| Render | `render_bundle` takes optional photo bytes; both render paths (builder preview/publish, tailored CV) load it. |
| AI | None: `plain_text` lists fields explicitly; checked by AC-CVP-03. |
| Frontend | Profile CV list delete + undo, trash CV tab, builder photo field and three templates. |

## Limits

- A replaced or removed photo stays stored until its CV is purged or the project is deleted (older revisions may still name it). ponytail: add orphan clean-up when storage size matters.
