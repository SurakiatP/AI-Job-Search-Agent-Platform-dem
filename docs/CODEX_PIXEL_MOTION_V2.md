# Pixel art and motion — round2 concept contract

Date: 2026-10-17. **Specification only. PNGs are static; no animation code or animated asset has been implemented.**

## Purpose and art direction

Use small, deliberate moments to make onboarding and agent activity welcoming while preserving focus on real decisions. Indigo two-tone pixel compass/document/folder accents may appear on01,04,07,10,12,13,14. Keep them24–32px (maximum40px on roomy first-run guidance), crisp and simple; one consistent family, not different cartoon mascots per page. Main navigation and controls retain existing outline icons.

Pixel art is decorative with no status, identity, readiness, approval or success meaning. It is not clickable, focusable or announced. It must not cover information or occupy the space needed for forms/actions. Do not add pixel art to authentication, consent, account security/deletion or unsubscribe decisions. Do not invent an interactive companion feature.

The concepts visibly explore a pixel compass on01/10; some other generated glyphs remain outline placeholders. They are not a delivered sprite sheet or reusable animated asset. Use one approved24–32px family later, with an8px/16px logical pixel grid, integer scaling and crisp nearest-neighbor rendering where appropriate. Do not copy a large or inconsistent generated glyph literally. The proposed accents on04/07/12/13/14 are optional presentation directions, not a claim that finished pixel assets are supplied.

## Motion rules for Claude Code

| Context | Motion proposal | Driver and limits |
|---|---|---|
| Onboarding decoration | Optional two-frame greeting,400–600ms once | First visit only; static on reduced motion; never loops |
| Small action/selection |120–180ms background/opacity | User input; do not move targets or relabel focus |
| Panel disclosure |160–200ms opacity/short height transition | Respect focus and scroll; no layout jump above the user's reading position |
| Actual status update |150–220ms crossfade | Real API/SSE result; announce meaningful changes accessibly |
| Workflow completion |180–220ms check/connector transition | One transition per actual event; reconnect deduplicated |
| Running accent | Optional two discrete frames, at most two short cycles then static | Only actual running; not waiting/queued/completed; no continuous pulse |
| Verification success | Modest180–220ms check reveal | Only after real success; no confetti, automatic redirect or fake timer |
| Sensitive decisions | Prefer static controls and honest pending text | No animated urgency, automatic ticking, gamified deletion or celebratory unsubscribe |

Per-page versioned handoffs specify the exact applicable subset. Duration is a proposal, not permission to change event order. Waiting for approval is always static and explicitly human action; the decorative glyph does not imply an agent is still working. Status explanations use text, not color or animation alone.

## Accessibility, performance and lifecycle

- `prefers-reduced-motion` removes decorative movement and reduces transitions to instant/nonmoving feedback. Do not flash, shimmer endlessly, parallax or autoplay long demos.
- Pause decorative motion on hidden tabs and stop after its bounded sequence. Reconnect must not replay old success/approval animations or duplicate announcements.
- Keep controls stationary and keyboard reachable. Preserve modal focus trap/restore and announce true status changes without moving focus unexpectedly.
- Prefer existing CSS/transitions or a tiny asset sequence; this document does not require a new animation library. Avoid continuously running timers, canvas loops or heavyweight Lottie/video for these accents.
- Treat pixel assets as presentation, not synthetic user data. Never embed real CV content, tokens, email addresses or secret values in decorative assets.

## Acceptance after actual implementation

Inspect at1x/2x pixel density and200% zoom, mobile/tablet/desktop, Thai/English and light/dark. Test reduced motion, hidden-tab resume, SSE reconnect, waiting/expired/consumed approvals and keyboard focus. Verify no fake progress and no continuous background animation. These are future gates; the image round has not run them.
