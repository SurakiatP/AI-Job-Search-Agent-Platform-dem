# Manual spec: AI Job Search Agent Platform (user guide, Thai)

Status: draft for owner review. Written 2026-10-21. Every claim below cites a file; open points are Q-xx.

## Purpose and readers
- Teach a job seeker in Thailand to use the app from sign-up to tracking applications. Source: `PRODUCT.md` (Users, Product Purpose).
- Reader: an individual user (one book, `user-guide`). No admin book: the app has no admin screens for users (`frontend/src/features/settings/GatewaySettings.tsx` is read-only: provider keys live on the server).

## Product overview
A personal, project-scoped workspace: CVs, jobs, evaluations, documents, practice sets and applications live inside a project (`PRODUCT.md`, Operating Context). The app never submits an application; the user records status themselves (`frontend/src/features/applications/ApplicationBoard.tsx`).

## Feature inventory and page plan
| Page (file) | Feature | Main sources |
|---|---|---|
| 01 getting-started | sign up, verify email (link or 6-digit code), first project | `features/auth`, `features/projects` |
| 02 cv-and-experience | upload CV, AI extracts experience, edit; CV builder | `features/profile`, `features/builder` |
| 03 build-cv | build a CV in the app (form, template, preview, save as new version; feeds the AI agents) | `features/builder` |
| 04 search-and-evaluate | job search, Smart match, evaluation sessions | `features/search`, `features/sessions`, `features/chat` |
| 05 tailor-and-draft | AI tailors CV and drafts documents; user reviews and exports | `features/chat`, `features/documents` |
| 06 interview-practice | question sets (Thai or English), answers, flashcards, AI feedback | `features/practice` |
| 07 track-applications | board and list, notes, manual status | `features/applications`, `lib/applicationStages.ts` |
| 08 job-alerts | saved searches and digests by email, Telegram, webhook | `features/search/SavedSearches.tsx`, `features/digest`, `features/settings` |
| 09 safety-and-data | project isolation, what is sent to the AI provider | `PRODUCT.md`, `features/settings` |

Media: 19 pictures and 6 clips (15-35 s) per language, from synthetic data: orange numbered rings mark what to use, clips carry blue step captions and a cover frame. AI pictures: evaluation, tailor-CV proposals, practice feedback, experience extraction. They show in the in-app pages only; the PDF has text without pictures. Refresh with `tests/e2e/manual-shots.spec.ts` and `manual-clips.spec.ts` (set `MANUAL_SHOTS=1`), clips converted with ffmpeg (mp4, no audio). Output: PDF (th, en) and the in-app pages at `/docs/<topic>` (`frontend/src/features/docs`).

## Questions (owner)
- Q-01 Document number, approvers, client name and developer name are `(รอระบุ)` in `manual/manual.config.yaml`.
- Q-02 Page 01 says an email link or a 6-digit code (valid 10 minutes) verifies the account; confirm against the running app.
- Q-03 Page 02 button name for extraction ("สกัดประสบการณ์ด้วย AI" or "สกัดประสบการณ์จาก CV ด้วย AI อีกครั้ง") needs a check in the running app.
- Q-04 Page 03 assumes the search page has a Smart match mode and a CV picker; confirm in the running app.
- Q-05 Page 08 says where data is stored on the server, retention and security standards are `(รอระบุ)`.
- Q-07 The AI scenes (evaluation, tailor proposals, feedback, extraction) use mock data shaped like real results; confirm wording against a real run.
- Q-06 English guide written by translation of the Thai pages; step 6 of the practice page shows the Thai word "ไทย" because the app itself shows it in English UI (`session-workspace.en.json`).

## Product issues noticed
- 28 stray `*.tsx-E` backup files are tracked in `frontend/src` (from `sed -i` on macOS); not part of this work.
- `manual-kit check` reports "UI label does not exist" for labels that are in `frontend/src/locales/*.th.json`: the adapter reads one locale file only. Labels were verified by hand (see report).

## Out of scope
Admin guide, DOCX output, pictures in the PDF, narration/music for clips, signing (`manual-kit sign`, done by a person after reading).
