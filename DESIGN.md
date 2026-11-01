---
name: AI Job Search Agent Platform
description: Bilingual job-search workspaces with clear project and revision context.
colors:
  background: "#F3F4EF"
  foreground: "#1B2550"
  card: "#FFFFFF"
  primary: "#2B45C4"
  primary-foreground: "#FFFFFF"
  secondary: "#E9EAE2"
  secondary-foreground: "#1B2550"
  muted: "#E9EAE2"
  muted-foreground: "#585E70"
  accent: "#E4E7F4"
  accent-foreground: "#1B2550"
  destructive: "#AF263E"
  success: "#166445"
  warning: "#805319"
  border: "#DCDDD3"
  border-strong: "#C9CBC0"
  input: "#858993"
  ring: "#2B45C4"
  sidebar: "#EAEBE3"
  stage-cv: "#0F766E"
  stage-search: "#2563EB"
  stage-evaluate: "#7C3AED"
  stage-docs: "#C2410C"
  stage-track: "#15803D"
  dark-background: "#131D42"
  dark-foreground: "#EEF2FF"
  dark-card: "#1B2756"
  dark-primary: "#9DB4FF"
  dark-primary-foreground: "#0F1738"
  dark-secondary: "#243266"
  dark-secondary-foreground: "#EEF2FF"
  dark-muted: "#243266"
  dark-muted-foreground: "#B4C0E6"
  dark-accent: "#2E3F7E"
  dark-accent-foreground: "#EEF2FF"
  dark-destructive: "#FF9AAA"
  dark-success: "#79D5AA"
  dark-warning: "#EBC27D"
  dark-border: "#34447F"
  dark-border-strong: "#46579A"
  dark-input: "#7F8FC4"
  dark-ring: "#9DB4FF"
  dark-sidebar: "#16224D"
  dark-stage-cv: "#5EEAD4"
  dark-stage-search: "#7FA8FF"
  dark-stage-evaluate: "#B79CFF"
  dark-stage-docs: "#FFA36B"
  dark-stage-track: "#6FE09A"
typography:
  display:
    fontFamily: "Noto Serif Thai, Georgia, serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.4
  headline:
    fontFamily: "Noto Serif Thai, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
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
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
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
    rounded: "{rounded.lg}"
    height: "44px (40px from lg)"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "44px (40px from lg)"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "44px (40px from lg)"
---
# Design System: AI Job Search Agent Platform

## Overview

**Creative North Star: "Quiet Ledger"**

The application is a warm paper-toned work surface with a royal-blue action colour and a navy ink. The sidebar colour doubles as the window frame; on wide screens the page sits in one rounded panel on that frame. Cards are white and flat with a hairline border. Page titles are set in a Thai serif; everything else is Noto Sans Thai. Its signature is still the readable pairing of a CV revision with a job revision: source context stays near the task that uses it. Written labels always accompany semantic status colours.

Inspired by visual character only; no code or assets from AGPL-licensed Dossier.

The system is evidenced in `frontend/src/styles.css`, shared UI primitives, and the application shell and workspace pages. This record describes visual implementation; product behavior and API contracts remain in their engineering specifications.

**Key Characteristics:**
- Warm neutral canvas, white hairline surfaces, restrained royal-blue emphasis. No black or near-black anywhere; ink is navy.
- Serif page titles, sans-serif reading with generous Thai body leading.
- Inset work panel, segmented controls, status dots, divided rows.

## Colors

The light and dark themes use semantic CSS variables so components keep the same role when the theme changes.

### Primary

Royal blue (`primary`) marks primary actions, links, and focus. `accent` marks selected surfaces and notices; the active sidebar row uses `--nav-active`, a 10% blue tint over `sidebar`. Row hover uses `--nav-hover`, a 5% navy tint. In dark mode, use the matching `dark-` values.

### Neutral

`background` is the warm page; `card` is the work surface (white); `sidebar` is both the navigation colour and the frame around the page panel. `foreground` (navy) carries reading text, `muted-foreground` secondary information, `border` panel and row separation, and `border-strong` the hairline of outline buttons and active segments. `input` is the stronger stroke inputs need for a 3:1 boundary.

### Journey stages

Each step of the search owns a hue: `stage-cv`, `stage-search`, `stage-evaluate`, `stage-docs`, `stage-track`. A page sets `--stage` on `main`; the page-title icon, the active sidebar icon and `.stage-chip` read it. `.stage-dot` marks application status beside its written label (saved and withdrawn muted, applied primary, responded evaluate, interview cv, offer warning, hired success, rejected destructive).

### Status

`success`, `warning`, and `destructive` communicate completion, pending or partial states, and errors. Status badges use a low-opacity tint and retain a written label. Dark theme status values are supplied separately.

**The Semantic State Rule.** Colour reinforces a named state; it never carries status, selection, or uncertainty alone.

## Typography

**Heading Font:** Noto Serif Thai 500 (with Georgia as load-failure fallback)  
**Body Font:** Noto Sans Thai, Manrope, sans-serif  
**Character:** Serif is for `h1` and for `h2` authored at 18px or larger (including dialog titles), always weight 500, letter-spacing 0. Markdown output (AI answers) stays sans. `h3`, body, controls and small headings (kanban column, sidebar labels) are Noto Sans Thai. `CardTitle` is authored `text-lg` (18px), so it renders serif. Manrope is the English document fallback. Prompt is no longer used.

### Hierarchy

- **Page title** (serif 500, 24px, 34px from 768px, 1.35): `PageHeader` h1.
- **Section title** (serif 500, 18–24px, 1.45): large `h2` and dialog titles. 18px is the serif floor, except the header wordmark.
- **Body** (sans 400, 16px, 1.7): default interface and form text; inputs use 16px.
- **Label** (sans 500, 14px, 1.6): buttons, navigation rows, tabs, labels.
- **Micro** (sans 500, 12px): sidebar group labels, table headers, counts.

Chat text uses 1.9 line-height; English documents use Manrope first at 16px/1.9. Headings and user-provided revision names wrap rather than widen their container.

**The Bilingual Reading Rule.** Keep Thai body leading generous (never under 1.35 for headings) and preserve the source language of jobs, CVs, and generated documents when the interface language changes.

## Layout

From the 1024px `lg` breakpoint the shell has a 248px project rail on the `sidebar` colour, and the page sits in one rounded inset panel (`background`, 1px border, 12px radius, 8px gap to the frame). Below `lg` there is no frame and a labelled mobile drawer replaces the rail. Sidebar group labels are visible; rows are plain outline icons, and the active row takes the `--nav-active` fill and its stage-hue icon. Page headers (`PageHeader`) place actions beside the title when space allows and stack below 640px. Keep flex and grid children shrinkable with `min-width: 0`; allow long names to wrap.

Use compact spacing within control groups and wider 24–40px gaps between page regions. Search pairs a result list with an inspector on wide screens. Horizontal scrolling belongs inside genuinely wide data regions.

## Elevation & Depth

Surfaces are flat: white on the warm page with a 1px hairline and almost no shadow (`shadow-sm` is a 1px navy hairline). Shadows remain only on overlays (menus, dialogs, drawer) and on the document "paper" previews, all in navy, never black. Motion is brief state feedback (150-240ms) with the shared easing curve; reduced-motion preferences collapse transitions and animations.

## Shapes

The base radius is 8px, giving sm 4, md 6, lg 8, xl 12 and 2xl 12. Controls are 8px, cards, panels and dialogs 12px, badges 6px. Pills (`rounded-full`) remain only for avatars, dots, counts and AI prompt-suggestion chips.

## Components

### Buttons

Use `components/ui/button.tsx`; `components/Button.tsx` is its compatibility adapter. Control height is 44px below `lg` and 40px from `lg`; icon buttons are square at the same size with an 8px radius. Default is solid primary; outline is a card surface with the `border-strong` hairline; ghost shows the `--nav-hover` tint. A pressed outline button shows `accent` fill plus a primary border. Preserve the visible focus ring and disabled state.

### Segmented control

`.segmented` is a muted track holding buttons or tabs; the active one (`aria-pressed="true"` or `data-state="active"`) is a `card` segment with a `border-strong` hairline. Used for view switches, mode switches, theme and language switches and `TabsList`. Settings keeps underline tabs in navy.

### Page title block

`components/PageHeader.tsx`: an outline icon in the page's stage hue, the serif title, a muted lede (16px, max 42rem) and actions on the right. Existing back links stay above it.

### Status dot and stage chip

`.stage-dot` (8px) sits beside a written status label. `.stage-chip` (36px) is the tinted stage icon tile in journey and getting-started steps; active is solid stage colour. Step indicators use a 24px circle: done is filled with a check, the current step is filled with its stage colour like a done step plus a "next" badge, upcoming steps are dimmed.

### Kanban and lists

Board columns are `muted` trays with a status dot, label and count; cards are white with a hairline above the meta row. Lists are one bordered card with divided rows and a 12px muted column header. Drop zones are dashed.

### Inputs / Forms

Use the shared Input, Select, and Textarea primitives. Inputs have a card background, stronger input border, 16px text, and a visible focus ring. Keep labels and helper or error text associated with their controls. Compact account forms remain compact; do not turn simple settings into oversized panels.

### Cards / Badges / Status

Cards use a bordered card surface with 12px radius and no shadow. Badges are 6px-radius chips with written status and semantic colour; the default badge is a 10% primary tint. Announce meaningful asynchronous updates through the existing status regions. A progress indicator must reflect an actual value.

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
- Add stage-coloured gradients, excessive nested cards, or unnecessary animation.
- Name backend services, data sources or providers in user-facing copy.
- Use serif below 18px (the 14px header wordmark is the one exception), or on Markdown output.
- Use black or near-black for any colour, shadow or button.
