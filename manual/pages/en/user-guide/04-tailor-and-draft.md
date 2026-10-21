---
id: tailor-and-draft
title: Tailor your CV and draft documents
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/chat/TailorCard.tsx, frontend/src/features/chat/SessionPage.tsx, frontend/src/features/chat/ApplyCard.tsx, frontend/src/locales/session-workspace.th.json]
---
## What is tailoring and drafting

After you evaluate a job, the agent can tailor your CV to that job and draft a cover letter or an application message. The agent uses only the facts in your experience bank. It does not guess and does not add skills you do not have. Your original CV is never changed. You always check the result before you use it.

## How to tailor your CV and draft documents

There are 2 ways.

### Way 1 Tailor your CV

1. Open the evaluation of the job you want.
2. Open the {{ui:"Prepare documents"}} tab.
3. On the {{ui:"Tailor CV"}} card, select the mode {{ui:"Autopilot"}} or {{ui:"Interactive"}}.
4. Enter {{ui:"What should change, and by how much?"}} (optional).
5. Click {{ui:"Tailor CV"}}.
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

- {{ui:"Autopilot"}} mode saves a new version of your CV right away. {{ui:"Interactive"}} mode lets you pick proposals before anything is saved.
- A proposal whose evidence is incomplete is marked {{ui:"Rejected by evidence check"}} and cannot be used.
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
