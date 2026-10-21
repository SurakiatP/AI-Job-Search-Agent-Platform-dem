---
id: build-cv
title: Build a CV in the app
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/builder/BuilderPage.tsx, frontend/src/features/builder/BuildCvButton.tsx, frontend/src/features/builder/copy.ts, frontend/src/features/builder/sections.ts, frontend/src/features/profile/ProfilePage.tsx, frontend/src/features/overview/GettingStarted.tsx, tests/e2e/cv-builder.spec.ts]
---
## What is building a CV in the app

If you do not have a CV file yet, you can make one in the app. You fill in a form, pick a template and see the real PDF on the right while you edit. The draft is saved for you each time you stop typing, so you do not need to save along the way.

The details you type on this page are not written by the AI, and the AI does not add facts to your CV. You can use it with any account that has a project.

The {{ui:"Build a CV"}} button appears in several places: the {{ui:"CV & experience"}} page, the project overview, and pages that need a CV first, such as job search when you have no CV yet. It opens the same page wherever you click it.

Before you start, get these ready:

- A project you have already made. If you have none, see [[getting-started]].
- The details to put in the CV, such as your name, experience and education. You do not need a CV file.
- A photo (optional) as a JPG or PNG up to 2 MB. It works with some templates only.

![The dialog that names a new CV — circle 1 = the Start button](/manual/build-start.en.png)

![The CV builder: details on the left, preview on the right — circle 1 = full name, 2 = Update preview](/manual/build-editor.en.png)

![Choose a template, accent colour and CV language — circle 1 = the Lotus template, 2 = CV language](/manual/build-template.en.png)

![All six templates, rendered by the app itself: Onyx, Kakuna, Ditgar, Lotus, Teak and Saffron (“Photo” = can show a photo, “Two columns” = some applicant tracking systems may misread the order)](/manual/build-gallery.en.png)

![Video: build a CV, from naming it and filling it in to trying three templates with live preview and saving](/manual/build.en.mp4)

## How to build a CV in the app

1. Go to {{ui:"CV & experience"}}. It is in the left menu of the project.
2. Click {{ui:"Build a CV"}}. The system shows a window where you name the CV.
3. Enter {{ui:"CV name"}} (optional).
4. Select {{ui:"Start from my experience bank (if any)"}} to fill in what you already have.
5. Click {{ui:"Start"}}.
6. The system shows the {{ui:"Build a CV"}} page with the form and preview.
7. In {{ui:"Contact details"}}, enter {{ui:"Full name"}}.
8. Enter {{ui:"Headline"}} (optional).
9. Enter {{ui:"Email"}} and {{ui:"Phone"}} (optional).
10. Enter {{ui:"Province"}} and any other address fields you want (optional).
11. Open {{ui:"Summary"}} and enter a short summary.
12. Open {{ui:"Experience"}} and click {{ui:"Add experience"}}.
13. Enter {{ui:"Position"}} and {{ui:"Company"}}.
14. Enter {{ui:"Start"}} and {{ui:"End"}}, or select {{ui:"I work here now"}}.
15. Enter {{ui:"Details (one per line)"}}.
16. Open {{ui:"Education"}} and click {{ui:"Add education"}}.
17. Enter {{ui:"Institution"}}, {{ui:"Degree"}} and {{ui:"Field of study"}}.
18. Open {{ui:"Skills"}} and click {{ui:"Add skills"}}.
19. Enter {{ui:"Skill"}} and select {{ui:"Level (optional)"}} (optional).
20. To leave a section out, click its eye button (Hide … from the CV).
21. To change the order, click the up or down arrow on that section.
22. Select the {{ui:"Template"}} and {{ui:"Accent colour"}} you want.

23. Check the preview on the right. On a phone, select the {{ui:"Preview"}} tab.
24. Wait until {{ui:"Saved"}} appears.
25. Click {{ui:"Save as new version"}}.
26. The system shows the {{ui:"Save as a new version?"}} window. Click {{ui:"Save as new version"}} again.
27. The system shows that CV version 1 is saved. Click {{ui:"Open"}} to go back to the CV.

### Personal details (optional)

1. Open {{ui:"Personal details"}}.
2. Enter the fields you want, such as {{ui:"Nationality"}} or {{ui:"Expected salary"}}.
3. Click the eye button on that section (Show personal details in the CV).

## Good to know

- This page does not use AI. Everything in the form comes from what you type or from your experience bank. To have AI adapt a CV to a job, see [[tailor-and-draft]].
- If you start from the experience bank, the system fills the form with what it already has. You can change every field.
- You can rename the CV later under the page title. Press Enter to save or Esc to cancel.
- To write several points in {{ui:"Details (one per line)"}}, start a new line for each point.
- A hidden section does not appear in the CV, but its data stays and you can show it again with the same eye button.
- The templates are Onyx, Kakuna, Ditgar, Lotus, Teak and Saffron. Some applicant tracking systems (ATS) read the two-column templates (Ditgar and Teak) in the wrong order. For online applications, Onyx, Kakuna, Lotus or Saffron is safer.
- A photo works with the Lotus, Teak and Saffron templates. It must be a JPG or PNG up to 2 MB.
- The CV shows only district and province. To show the full address, select {{ui:"Show the full address on the CV"}}.
- Personal details stay hidden from the CV until you show them, and they are never sent to the AI. Foreign employers and ATS often do not want them.
- References are other people's details and are never sent to the AI.
- Most CVs are 1–2 pages. If yours is longer, the system suggests dropping older unrelated jobs.
- When you save a new version, its entries are added to your experience bank, and the CV can be used for evaluations and tailoring at once.

## Problems and fixes

- Problem: "Add your name and at least one section before saving."
  Fix: Enter {{ui:"Full name"}} and fill in at least one section, then save again.
- Problem: "Saving failed. What you typed is kept in this browser for now; try again when you are back online."
  Fix: Check your internet connection, then click {{ui:"Try again"}}. If you closed the page, open it again and click {{ui:"Restore"}}.
- Problem: "Changed elsewhere"
  Fix: Click {{ui:"Load latest draft"}} before you continue.
- Problem: "The preview could not be made. Your data is safe; try again."
  Fix: Click {{ui:"Update preview"}} again.
- Problem: "Could not create it. Try again."
  Fix: Click {{ui:"Start"}} again.

## Related questions

- [[cv-and-experience]]
- [[search-and-evaluate]]
- [[tailor-and-draft]]
