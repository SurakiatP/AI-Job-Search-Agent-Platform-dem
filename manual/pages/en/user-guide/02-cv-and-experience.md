---
id: cv-and-experience
title: Add your CV and experience bank
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/profile/ProfilePage.tsx, frontend/src/features/profile/ExperienceBank.tsx, frontend/src/features/builder/BuildCvButton.tsx, frontend/src/features/builder/copy.ts, frontend/src/locales/materials-workspace.th.json, frontend/src/locales/materials-workspace.en.json, frontend/src/components/AiMark.tsx]
---
## What is adding your CV and experience bank

The experience bank holds the facts from your CV, such as jobs, education and skills. The AI uses only the facts in this bank and never adds things you do not have. So you can check and fix the facts before you go on. You can use it with any account that has a project.

Before you start, get these ready:

- A project you have already made. If you have none, see [[getting-started]].
- A CV file in PDF, DOCX or TXT format, up to 20 MB. If you have no file, build one in the app as described in [[build-cv]].

![CV and experience page — circle 1 = add a CV, 2 = the experience bank tab](/manual/profile.en.png)

![Facts the AI agent extracted from your CV, labelled “Extracted by AI” for you to check and edit — circle 1 = extract again](/manual/ai-experience.en.png)

## How to add your CV and experience bank

There are 2 ways.

### Way 1 Upload a CV file

1. Go to {{ui:"CV & experience"}}. It is in the left menu of the project.
2. Click {{ui:"Add CV"}}, or drop your file in the upload box.
3. Select a PDF, DOCX or TXT file.
4. Wait until the CV has been read. While it works, the screen shows "Uploading and reading your CV…".
5. Select the {{ui:"Experience bank"}} tab. It is on the same page.
6. Wait until {{ui:"The agent is processing: extracting experience from your CV…"}} disappears.
7. Check the facts the AI picked up.
8. If a fact is wrong, click {{ui:"Edit"}}, change it, then click {{ui:"Save"}}.
9. To add a fact yourself, enter {{ui:"Fact"}} and click {{ui:"Add fact"}}.

### Way 2 Build a CV in the app

1. Go to {{ui:"CV & experience"}}.
2. Click {{ui:"Build a CV"}}.
3. Enter {{ui:"CV name"}}.
4. Click {{ui:"Start"}}.
5. Fill in the form.
6. Select the {{ui:"Template"}} you want.
7. Click {{ui:"Preview"}} to see how it looks.
8. Click {{ui:"Save as new version"}}.

## Good to know

- The step that extracts experience uses AI. The facts it finds carry an "Extracted by AI" label, so check them before use. Facts you add yourself, and building a CV in the app, do not use AI.
- A CV file must be PDF, DOCX or TXT, and no larger than 20 MB.
- When you add a new CV, experience is extracted for you. To do it again, click {{ui:"Extract experience with AI"}}. Always check the result before you use it, because the AI can misread.
- The bank holds up to 1,000 facts.
- The templates are Onyx, Kakuna, Ditgar, Lotus, Teak and Saffron. Some two-column templates may be read in the wrong order by applicant tracking systems (ATS).
- A photo works with the Lotus, Teak and Saffron templates. It must be a JPG or PNG up to 2 MB.
- Reference contacts are never sent to the AI.
- Personal details in your CV stay hidden until you choose to show them, and they are never sent to the AI.
- If you have several CVs, open the options for a CV in the {{ui:"CV library"}} tab and click {{ui:"Make primary"}} on the one you want as the main CV. New evaluations use the main CV.

## Problems and fixes

- Problem: "Extracting facts did not finish."
  Fix: Click {{ui:"Extract experience with AI"}} again, or add the facts yourself.
- Problem: "This fact is already in the bank"
  Fix: You do not need to add it again.
- Problem: "The AI gateway is not configured."
  Fix: Ask your administrator to set up the AI service.

## Related questions

- [[build-cv]]
- [[search-and-evaluate]]
- [[tailor-and-draft]]
