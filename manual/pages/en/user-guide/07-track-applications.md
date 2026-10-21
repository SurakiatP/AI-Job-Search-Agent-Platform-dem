---
id: track-applications
title: Track your applications
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/applications/ApplicationBoard.tsx, frontend/src/features/applications/ApplicationPanel.tsx, frontend/src/features/chat/ApplyCard.tsx, frontend/src/lib/applicationStages.ts, frontend/src/locales/applications-workspace.th.json]
---
## What is tracking applications

This page collects the jobs you have saved and shows how far each one has got. You can see them as a list or as a board. The app does not send applications for you. You apply yourself on the company website, then record the status here.

**Before you start**

- To save a job from a search, click {{ui:"Save job"}} on that job in {{ui:"Job search"}}. See [[search-and-evaluate]].
- If you already have a posting, you can add it on this page without searching first.

![Applications — circle 1 = switch to the board, 2 = add a posting](/manual/applications.en.png)

![Video: the board view and dragging a card to a new status](/manual/applications.en.mp4)

## How to track your applications

1. Go to {{ui:"Applications"}}.
2. Click {{ui:"Board"}}. The jobs show as columns by status.
3. If you have no jobs yet, click {{ui:"Add posting"}}, fill in the form, then click {{ui:"Save posting"}}.
   - {{ui:"Job title"}} (required)
   - {{ui:"Job description"}} (required)
   - {{ui:"Company (optional)"}} and {{ui:"Source URL (optional)"}} (if you have them)
4. Drag a job card to the column that matches its status.
5. A message says the card was moved to the new status.
6. If you dropped it in the wrong place, click {{ui:"Undo"}}.
7. Open a card, click {{ui:"Add note"}}, write a {{ui:"Note"}}, then click {{ui:"Save note"}}.

## Good to know

- The statuses are {{ui:"Saved"}}, {{ui:"Applied"}}, {{ui:"Responded"}}, {{ui:"Interview"}}, {{ui:"Offer"}} and {{ui:"Hired"}}, plus {{ui:"Rejected"}} and {{ui:"Withdrawn"}}.
- Moving a card only updates your own record. It is not sent to the employer.
- If dragging is hard, for example on a phone, use the {{ui:"Stage"}} menu in the list instead.
- {{ui:"Record as applied"}} on the session page first creates an approval request for you. After you approve, the app only records that you applied. It does not send the application.
- The evaluation and fit score in the details page are an AI estimate. They do not predict whether you will get the job. The statuses and notes are records you make yourself.
- The agent prepares answers for application forms using only facts in your experience bank. You check them and send them yourself.
- Withdrawn and rejected jobs go in the closed group.

## Problems and fixes

- Problem: "Could not update the stage. Try again."
  Fix: Drag the card again, or choose the stage from the list.
- Problem: "No applications match"
  Fix: Click {{ui:"Clear filters"}}.
- Problem: "The posting could not be saved. Your draft is still here; try again."
  Fix: Click {{ui:"Save posting"}} again.

## Related questions

- [[search-and-evaluate]]
- [[search-and-evaluate]]
- [[safety-and-data]]
