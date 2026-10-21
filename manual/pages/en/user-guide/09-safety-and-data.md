---
id: safety-and-data
title: Your safety and data
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/landing/copy.ts, frontend/src/features/projects/copy.ts, frontend/src/features/builder/copy.ts, frontend/src/features/settings/GatewaySettings.tsx, frontend/src/features/chat/ApplyCard.tsx, frontend/src/locales/settings.th.json]
---
## What is safety and your data

This page explains how your data is stored and used, and what you can control. Read it before you upload a CV. There are no steps you must follow.

**Before you start**

- You are logged in (how to sign up and log in is in [[getting-started]]).
- The steps below only let you look. They do not change your data.

![Settings — circle 1 = the account security link](/manual/settings.en.png)

## How to check your data

1. Go to {{ui:"All projects"}} to see your separate projects.
2. Go to {{ui:"CV & experience"}} to check the facts the AI can use (how to add and edit them is in [[cv-and-experience]]).
3. Go to {{ui:"Settings"}}, then select {{ui:"AI gateway"}} to see the AI connection status.
4. On the {{ui:"Settings"}} page, select {{ui:"Webhooks"}} or {{ui:"Project sharing"}} in the list to check what you have turned on.

## Good to know

- What the AI does: ranks and evaluates jobs, and writes CV drafts, cover letters, interview practice questions and AI feedback. See [[search-and-evaluate]], [[tailor-and-draft]] and [[interview-practice]]. All of it is a draft for you to check. The status of an application and sending it ([[track-applications]]) are yours.
- What the AI does not do: it does not send applications for you, does not change your original CV file, and does not use facts that are not in your experience bank.
- The data of each project is kept separate. The CV, jobs and documents of one project never mix with another.
- An AI request may send the part of your CV it needs to an outside AI service, for example when it ranks or evaluates jobs.
- The AI can use only the facts in your experience bank.
- Reference contacts are never sent to the AI and are not used as evidence.
- Personal details in your CV, such as date of birth and nationality, stay hidden until you choose to show them, and they are never sent to the AI.
- The AI service key is set on the server by your administrator. There is no place to enter a key in the browser, and the {{ui:"AI gateway"}} card is read-only.
- Project sharing is off until you create a token yourself. Someone with the token cannot reach your original CV file.
- The app does not send applications for you. You send real applications yourself.
- An AI evaluation is an estimate. It does not predict whether you will get the job.
- Where data is stored on the server, how long it is kept and the security standards (to be confirmed).

## Problems and fixes

- Problem: "The AI gateway is not configured."
  Fix: Ask your administrator to set up the AI service. You cannot set it up in the browser.
- Problem: "Cannot delete: this project still has a CV, jobs or run history."
  Fix: Move the items in the project to the trash first, then delete the project again.

## Related questions

- [[getting-started]]
- [[track-applications]]
