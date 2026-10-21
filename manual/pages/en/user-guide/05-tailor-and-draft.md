---
id: tailor-and-draft
title: Tailor your CV and draft documents
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/chat/TailorCard.tsx, frontend/src/features/chat/SessionPage.tsx, frontend/src/features/chat/ApplyCard.tsx, frontend/src/locales/session-workspace.th.json, frontend/src/components/AiMark.tsx, frontend/src/locales/common.en.json, frontend/src/components/ProjectSidebar.tsx]
---
## What is tailoring and drafting

After you evaluate a job, the agent can tailor your CV to that job and draft a cover letter or an application message. The agent uses only the facts in your experience bank. It does not guess and does not add skills you do not have. Your original CV is never changed. You always check the result before you use it.

Before you start, get these ready:

- An evaluation of the job (see [[search-and-evaluate]]), because you open this from the evaluation.
- An experience bank that already has facts (see [[cv-and-experience]]). The agent uses only the facts in this bank.
- A confirmed email address, because this step uses AI.

![The AI agent proposes new CV lines backed by your experience bank; lines without evidence are blocked — circle 1 = Apply selected](/manual/ai-tailor.en.png)

![Video: let the AI agent propose CV changes, then apply only the ones you want](/manual/tailor.en.mp4)

## How to tailor your CV and draft documents

There are 2 ways.

### Way 1 Tailor your CV

1. Open the evaluation of the job you want: go to {{ui:"Evaluations"}} in the left menu of the project and choose the job.
2. Open the {{ui:"Prepare documents"}} tab.
3. On the {{ui:"Tailor CV"}} card, select the mode {{ui:"Autopilot"}} or {{ui:"Interactive"}}.
4. Enter {{ui:"What should change, and by how much?"}} (optional).
5. Click {{ui:"Tailor CV"}}. The screen shows the heading "Tailoring result" with "Made by AI" and "Check before use" labels.
6. In {{ui:"Interactive"}} mode, tick the proposals you want.
7. Click {{ui:"Apply selected"}}.
8. Click {{ui:"Open documents"}} to check your new CV.

### Way 2 Draft a cover letter or application message

1. Open the evaluation of the job you want.
2. Open the {{ui:"Prepare documents"}} tab.
3. Select {{ui:"Language of generated documents"}}.
4. Click {{ui:"Cover letter"}} or {{ui:"Application message"}}.
5. Wait until the agent has finished the draft.
6. Click {{ui:"Open document"}} to read and edit it.
7. To ask the AI for changes, enter text in {{ui:"Revision instructions"}} and click {{ui:"Create revision"}}.

## Good to know

- Tailoring the CV and drafting the letter or message all use AI. The results carry "Made by AI" and "Check before use" labels. Editing a tailored CV by hand does not use AI. To make or edit a CV yourself, see [[build-cv]].
- {{ui:"Autopilot"}} mode saves a new version of your CV right away. {{ui:"Interactive"}} mode lets you pick proposals before anything is saved.
- A proposal whose evidence is incomplete is marked {{ui:"Rejected by evidence check"}} and cannot be used.
- Edits you make on the tailored CV page stay in that CV only and are not added to your experience bank. If you have new experience, add it to your original CV.
- A new document never replaces the old one. Earlier versions stay in the history.
- The language of the documents is separate from the language of the app.
- Always check the content and facts yourself before you use a document for real.

## Problems and fixes

- Problem: "These proposals were already applied. Start a new tailoring run to change the CV again."
  Fix: Click {{ui:"Tailor CV"}} to start a new round.
- Problem: "A task for this document is running. Try again later."
  Fix: Wait for the current task to finish, then try again.
- Problem: "Could not start tailoring. Try again."
  Fix: Click {{ui:"Tailor CV"}} again.

## Related questions

- [[search-and-evaluate]]
- [[interview-practice]]
