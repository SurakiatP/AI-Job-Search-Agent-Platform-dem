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

**Before you start**

- Confirm your email. See [[getting-started]]. If you have not, the app shows {{ui:"Verify your email to receive digests"}}.
- Have at least one project. Saved searches are kept per project.
- Set at least one filter, such as a keyword or a city. Otherwise the {{ui:"Save this search"}} button cannot be clicked.

![A saved search with its alert switches — circle 1 = how often, 2 = the email switch](/manual/alerts.en.png)

## How to get alerts for new jobs

1. Go to {{ui:"Job search"}}.
2. Set the filters you want.
3. Click {{ui:"Save this search"}}. The {{ui:"Save search"}} window opens.
4. Enter {{ui:"Name"}}.
5. Select {{ui:"Frequency"}}: {{ui:"Daily"}} or {{ui:"Weekly"}}.
6. Click {{ui:"Save"}}. The app shows {{ui:"Search saved"}} and the search appears in {{ui:"Saved searches"}}.
7. Check the date of the next summary in {{ui:"Next digest"}} under the search name.

Add Telegram (optional)

1. Go to {{ui:"Settings"}}, then select {{ui:"Webhooks"}}. The Telegram card is on this page.
2. Click {{ui:"Connect Telegram"}}. The app shows {{ui:"Waiting for you to press Start in Telegram."}}
3. Open the link the app shows.
4. Press Start in the Telegram chat.
5. Wait for {{ui:"Connected"}}.
6. Go back to job search and make sure the Telegram icon button next to that search is on.

Add a webhook (optional)

1. Go to {{ui:"Settings"}}, then select {{ui:"Webhooks"}}.
2. Enter {{ui:"Endpoint URL"}} (required).
3. Select the event {{ui:"Digest ready"}}.
4. Click {{ui:"Add webhook"}}. The app shows the signing secret.
5. Copy the secret that is shown, then click {{ui:"Done, I saved it"}}.
6. Go back to job search and make sure the bell (push) icon button next to that search is on.

## Good to know

- The summary email is sent at 08:00. The summary is not an application and not AI advice. It is only a list of new jobs that match your filters.
- Each saved search has icon buttons: email, bell (push), Telegram, send a preview and trash. Hover over a button to see its name.
- Webhooks are for your own other systems. If you are not sure, skip them and use email only.
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
