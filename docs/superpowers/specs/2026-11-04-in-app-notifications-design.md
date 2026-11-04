# In-app notifications (design)

Status: team design, 2026-11-04. Owner asked for an in-app notification system and let the team design it; owner reviews it on local before anything ships.

## Why

AI work takes from seconds to minutes (evaluate, draft, tailor, read a CV, practice questions). People leave the page while it runs and today have no way to learn, inside the app, that it finished, failed or is waiting for them. Webhooks and Telegram exist but need setup; most people will never set them up.

## What the person gets

1. A bell in the app header (desktop sidebar top, phone top bar) with a count of unread notifications (1–9, then "9+").
2. Clicking the bell opens a panel with the newest 30 notifications, newest first. Each row: an icon for the kind, one plain sentence, the time ("5 นาทีที่แล้ว"), and a dot when unread. Clicking a row marks it read and opens the page where the person acts on it.
3. "อ่านทั้งหมดแล้ว / Mark all as read" in the panel header.
4. While the app is open, a new notification also shows the existing snackbar (bottom-left, 6 s) with an "Open" action, unless the person is already on that notification's page.
5. Empty state: "ยังไม่มีการแจ้งเตือน งานที่ AI ทำเสร็จจะแจ้งที่นี่".

## What creates a notification

| Kind (`kind`) | Source event | Operations |
|---|---|---|
| `run_completed` | `run_completed` | evaluate_job, draft_documents, tailor_cv, apply_prepare, extract_experience, profile_cv, draft_follow_up, interview_generate, interview_report |
| `run_failed` | `run_failed` | same list |
| `run_needs_input` | `run_needs_input` | any operation |
| `run_waiting_approval` | `run_waiting_approval` | any operation |
| `digest_ready` | saved-search digest with ≥1 new job | — |

Not notified: cancelled runs (the person did it), quick or per-answer runs (`export_document`, `match_jobs`, `interview_grade`, `apply_submit` completion), interrupted runs (the supervisor resumes them).
One notification per (run, kind): a repeated event never duplicates (unique index).

## Data

Table `notifications` (migration `0041_notifications`):
`id uuid pk`, `user_id uuid not null → users.id on delete cascade`, `project_id uuid not null → projects.id on delete cascade`, `kind text not null`, `run_id uuid null → runs.id on delete cascade`, `data jsonb not null default {}`, `created_at timestamptz not null`, `read_at timestamptz null`.
Indexes: `(user_id, created_at desc)`; partial unique `(run_id, kind) where run_id is not null`.
`data` holds only what the sentence and link need: `operation`, `session_id`, `job_revision_id`, `job_title`, `job_company`, `cv_id`, `practice_set_id` (if known), `saved_search_id`, `saved_search_name`, `count`. No CV text, no job description.
Owner: the project's `user_id`. A project with no user (legacy single-owner mode) gets no notifications.
Retention: rows older than 30 days are deleted by the existing maintenance sweep; at most 200 rows per user (oldest dropped on insert).

## API (REST, account scope, owner session only)

- `GET /v1/notifications?limit=30` → `{ "items": NotificationView[], "unread_count": int }`, newest first, limit 1–50.
- `POST /v1/notifications/read` body `{ "ids": [uuid…] }` or `{ "all": true }` → `{ "unread_count": int }`. Ids that are not the caller's are ignored (no leak).
- `NotificationView = { id, project_id, kind, run_id|null, data, created_at, read_at|null }`.
Rows are written in the same transaction as the run event (`services/runs.py` append_event, next to `webhooks.enqueue_for_run_event`) and the digest (`services/saved_searches.py`, next to `webhooks.enqueue_digest`).

## Where a row links to

| Kind | Link |
|---|---|
| run with `session_id` (evaluate, draft, tailor, apply, follow-up) | `/app/projects/{p}/sessions/{session_id}` (needs_input: `?tab=answers` for apply_prepare, `?tab=documents` for tailor_cv) |
| interview_generate / interview_report | `/app/projects/{p}/sessions/{session_id}/practice/{practice_set_id}` when known, else the session `?tab=practice` |
| extract_experience / profile_cv | `/app/projects/{p}/profile` |
| run_waiting_approval | `/app/projects/{p}/console?tab=approvals` |
| digest_ready | `/app/projects/{p}/search` |

## Sentences (Thai first; English beside)

- evaluate completed: "ประเมิน {job} เสร็จแล้ว" / "Fit score ready for {job}"
- draft completed: "ร่างเอกสารสำหรับ {job} เสร็จแล้ว" / "Documents drafted for {job}"
- tailor completed: "ปรับ CV สำหรับ {job} เสร็จแล้ว" / "CV changes ready for {job}"
- apply_prepare completed: "เตรียมคำตอบใบสมัคร {job} เสร็จแล้ว" / "Application answers ready for {job}"
- extract/profile completed: "อ่าน CV เสร็จแล้ว" / "Finished reading your CV"
- interview_generate completed: "ชุดคำถามซ้อมสัมภาษณ์ {job} พร้อมแล้ว" / "Practice questions ready for {job}"
- interview_report completed: "สรุปผลการซ้อมสัมภาษณ์ {job} พร้อมแล้ว" / "Practice summary ready for {job}"
- draft_follow_up completed: "ร่างข้อความติดตามผล {job} เสร็จแล้ว" / "Follow-up drafted for {job}"
- failed (any): "{งาน} ไม่สำเร็จ แตะเพื่อลองใหม่" / "{Task} did not finish. Open to try again"
- needs_input: "{งาน} รอคำตอบจากคุณ" / "{Task} is waiting for your answer"
- waiting_approval: "มีงานรอให้คุณอนุมัติ" / "An action is waiting for your approval"
- digest_ready: "มีงานใหม่ {count} ตำแหน่งจากการค้นหา “{name}”" / "{count} new jobs for “{name}”"
`{job}` = "title · company" (title only when no company; "งานนี้ / this job" when unknown).

## Visual and motion (DESIGN.md stays frozen)

- Bell: lucide `Bell`, ghost icon button, 44 px target (40 px ≥ lg), same row as `RunIndicator`. Badge: `bg-primary text-primary-foreground` pill, `min-w-5 h-5 text-[11px] tabular-nums`, top-right of the icon, `aria-hidden`; the button's accessible name carries the count ("การแจ้งเตือน, ยังไม่อ่าน 3").
- Panel: Radix DropdownMenu content, `w-[min(92vw,24rem)]`, `rounded-2xl`, max height `min(70dvh,32rem)` with scroll, header row (title + mark-all), rows as menu items (keyboard arrows, Enter opens, Esc closes and returns focus to the bell).
- Kind icons and tones: completed `CheckCircle2` success; failed `AlertTriangle` destructive; needs_input `MessageCircleQuestion` warning; waiting_approval `ShieldCheck` warning; digest `Sparkles` primary. Icon in a 32 px tinted circle; never colour alone (the sentence says the state).
- Unread: dot `size-2 bg-primary` + `sr-only` "ยังไม่อ่าน"; read rows use muted text.
- Motion: panel opens from the trigger (`transform-origin` = Radix var), scale .96→1 + fade, 160 ms `cubic-bezier(.23,1,.32,1)`, close 120 ms; badge pops (scale .6→1, 200 ms) only when the count goes up; nothing animates under `prefers-reduced-motion` except opacity.

## Freshness

Poll `GET /notifications` every 30 s while the tab is visible, on window focus, and right after the RunIndicator sees a run leave the active state. No new stream endpoint (YAGNI); SSE can come later if 30 s feels slow.

## Out of scope (later, if asked)

Per-kind mute settings, email for these kinds, push to the phone, deleting single notifications.

## Acceptance (TC ids for e2e/pytest)

- TC-NTF-01 completing an evaluate run creates one `run_completed` row for the project owner; a second identical event creates none.
- TC-NTF-02 cancelled and interrupted runs and `interview_grade` create none.
- TC-NTF-03 `GET /notifications` returns only the caller's rows, newest first, with `unread_count`; another user's ids in `POST /read` change nothing.
- TC-NTF-04 digest with new jobs creates one `digest_ready` row with `count` and `saved_search_name`.
- TC-NTF-05 bell shows the unread count; opening the panel lists rows with sentence, time and unread dot; clicking a row marks it read and navigates to its link.
- TC-NTF-06 "Mark all as read" sets the count to 0.
- TC-NTF-07 a new notification during the session shows the snackbar with "Open", but not when already on its page.
- TC-NTF-08 empty state text; Thai and English; keyboard: open with Enter, arrows move, Esc returns focus to the bell; 390 px width has no overflow.
