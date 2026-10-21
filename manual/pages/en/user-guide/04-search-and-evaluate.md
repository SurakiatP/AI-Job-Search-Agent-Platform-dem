---
id: search-and-evaluate
title: Search for jobs and check your fit
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/search/SearchPage.tsx, frontend/src/features/search/SmartMatchStart.tsx, frontend/src/features/sessions/NewSessionDialog.tsx, frontend/src/locales/session-workspace.th.json, frontend/src/components/AiMark.tsx, frontend/src/locales/search-workspace.en.json, frontend/src/locales/session-workspace.en.json]
---
## What is searching and evaluating jobs

You can search for jobs in Thailand on this page. Smart match lets the agent read your chosen CV and put the jobs that fit you first, with a score out of 5 and what is still missing. An evaluation compares one CV with one job posting. You need a CV in the project first.

Before you start, get these ready:

- At least one CV in the project. See [[cv-and-experience]] or [[build-cv]].
- A confirmed email address. See [[getting-started]]. Ranking and evaluation use AI, so they cannot start until you confirm your email.
- You do not need to save a job first. You can pick one straight from the search page.

![Job search (sample data) — circle 1 = switch to Smart match, 2 = the search box](/manual/search.en.png)

![What the AI agent returns: a 1–5 score, a verdict and each job requirement matched against your CV — circle 1 = the verdict](/manual/ai-evaluation.en.png)

![Video: search, pick a job and let the agent evaluate it](/manual/search.en.mp4)

![Video: reading the AI agent’s job evaluation](/manual/evaluate.en.mp4)

## How to search for jobs and check your fit

There are 2 ways.

### Way 1 Use Smart match

1. Go to {{ui:"Job search"}}. It is in the left menu of the project.
2. Select the {{ui:"Smart match"}} mode.
3. Select {{ui:"CV to match against"}}.
4. Set the filters you want.
5. Click {{ui:"Start Smart match"}}.
6. Wait until the agent has ranked the jobs. While it works, the screen shows "Reading your CV" and "Shortlisting jobs".
7. Open a job to see the reasons and the matching and missing skills.
8. Click {{ui:"Save job"}} on the jobs you like.

### Way 2 Evaluate a job you pick

1. Go to {{ui:"Job search"}}.
2. Enter a search in {{ui:"Search title, company or skill"}}.
3. Click {{ui:"Evaluate this job"}} on the job you want.
4. The {{ui:"New session"}} window opens.
5. Select the {{ui:"CV"}} you want.
6. Click {{ui:"Start session"}}.
7. Open the {{ui:"Evaluation"}} tab to see the result. The screen shows the heading "Evaluation result" with an "AI fit" label.

## Good to know

- Smart match uses AI every time it runs, so it waits for you to start it.
- Smart match ranking and the evaluation use AI, and the evaluation carries a "Made by AI" label. The skills found in your CV are matched by keywords from the posting, with no AI. If AI ranking is not finished, the system shows a keyword ranking first.
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
