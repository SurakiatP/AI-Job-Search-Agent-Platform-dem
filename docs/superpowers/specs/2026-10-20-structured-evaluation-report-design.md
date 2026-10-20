# Structured evaluation report — CR-EVR-01

Status: owner approved 2026-10-20 (Q-EVR-01 answered: importance orders rows; only `critical` gets a label). Owner chose option B on 2026-10-20: the AI returns named fields; the page shows them as sections.

## The why

The owner (job seeker) opens an evaluation and gets one long Markdown report whose headings change from run to run, repeat the score shown above it, and are written for a recruiter ("ประเมินผู้สมัคร", "จุดที่ต้องเก็บเพิ่มในสัมภาษณ์"). They need to see at a glance: should I apply, which job requirements I meet, what to fix in my CV, and what to prepare for the interview.

## Functional requirements

- **FR-EVR-01** When an evaluation run completes, the system must store the report as named fields: `verdict` (one line), `summary`, `requirements` (each: `requirement`, `importance`, `match`, `evidence`), `strengths`, `risks`, `interview_prep`, `cv_changes`.
- **FR-EVR-02** `importance` must be one of `critical`, `high`, `meaningful`, `preferred`, `low_signal`; `match` must be one of `strong`, `partial`, `missing`, `not_applicable`. These are the bands Career Ops Block B already uses, so the AI gets no new vocabulary.
- **FR-EVR-03** The system must still produce `report_markdown`, built by the server from the fields, so MCP, A2A, the artifact download and the copy button keep working unchanged.
- **FR-EVR-04** If the AI returns the old shape (`report_markdown` only), the system must accept it and show it as today; no run fails because of this change.
- **FR-EVR-05** The evaluation result screen must show, in order: score with verdict and skills found; job requirements with a count per match state and a filter; strengths and risks; interview preparation; CV changes with a link to the existing "ปรับ CV" step; the full report collapsed with its copy button. The score is not repeated inside the report.
- **FR-EVR-06** The AI must be told to write to the job seeker in the output language ("คุณ…"), not about a candidate.
- **FR-EVR-07** A report stored before this change must keep showing as Markdown.

## Acceptance criteria

- [ ] **AC-EVR-01** `P0` · FR-EVR-01, 03 — Given the AI returns valid fields, when the run completes, then `evaluation_result.report` holds them and `report_markdown` contains the verdict and every requirement text.
- [ ] **AC-EVR-02** `P0` · FR-EVR-04 — Given the AI returns `{report_markdown, score}`, when the run completes, then it completes with `report` null and the same Markdown.
- [ ] **AC-EVR-03** `P0` · FR-EVR-02 — Given a requirement with `match: "maybe"` or more than 30 requirements, when parsed, then the run fails with `native_response_invalid` (same as any other invalid AI output today).
- [ ] **AC-EVR-04** `P1` · FR-EVR-05 — Given a structured report with 3 strong, 2 partial, 1 missing, when the owner opens the session, then the page shows "ตรง 3 · บางส่วน 2 · ยังไม่พบ 1", each requirement row has its written status label, and choosing "ยังไม่พบ" leaves 1 row.
- [ ] **AC-EVR-05** `P1` · FR-EVR-07 — Given an old run with Markdown only, when opened, then the report shows as Markdown, as today.
- [ ] **AC-EVR-06** `P1` · FR-EVR-03 — Given a structured report, when read through MCP `job-search://runs/{id}/evaluation` and A2A `GetTask`, then the text equals `report_markdown`.

## Data contract (additive)

```
EvaluationResult
  report_markdown: str (required, unchanged)
  score: 1–5 | null (unchanged)
  skill_coverage: SkillCoverage | null (unchanged, still computed by the platform)
  report: EvaluationReport | null   ← new, optional
EvaluationReport
  verdict: str ≤ 200
  summary: str ≤ 2000
  requirements: ≤ 30 × { requirement ≤ 300, importance enum, match enum, evidence ≤ 1000 }
  strengths, risks, interview_prep, cv_changes: ≤ 10 × str ≤ 500 each
```

Limits are estimates (A-EVR-01): Career Ops Block B already caps the table at 12–30 rows; other lists are sized to fit one screen each.

## Impact analysis

| Layer | Impact | Change |
|---|---|---|
| AI instruction (`executor._prompt`, evaluate_job) | Changes | Ask for `{score, report:{…}}` JSON; write to the job seeker. Career Ops files unchanged. |
| AI output parser (`parse_evaluation_result`) | Changes | Accept new shape or old shape; build Markdown from fields. |
| DTO `EvaluationResult` | Additive | New optional `report`. |
| DB `runs.evaluation_result` (JSON column) | None (checked: column is untyped JSON) | No migration. Old rows have no `report` key → null. |
| REST `GET runs`, OpenAPI `application-api.yaml` | Additive | Document `report`; existing clients ignore it. |
| MCP evaluation resource, A2A artifacts and blocking text | None (checked: they read only `report_markdown`) | Contract docs unchanged. |
| Webhooks / digests | None (checked: no reader of `evaluation_result` outside the files above) | — |
| Frontend `RunResults.tsx` (session page) | Changes | New structured view; Markdown fallback. |
| Frontend `JobsPage.tsx` evaluation preview | None in this CR | Keeps Markdown; can adopt the view later. |
| Records created under the old rule | Shown as today (FR-EVR-07) | No back-fill; re-run the evaluation to get the new view. |
| Tests | Changes | New unit tests for parser and Markdown builder; update `test_evaluation_contract.py`; e2e for the session page; regression: `test_mcp.py`, `test_a2a*.py`, `test_worker_lifecycle.py`, `session-workspace.spec.ts`, `full-journey.spec.ts`. |

## Assumptions and questions

- **A-EVR-01** List limits above; QA/owner may change them.
- **A-EVR-02** Current AI models return this JSON reliably; an invalid reply fails the run exactly like today (no new failure mode), and the owner can retry.
- **Q-EVR-01** (owner) Show `importance` on each row as a small label ("สำคัญมาก", "สำคัญ", …) or only use it for order? Recommended: order only, label just for `critical`.
