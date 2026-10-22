---
version: 1
slug: "frontend-src-features-practice-practicesetpage-tsx"
primary_target: "frontend/src/features/practice/PracticeSetPage.tsx"
related_targets: ["frontend/src/features/practice/PracticeTab.tsx"]
---

Scope: interview practice set page (CR-IVP-01) and the session "ซ้อมสัมภาษณ์" tab. Mode: Operate. Inherits the app world (DESIGN.md tokens, Noto Sans Thai, indigo primary); no new identity.

Audience/job: a Thai job seeker rehearsing for one specific job before the interview day, often in short sittings, sometimes on a phone.

## Direction contract
THESIS: A practice set is the interview day laid out as a run sheet: rounds in order, a course line that fills as questions are marked ready, so the owner always sees the whole day and where they are in it.
OWN-WORLD: App tokens only. Course line and current leg in --primary; done legs filled primary with white numerals; ready questions in --success dots; AI label on generated text; flat bordered cards, 14px radius.
STORY: The owner opens a set, sees every round with time estimates and readiness, works the current question (answer box, "why we ask", bank stories to pull in, optional timer), and technical rounds switch the work pane into a Quizlet-style flashcard stage.
FIRST VIEWPORT: Header (set name, level, sections count, CV pair, rename and summary actions). Left 380px column: run sheet of rounds with course line, expanded current round listing its questions. Right: work pane with the current question at 24px, answer box, story chips, primary "ขอความเห็นจาก AI" (PR 2; PR 1 shows "บันทึกคำตอบ" and "พร้อมแล้ว").
FORM: Run sheet (dealt lead, seed de9366a5) with the card-stage flashcard (dealt 3rd) inside technical rounds. Signature move: the course line filling round by round; flashcard 3D flip with know/learning piles, swipe and keys 1/2/Space/arrows, cross-fade under reduced motion.
FINISH: unreviewed undocumented unfinished; build ends with finish review, verdict, DESIGN.md, shipping raster carrying provenance
Mobile: run sheet collapses to a top progress strip with a round picker; work pane full width; flashcard fills width with swipe.
