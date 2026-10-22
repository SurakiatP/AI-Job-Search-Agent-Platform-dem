# Product
<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual job seekers in Thailand who work with Thai and English job postings, CVs, and application documents. The primary experience is a personal job-search workspace organized into projects.

## Product Purpose

Help a person organize a job search, judge opportunities against their experience, prepare application material, and maintain an accurate application history. The primary journey is project setup → CV readiness → job discovery → evaluation → document preparation → manual submission → application tracking.

Success means that the user understands the next action, knows which CV/job revisions produced a result, can review and revise generated material, and can distinguish preparation, approval, and recorded application status.

## Positioning

The product combines project-scoped job-search work with explicit CV/job revision pairing, deterministic keyword coverage, AI-assisted evaluation and preparation, experience evidence, document history, and reviewable agent activity. These mechanisms provide traceability; they do not establish a probability of being hired or guarantee an employer's ATS outcome.

## Operating Context

- A project contains its own CVs, preferences, jobs, sessions, documents, experience facts, and agent activity.
- A user can maintain several named CVs and immutable CV revisions. An evaluation session binds a particular CV revision to a particular job revision. A newer CV does not silently replace that binding.
- UI language and generated-document language are separate choices. Existing user/job/document content keeps its own language.
- Users review agent results, provide missing answers, and resolve approval requests. Long-running operations expose persisted run status and event history.
- Users submit actual applications themselves on the employer's site or through their own chosen channel. Recording “Applied” in this platform is a tracking action.
- AI functions depend on configured providers and available integrations. Source availability, incomplete outputs, and provider failures must be communicated accurately.

## Capabilities and Constraints

Preserve these existing capabilities through frontend redesign:

- Create, select, rename, and manage projects with isolated resources and permissions.
- Maintain multiple CVs, primary-CV selection, revision upload/preview, and experience facts.
- Search/filter/save job opportunities, use deterministic and AI-assisted matching, maintain saved searches/digests, and manage hidden results.
- Evaluate CV/job pairs in sessions and retain their revision identity and result provenance.
- Generate, edit, revise, and export application documents while retaining revision history and publication state.
- Tailor a CV and prepare application answers with evidence and owner-input boundaries supplied by the current services.
- Review agent runs, approval requests, cancellation/retry/resume states, and SSE updates.
- Track all supported application stages, recruiter contact, notes, correspondence, and timeline history.
- Configure available account, gateway, tool, sharing, notification, and integration settings; retain OAuth/MCP/A2A access boundaries.

Technical and delivery constraints:

- Keep React, Vite, TypeScript, Tailwind CSS, Radix UI, and the existing feature-based frontend architecture.
- Preserve existing backend behavior and versioned API contracts. Proposed presentation changes must use supported data/actions.
- Preserve project isolation, immutable revisions, provenance, approval requirements, document history, and manual submission semantics.
- Existing deep links and working features require a migration path. Demonstration data must be visibly distinguished from actual service results.
- Credentials, personal CVs, and production data must not appear in design research artifacts, Git, or shared agent context.

## Brand Commitments

The current working product name is “AI Job Search Agent Platform.” The supplied redesign brief calls for a calm, professional, premium productivity experience with a recognizable identity. Detailed visual decisions remain proposals in the redesign plan until approved; this product record does not approve a new palette, logo, typography system, or product name.

## Evidence on Hand

- Existing application source and versioned contracts, reviewed at develop commit `c4905b9264edca82d39fc6e406152138bd8c401d`.
- Historical UI specification: `docs/superpowers/specs/2026-10-07-ui-redesign-design.md`.
- UX research and synthetic browser baselines: `docs/ux-redesign/UX_AUDIT.md` and its evidence directory.
- Product facts above were explicitly confirmed by the owner in this UX redesign conversation.
- Screenshots and evaluation records used in this review are synthetic. This review supplies no real user study, hiring-outcome evidence, provider-quality benchmark, testimonials, or complete accessibility certification.

## Product Principles

1. Keep application submission and consequential changes under the user's control.
2. Make the CV/job pair, evidence, revision history, and origin of results understandable.
3. Preserve project boundaries across the UI and external-agent access.
4. Show the next useful action and communicate missing inputs or failures honestly.
5. Retain advanced capabilities through discoverable detail while keeping the primary job-search journey clear.

## Accessibility and Inclusion

Thai and English are first-class product languages. The redesign must support readable Thai typography, keyboard access, visible focus, accessible contrast, reduced motion, light/dark themes, and responsive use on narrow and wide screens. Detailed verification targets belong in the redesign plan; these requirements are not a claim that the current application already conforms.
