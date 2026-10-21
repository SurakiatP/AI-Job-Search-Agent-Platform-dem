---
id: interview-practice
title: Practice for interviews
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/practice/copy.ts, frontend/src/features/practice/PracticeTab.tsx, frontend/src/features/practice/PracticeSetPage.tsx, frontend/src/features/practice/Flashcards.tsx, frontend/src/features/practice/Feedback.tsx]
---
## What is interview practice

The app writes a set of practice questions from the evaluation of one job. The questions are based on your CV, your experience bank and that job posting. You can type your answers, review what you know with flashcards, and ask the AI for feedback. 
**Before you start**

- You need an evaluation of the job first. See [[search-and-evaluate]]. An evaluation needs a CV you have added. See [[cv-and-experience]].
- Have some experience in your bank, so the app can write example answers.

![Interview practice tab on an evaluation — circle 1 = the new practice set button](/manual/practice-tab.en.png)

![A practice set — circle 1 = where you type, 2 = the save button](/manual/practice-set.en.png)

![AI feedback on a practice answer: five scores, your answer split by STAR and what to add — circle 1 = the AI feedback heading](/manual/ai-feedback.en.png)

![Video: type an answer, ask for AI feedback and read it](/manual/practice.en.mp4)

## How to practice for interviews

1. Go to {{ui:"Evaluations"}} in the left menu, then open the evaluation of the job you want.
2. Open the {{ui:"Interview practice"}} tab.
3. Click {{ui:"New practice set"}}. The {{ui:"New practice set"}} window opens.
4. Enter {{ui:"Name"}}.
5. Select {{ui:"Level"}}.
6. Select {{ui:"Question language"}}: {{ui:"ไทย"}} or {{ui:"English"}}.
7. Choose the sections to practice and how many questions for each.
8. Click {{ui:"Create set"}}.
9. Wait while the questions are written. The screen shows {{ui:"Writing questions for this job"}}.
10. Open the practice set and select a question.
11. Type {{ui:"Your answer"}}.
12. Click {{ui:"Save answer"}}. Your answer appears under {{ui:"Saved answers"}}.
13. Click {{ui:"Get AI feedback"}}. This button shows after you save an answer.
14. Read the report under {{ui:"AI feedback"}}.
15. Select {{ui:"Technical knowledge"}} in the list of rounds, then flip a flashcard to see the answer.
16. Click {{ui:"Know it"}} or {{ui:"Still learning"}}.
17. Select {{ui:"Summary and plan"}} in the list of rounds, then click {{ui:"Write my summary"}}.

## Good to know

- The question language can differ from the app language. The whole set, questions and advice, uses the language you pick.
- A set has at most 30 questions, and you can make up to 20 sets per session.
- Creating a set uses 1 practice run out of 60 each day.
- It takes about a minute to create a set. The page updates by itself.
- Sample answers use only your own facts. If your bank does not have enough, the app does not write them.
- AI feedback looks at story, fit to the job, evidence and clarity, with a score out of 5. It does not predict whether you will get the job.
- The AI writes the questions, example answers, feedback and summary. Your answers, and your choices of {{ui:"Know it"}} or {{ui:"Mark ready"}}, are your own. Read and judge them before you use them.
- To flip a flashcard, click it or press Space. On a phone, tap it.

## Problems and fixes

- Problem: "The questions could not be written"
  Fix: Click {{ui:"Try again"}}.
- Problem: "Today's practice runs are used up. Try again tomorrow."
  Fix: Wait until the next day, then create a new set.
- Problem: "Feedback did not come through."
  Fix: Click {{ui:"Try again"}}.
- Problem: "More than 30 questions. Lower some sections first."
  Fix: Lower the number of questions in some sections.

## Related questions

- [[search-and-evaluate]]
- [[track-applications]]
