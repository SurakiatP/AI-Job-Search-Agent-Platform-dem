# Evidence gate: no guessed form answers, no invented names

Status: owner-approved on 2026-10-10 in chat, as recommended. It covers TOR §2, which says to "never guess form answers", and FR-C02. It hardens the gates from phases 3 and 4.

## 1. No guessed boolean or choice answers (apply_prepare)

- A model-proposed answer to a `boolean` or `choice` question is never accepted as an answer. `gate_answers` keeps the proposal as `suggestion` with its `evidence_ids`, and sets `answer: null`, `reason: "needs_confirmation"`.
  - So a required boolean or choice question always makes the pack `parked` (run `needs_input`) until the owner confirms it through `/input`.
  - Owner answers stay `source: "owner"`.
  - An invalid suggestion (not a valid choice or bool) is dropped with `reason: "invalid_answer"`, as today.
- Free-text answers keep the claim gate described in §2.
- Because autopilot only auto-approves `ready` packs, it can never act on a model-chosen boolean or choice.
- UI (`ApplyCard`): the input for a `needs_confirmation` question is prefilled with the suggestion and labelled "Suggested from your facts — confirm" (Thai and English). Saving submits the owner's value through `/input`.

## 2. Names are claims (FR-C02, tailoring and answers)

`services/evidence.claims(text)` already returns numbers and dictionary skills. It now also returns `name:<lowercased>` claims from two sources:

- **(a) Latin proper names.** A Latin-script word of 2 or more letters, starting with an uppercase letter, is a name unless one of these holds:
  - it is the first word of the text, a line, a bullet, or a sentence (after `.`, `!`, `?` or `:`);
  - it is all uppercase and 4 letters or fewer, such as `AI`, `SQL` or `AWS`; dictionary skills are already covered as skills;
  - it is on a small fixed stopword list of common capitalized words, such as month names and `I`.
- **(b) Bank vocabulary.** Any `organization` or `role` value of a live bank fact in the project counts when it appears in the text. It is matched after `experience.normalize` and works for Thai as well. This needs the project's bank vocabulary, so `claims` gains an optional `vocabulary: set[str]`. `fact_claims` and the callers pass it in.

Facts' own claims include names from their text and their `role`, `organization` and `period` fields. So a cited fact "Backend developer at Acme" (organization Acme) supports adding "Acme".

The effect: an edit or answer that adds "Senior Engineer at Google" fails unless a cited fact names Google and Senior/Engineer, or the base CV already contained them. `require_evidence` and `apply_gated` both use the extended claims.

## Testing

- **Unit:**
  - The name extraction rules: sentence starts, bullets, acronyms, stopwords, and Thai vocabulary match.
  - `apply_gated` rejects an invented employer and allows one present in a cited fact or already in the base text.
  - `gate_answers` turns a model boolean or choice into a suggestion.
- **Integration:**
  - A parked pack whose required boolean was suggested by the model is completed via owner `/input` with the suggestion.
  - Autopilot does not fire before that confirmation.
  - Tailor autopilot with a scripted edit that invents an employer leaves the edit `rejected_by_gate`.
- **E2E:** the suggested value is prefilled and the confirm label appears.
- **Live smoke** (at most 4 LLM calls): one apply_prepare and one tailor autopilot. Report how many edits and answers survive.
