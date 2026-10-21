---
id: job-alerts
title: Get alerts for new jobs
audience: []
book: user-guide
kind: how-to
routes: []
covers: []
sources: [frontend/src/features/search/SavedSearches.tsx, frontend/src/features/settings/TelegramSettings.tsx, frontend/src/features/settings/WebhookSettings.tsx, frontend/src/features/digest/UnsubscribePage.tsx]
---
## What is job alerts

You save a search, and the app sends you a summary of new jobs that match your filters on a schedule. Email is the main channel. You can also turn on Telegram or a webhook. You must confirm your email first.

![A saved search with its alert buttons — Circle 1 = how often, 2 = the email switch](/manual/alerts.en.png)
*Example screen with made-up data*

## How to get alerts for new jobs

1. Go to {{ui:"Job search"}}.
2. Set the filters you want.
3. Click {{ui:"Save this search"}}.
4. Enter {{ui:"Name"}}.
5. Select {{ui:"Frequency"}}: {{ui:"Daily"}} or {{ui:"Weekly"}}.
6. Click {{ui:"Save"}}.
7. Check the date of the next summary in {{ui:"Next digest"}}.

Add Telegram (optional)

1. Go to {{ui:"Settings"}}.
2. Click {{ui:"Connect Telegram"}}.
3. Open the link the app shows.
4. Press Start in the Telegram chat.
5. Wait for {{ui:"Connected"}}.
6. Go back to job search and turn on the Telegram switch for that search.

Add a webhook (optional)

1. Go to {{ui:"Settings"}}, then select {{ui:"Webhooks"}}.
2. Enter {{ui:"Endpoint URL"}}.
3. Select the event {{ui:"Digest ready"}}.
4. Click {{ui:"Add webhook"}}.
5. Copy the secret that is shown, then click {{ui:"Done, I saved it"}}.
6. Go back to job search and turn on the push switch for that search.

## Good to know

- The summary email is sent at 08:00.
- The Telegram part appears only when the server has a bot set up.
- The Telegram link expires after a while. If it does, connect again.
- A webhook URL must start with https. The secret is shown only once, so copy and keep it.
- You can save up to 10 searches per project and add up to 5 webhooks.
- If alerts are turned off for the project, you get no summaries. You can turn them on in the project settings.
- You can stop the emails from the link in the email, without logging in.
- Disconnecting Telegram turns off Telegram sending for every saved search.

## Problems and fixes

- Problem: "Verify your email to receive digests"
  Fix: Confirm your email by following the steps in [[getting-started]].
- Problem: "You can save up to 10 searches per project."
  Fix: Delete searches you no longer use.
- Problem: "A search with this name already exists."
  Fix: Enter a different name.
- Problem: "The link expired. Press Connect to get a new one."
  Fix: Click {{ui:"Connect Telegram"}} again.
- Problem: "The URL must use https and point to a public server."
  Fix: Enter an https URL that can be reached from the internet.

## Related questions

- [[search-and-evaluate]]
- [[getting-started]]
