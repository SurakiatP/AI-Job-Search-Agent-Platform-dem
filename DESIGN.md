---
name: AI Job Search Agent Platform
description: Bilingual job-search workspaces with clear project and revision context.
colors:
  background: "#F6F7FB"
  foreground: "#17233B"
  card: "#FFFFFF"
  primary: "#4F46E5"
  primary-foreground: "#FFFFFF"
  secondary: "#EEF1F8"
  secondary-foreground: "#17233B"
  muted: "#EEF1F8"
  muted-foreground: "#53627A"
  accent: "#E5E5FC"
  accent-foreground: "#3730A3"
  destructive: "#AF263E"
  success: "#166445"
  warning: "#805319"
  border: "#DCE1EB"
  input: "#828EA5"
  ring: "#4F46E5"
  sidebar: "#E8EBFA"
  dark-background: "#111522"
  dark-foreground: "#EDF1FA"
  dark-card: "#1A2030"
  dark-primary: "#ABA7FF"
  dark-primary-foreground: "#171B2B"
  dark-secondary: "#232B3D"
  dark-secondary-foreground: "#EDF1FA"
  dark-muted: "#232B3D"
  dark-muted-foreground: "#AEBBD0"
  dark-accent: "#303659"
  dark-accent-foreground: "#E0DFFF"
  dark-destructive: "#FF9AAA"
  dark-success: "#79D5AA"
  dark-warning: "#EBC27D"
  dark-border: "#354057"
  dark-input: "#7C8AA5"
  dark-ring: "#ABA7FF"
  dark-sidebar: "#202642"
typography:
  display:
    fontFamily: "Noto Serif Thai, serif"
    fontSize: "clamp(27px, 4vw, 42px)"
    fontWeight: 500
    lineHeight: 1.5
  headline:
    fontFamily: "Noto Sans Thai, Manrope, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Noto Sans Thai, Manrope, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Noto Sans Thai, Manrope, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.7
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "44px"
---
# Design System: AI Job Search Agent Platform

## Overview

**Creative North Star: "Collection Index"**

The shipped application uses a cool, quiet work surface with an indigo project rail and a compact information hierarchy. Its signature is the readable pairing of a CV revision with a job revision: source context stays near the task that uses it. Thai and English share the same sans-serif workhorse stack, while written labels accompany semantic status colours.

The system is evidenced in `frontend/src/styles.css`, shared UI primitives, and the application shell and workspace pages. The public landing page uses its own serif headline treatment within this system. This record describes visual implementation; product behavior and API contracts remain in their engineering specifications.

**Key Characteristics:**
- Cool neutral canvas, white work surfaces, and restrained indigo emphasis.
- Bilingual sans-serif reading with generous body leading.
- Flat bordered panels, aligned rows, and explicit revision context.

## Colors

The light and dark themes use semantic CSS variables so components keep the same role when the theme changes.

### Primary

Index indigo (`primary`) marks primary actions, links, and focus. `accent` and `accent-foreground` mark selected navigation and selected surfaces. In dark mode, use the matching `dark-` values.

### Neutral

`background` is the cool workspace canvas; `card` is the main work surface; `sidebar` distinguishes project navigation. `foreground` carries primary reading text, `muted-foreground` secondary information, and `border` panel and row separation. `input` provides a stronger control stroke than the general divider.

### Status

`success`, `warning`, and `destructive` communicate completion, pending or partial states, and errors. Status badges use a low-opacity tint and retain a written label. Dark theme status values are supplied separately.

**The Semantic State Rule.** Colour reinforces a named state; it never carries status, selection, or uncertainty alone.

## Typography

**Display Font:** Noto Serif Thai, serif (used by the public landing headline)  
**Body Font:** Noto Sans Thai, Manrope, sans-serif  
**Character:** Noto Sans Thai leads for both Thai and Latin interface text. The bundled 400, 500, and 600 weights cover body, medium labels, and semibold headings. Manrope is the English document fallback; Noto Serif Thai is reserved for the landing headline.

### Hierarchy

- **Display** (500, responsive 27–42px, 1.5): public landing headline.
- **Headline** (600, 24px; 28px from 768px, 1.45): global page `h1`.
- **Title** (600, commonly 18–20px): section and panel headings as used by pages.
- **Body** (400, 16px, 1.7): default interface and form text.
- **Label** (500, commonly 12–14px): controls, navigation, and compact metadata.

Chat text uses 1.9 line-height; English documents use Manrope first at 16px/1.9. Explicit component utilities can override these defaults. Inputs use 16px text. Headings and user-provided revision names can wrap rather than widen their container.

**The Bilingual Reading Rule.** Keep Thai body leading generous and preserve the source language of jobs, CVs, and generated documents when the interface language changes.

## Layout

The desktop shell uses a 248px project rail from the 1024px `lg` breakpoint; narrower layouts use the labelled mobile drawer. Page headers place actions beside the heading when space allows and stack below 640px. Workspace pages use 16px narrow-screen gutters, growing to 24px and 40px at wider breakpoints. Keep flex and grid children shrinkable with `min-width: 0`; allow long names and identifiers to wrap.

Use compact spacing within control groups and wider 24–40px gaps between page regions. Search pairs a result list with an inspector on wide screens and becomes a single detail flow on narrow screens. Keep the selected CV/job revision pair and current task close together. Horizontal scrolling belongs inside genuinely wide data regions, not around the full page.

## Elevation & Depth

Work surfaces are primarily flat, separated by borders rather than decorative shadows. Dialogs use their existing overlay treatment to focus a decision. The stylesheet retains a subtle legacy shadow token; it is not a general card treatment. Motion is brief state feedback (150–240ms) with the shared easing curve, and reduced-motion preferences collapse transitions and animations.

## Shapes

The shared radius base is 12px. Controls use the medium radius (10px); shared workspace panels use 12px; cards use the extra-large radius (16px). Use these component roles without wrapping every section in a card. Badges and some selected navigation may use component-specific rounding.

## Components

### Buttons

Use `components/ui/button.tsx`; `components/Button.tsx` is its compatibility adapter. The default and large sizes are at least 44px tall, icon buttons are 44px square, and small buttons retain a 40px minimum. Primary buttons use the primary pair; outline buttons use the card surface and input border; ghost buttons gain the selected surface on interaction. Preserve the visible focus ring and disabled state.

### Inputs / Forms

Use the shared Input, Select, and Textarea primitives. Inputs have a card background, stronger input border, 16px text, and a visible focus ring. Keep labels and helper or error text associated with their controls. Compact account forms remain compact; do not turn simple settings into oversized panels.

### Cards / Badges / Status

Cards use a bordered card surface. Badges carry short written status and semantic colour. Announce meaningful asynchronous updates through the existing status regions. A progress indicator must reflect an actual value.

### Working and waiting states

When the system is working, say so with the shared pieces: `Spinner` (turning ring), `BusyNote` (ring, what is happening, the wait so far measured in the browser, optional moving bar for jobs without a percentage), `Button busy` (ring before the label, no double press) and queued/running `StatusBadge` (ring inside the badge). Never show an estimate of time left unless the API supplies one. Reduced motion stills the ring and bar; the words and wait time remain. A moving bar is for jobs that report no percentage; use `Progress` only for a real value.

### AI output is always labelled

Every piece of content the AI produced or extracted carries `AiLabel` (`components/AiMark.tsx`): a sparkle plus the words "สร้างโดย AI" / "Made by AI", or "ดึงโดย AI" / "Extracted by AI" for facts pulled from a CV. Text the user sends on (documents, application answers, tailored CVs) adds "ตรวจก่อนใช้" / "Check before use". Never label numbers the platform computes itself, such as keyword coverage, and never rely on the icon alone. Owner rule, 2026-10-20.

### Plain terms for ordinary users

User-facing copy follows `docs/glossary.md`. It does not name internal infrastructure, protocols, data sources or providers (gateway, LiteLLM, OpenRouter, MCP, A2A, REST, LLM, server). Operator-only settings (AI gateway, document tools) appear only for accounts listed in `ADMIN_EMAILS`; everyone else is told to contact the administrator. The Connect tab keeps MCP/A2A wording because connecting an outside assistant is a user feature.

### Navigation / Revision Context

Keep task destinations grouped under the active project, with the project switcher naming the current context. Show the named CV revision alongside the selected job revision. A newer CV must not silently replace a session's bound revision. Fit scores retain their 1–5 denominator; keyword coverage and AI estimates retain their qualification and source context.

## Do's Don'ts

### Do:
- Reuse the semantic tokens and shared UI primitives.
- Keep the selected project, exact revision pair, and next action readable.
- Preserve written status labels and existing focus and reduced-motion behavior.
- Check Thai and English, light and dark themes, and narrow layouts.
- Show working and waiting states with `Spinner`, `BusyNote` and `Button busy`, and say what is being waited for.

### Don't:
- Invent scores, progress, freshness, or delivery confirmations.
- Replace the next action with decorative KPI cards.
- Add gradients, excessive nested cards, or unnecessary animation.
- Name backend services, data sources or providers in user-facing copy.
- Treat the landing page's serif headline as the workspace heading font.
