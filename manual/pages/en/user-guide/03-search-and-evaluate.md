---
id: search-and-evaluate
title: Search for jobs and check your fit
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/search/SearchPage.tsx, frontend/src/features/search/SmartMatchStart.tsx, frontend/src/features/sessions/NewSessionDialog.tsx, frontend/src/locales/session-workspace.th.json]
---
## What is searching and evaluating jobs

You can search for jobs in Thailand on this page. Smart match lets the agent read your chosen CV and put the jobs that fit you first, with a score out of 5 and what is still missing. An evaluation compares one CV with one job posting. You need a CV in the project first.

![Job search page (sample data)](/manual/search.en.png)
*Example screen with made-up data*

![Evaluation page](/manual/session.en.png)
*Example screen with made-up data*

![Example clip: typing a search](/manual/search.en.mp4)
*Example clip with made-up data*

## How to search for jobs and check your fit

There are 2 ways.

### Way 1 Use Smart match

1. Go to {{ui:"Job search"}}.
2. Select the {{ui:"Smart match"}} mode.
3. Select {{ui:"CV to match against"}}.
4. Set the filters you want.
5. Click {{ui:"Start Smart match"}}.
6. Wait until the agent has ranked the jobs.
7. Open a job to see the reasons and the matching and missing skills.
8. Click {{ui:"Save job"}} on the jobs you like.

### Way 2 Evaluate a job you pick

1. Go to {{ui:"Job search"}}.
2. Enter a search in {{ui:"Search title, company or skill"}}.
3. Click {{ui:"Evaluate this job"}} on the job you want.
4. The {{ui:"New session"}} window opens.
5. Select the {{ui:"CV"}} you want.
6. Click {{ui:"Start session"}}.
7. Open the {{ui:"Evaluation"}} tab to see the result.

## Good to know

- Smart match uses AI every time it runs, so it waits for you to start it.
- The content of your CV is sent to an AI service to rank the jobs.
- The score is an AI estimate to help you decide. It does not predict whether you will get the job, so check the evidence yourself.
- If you change your CV later, only new evaluations are affected.
- Each evaluation always shows which CV and job posting version it used.
- Data marked as sample data is made up. It is not a real job posting.
- You must confirm your email before you can start.

## Problems and fixes

- Problem: "This project has no CV yet"
  Fix: Click {{ui:"Go to the CV page"}} and add a CV first.
- Problem: "A session for this CV version and job already exists."
  Fix: Click {{ui:"Open existing session"}}.
- Problem: "AI ranking failed"
  Fix: Try starting Smart match again.
- Problem: "No jobs match these filters"
  Fix: Change your search, or click {{ui:"Clear filters"}}.

## Related questions

- [[cv-and-experience]]
- [[tailor-and-draft]]
- [[job-alerts]]
