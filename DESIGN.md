---
name: AI Job Search Agent Platform
description: Bilingual job-search workspaces with clear project and revision context.
colors:
  background: "#F3F4EF"
  foreground: "#0F3B38"
  card: "#FFFFFF"
  primary: "#287A74"
  primary-foreground: "#FFFFFF"
  secondary: "#E9EAE2"
  secondary-foreground: "#0F3B38"
  muted: "#E9EAE2"
  muted-foreground: "#585E70"
  accent: "#E8F7F2"
  accent-foreground: "#0F3B38"
  destructive: "#AF263E"
  success: "#166445"
  warning: "#805319"
  border: "#DCDDD3"
  border-strong: "#C9CBC0"
  input: "#858993"
  ring: "#287A74"
  sidebar: "#EAEBE3"
  surface-tint: "#EDEEE6"
  stage-cv: "#287A74"
  stage-search: "#287A74"
  stage-evaluate: "#287A74"
  stage-docs: "#287A74"
  stage-track: "#287A74"
  dark-background: "#151F1E"
  dark-foreground: "#D9E4E1"
  dark-card: "#212F2E"
  dark-primary: "#86C9BF"
  dark-primary-foreground: "#10231F"
  dark-secondary: "#253533"
  dark-secondary-foreground: "#D9E4E1"
  dark-muted: "#253533"
  dark-muted-foreground: "#9CB0AC"
  dark-accent: "#233B38"
  dark-accent-foreground: "#D9E4E1"
  dark-destructive: "#FF9AAA"
  dark-success: "#79D5AA"
  dark-warning: "#EBC27D"
  dark-border: "#364A48"
  dark-border-strong: "#4A6563"
  dark-input: "#6E8582"
  dark-ring: "#86C9BF"
  dark-sidebar: "#111A19"
  dark-surface-tint: "#192524"
  dark-stage-cv: "#86C9BF"
  dark-stage-search: "#86C9BF"
  dark-stage-evaluate: "#86C9BF"
  dark-stage-docs: "#86C9BF"
  dark-stage-track: "#86C9BF"
typography:
  display:
    fontFamily: "Noto Serif Thai, Georgia, serif"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.4
  headline:
    fontFamily: "Noto Serif Thai, Georgia, serif"
    fontSize: "20px"
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
  stack-tight: "4px"
  stack: "8px"
  section: "12px"
  group: "16px"
  card: "20px (24px from 640px)"
  region: "24px (32px from 1024px)"
  landing-section: "64-96px"
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

Teal is action and AI. The page is a warm neutral ground with white hairline cards framed by a tinted sidebar; dark mode is a soft grey-green ground (low saturation, text 11:1 not 14:1, to avoid glare). Page titles are Thai serif, everything else Noto Sans Thai. Its signature is the pairing of CV revision and job revision: source context stays near the task that uses it. Written labels always accompany semantic status colours.

Inspired by visual character only; no code or assets from AGPL-licensed Dossier.

The system is evidenced in `frontend/src/styles.css`, shared UI primitives, and the application shell and workspace pages. This record describes visual implementation; product behavior and API contracts remain in their engineering specifications.

**Key Characteristics:**
- Warm neutral canvas, white hairline surfaces, restrained teal emphasis. No black or near-black anywhere; ink is deep teal (`#0F3B38`).
- Serif page titles, sans-serif reading with generous Thai body leading.
- Inset work panel, segmented controls, status dots, divided rows.

## Colors

The light and dark themes use semantic CSS variables so components keep the same role when the theme changes.

### Primary

Teal (`primary`, `#287A74`) marks primary actions, links, and focus. `accent` marks selected surfaces and notices; the active sidebar row uses `--nav-active`, an 8% primary tint (16% in dark, Material UI selected opacity) over `sidebar`. Row hover uses `--nav-hover`, a 5% navy tint. In dark mode, use the matching `dark-` values.

### AI analysis

- AI analysis surfaces (AI labels, fit score, evidence panel, Smart match start, evaluation verdict, AI-drafted document label) use the `ai*` tokens. In this palette they alias the primary family (`ai` = `primary`, `ai-soft` = `accent`, `ai-border` = `border-strong`), so the AI parts look like the rest of the brand but can be given their own hue later by changing the aliases in one place.
- Never use `ai` for statuses, links, nav or focus.
- Stage hues appear only as icons, dots and chips.
- `surface-tint` is for full-bleed alternating bands only, never cards.

### Neutral

`background` is the warm page; `card` is the work surface (white); `sidebar` is both the navigation colour and the frame around the page panel. `foreground` (deep teal) carries reading text, `muted-foreground` secondary information, `border` panel and row separation, and `border-strong` the hairline of outline buttons and active segments. `input` is the stronger stroke inputs need for a 3:1 boundary.

### One surface, no frames

Tone steps replace nested hairline boxes. There is no dark or coloured panel wrapped around content: search, hero demos and auth side panels sit on the page ground as plain `card` or `muted` surfaces. A card may have one 1px border; nothing inside it gets another bordered box. Inner tiles use `bg-muted`, lists use `divide-y`, and a selected row uses the accent fill with a 3px inset primary bar.

### Journey stages

Each step of the search owns a hue: `stage-cv`, `stage-search`, `stage-evaluate`, `stage-docs`, `stage-track`. A page sets `--stage` on `main`; the page-title icon, the active sidebar icon and `.stage-chip` read it. `.stage-dot` marks application status beside its written label (saved and withdrawn muted, applied primary, responded evaluate, interview cv, offer warning, hired success, rejected destructive).

### Status

`success`, `warning`, and `destructive` communicate completion, pending or partial states, and errors. Status badges use a low-opacity tint and retain a written label. Dark theme status values are supplied separately.

**The Semantic State Rule.** Colour reinforces a named state; it never carries status, selection, or uncertainty alone.

## Typography

**Heading Font:** Noto Serif Thai 500 (with Georgia as load-failure fallback)  
**Body Font:** Noto Sans Thai, Manrope, sans-serif  
**Character:** Serif is for `h1` and for `h2` authored at 20px or larger (including dialog titles), always weight 500, letter-spacing 0. Markdown output (AI answers) stays sans. `h3`, body, controls and small headings (kanban column, sidebar labels) are Noto Sans Thai. `CardTitle` is authored `text-lg`, which `styles.css` sets to 20px, so it renders serif. Manrope is the English document fallback. Prompt is no longer used.

### Hierarchy

- **Page title** (serif 500, 30px, 36px from 768px, 1.35; the largest text in the app): `PageHeader` h1.
- **Section title** (serif 500, 20px, 1.45): card and dialog `h2`. 20px is the serif floor, except the header wordmark.
- **Body** (sans 400, 16px, 1.7): default interface and form text; inputs use 16px.
- **Label** (sans 500, 14px, 1.6): buttons, navigation rows, tabs, labels.
- **Micro** (sans 500, 12px): sidebar group labels, table headers, counts.

Chat text uses 1.9 line-height; English documents use Manrope first at 16px/1.9. Headings and user-provided revision names wrap rather than widen their container.

**The Bilingual Reading Rule.** Keep Thai body leading generous (never under 1.35 for headings) and preserve the source language of jobs, CVs, and generated documents when the interface language changes.

## Layout

From the 1024px `lg` breakpoint the shell has a 248px project rail on the `sidebar` colour, and the page sits in one rounded inset panel (`background`, 1px border, 12px radius, 8px gap to the frame). Below `lg` there is no frame and a labelled mobile drawer replaces the rail. Sidebar group labels are visible; rows are plain outline icons, and the active row takes the `--nav-active` fill and its stage-hue icon. Page headers (`PageHeader`) place actions beside the title when space allows and stack below 640px. Keep flex and grid children shrinkable with `min-width: 0`; allow long names to wrap.

Use compact spacing within control groups. Page regions are 24px apart below `lg` and 32px from `lg` (`gap-6 lg:gap-8`); a back link sits 4px above its title. Search pairs a result list with an inspector on wide screens. Horizontal scrolling belongs inside genuinely wide data regions.

## Spacing

The scale is a named set of Tailwind classes, not CSS variables. Allowed steps (px): 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 (`0.5 1 2 3 4 5 6 8 10 12 16 20 24`). The landing page uses the same set without 20.

| Name | Value | Classes | Where |
|---|---|---|---|
| page-pad | 16/24/40 × 24/32/40 | `px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10` | `AppShell` main |
| region-gap | 24, 32 from `lg` | page root `grid gap-6 lg:gap-8` | every page root |
| back-to-title | 4 | `grid gap-1` around `PageBack` + `PageHeader` | pages with a back link |
| section-gap | 12 | `grid gap-3` | a heading and its panel |
| card-pad | 20, 24 from `sm` | `p-5 sm:p-6` | panels, forms, detail cards |
| card-pad-roomy | 24, 32 from `sm` | `p-6 sm:p-8` | empty states, the one card on a centred page |
| item-pad | 16 | `p-4` | repeated items: result cards, kanban cards |
| inset-pad | 12 | `p-3`, `rounded-lg` | a tile inside a card |
| stack-tight | 4 | `gap-1` | title and meta line |
| stack | 8 | `gap-2` | chips, button groups, label to control |
| group | 16 | `gap-4` | blocks inside a card, field to field |
| group-loose | 24 | `gap-6` | columns and groups inside a region |
| form | 8 / 16 / 24 | field `grid gap-2`; form `grid gap-4`; actions `flex flex-wrap gap-2 pt-2` | label to control / field to field / last field to actions |
| toolbar | 8 | `flex flex-wrap items-center gap-2` | filter rows, header actions |
| list-row | 12×16, 12×20 from `sm` | `px-4 py-3 sm:px-5` with `min-h-14` (one line); `px-4 py-4 sm:px-5` (two lines) | divided lists |
| table-cell | 8×12 | `px-3 py-2` | data tables |
| landing-section | 64 to 96 | `mt-16 sm:mt-20`, `mt-16 sm:mt-24`, `mt-20 sm:mt-24` | landing sections, varied on purpose |

`1.5` (6px) is allowed only in Alert and Badge, which follow Material UI (decision 2026-11-03). Banned: the steps `2.5`, `7`, `9`, `11`, `14`; arbitrary `[..]` spacing; negative margins used for rhythm (an optical nudge on an icon button carries an `// optical:` comment). Gate, expected empty:

```
cd frontend/src && grep -rnE "(^|[ \"'])(sm:|md:|lg:|xl:)?(-?m[tbxylrse]?|p[tbxylrse]?|gap(-[xy])?)-(2\.5|7|9|11|14)([ \"']|$)" --include='*.tsx' . ; grep -rnE "(^|[ \"'])-m[tb]-[0-9]" --include='*.tsx' .
```

## Elevation & Depth

Theme change (owner decision 2026-11-04, second round): the palette follows Gemini, a little darker. Light: page `#EEF2F8`, card white, ink `#172033` (navy, never black), primary `#0A50C2` (7.1:1 on white), accent `#D6E4FB`, sidebar `#E6ECF5`. Dark: page `#121826`, card `#1C2333`, primary `#A8C7FA`, filled controls `#0B57D0` with white. The hero card is deep indigo `--hero` (`#101C3D` light, `#1B2D63` dark) with a slow three-colour aurora behind it (blue, violet, rose; still under reduced motion). Gemini hues (`--gem-*`) appear only in the AI sparkle (`GemSparkle`, `AiMark`, `AiLabel`), the turning ring while AI works (`AiSpinner`, `.gem-ring`), the gradient edge of AI panels (`.gem-border`) and the soft blue light at the bottom of the work area (`.ambient-surface`). Text never sits on a gradient and gradient text is not used. Latin type is Google Sans Flex (OFL, self-hosted via `@fontsource-variable/google-sans-flex`); Thai stays Noto Sans Thai. Buttons and segmented controls are pills; inputs 12px radius. Stat numbers count up once from 0 (600 ms, skipped under reduced motion) and show only after their data has loaded.

Visual refresh (owner decision 2026-11-04, branch `feat/ui-visual-refresh`): cards and panels carry a soft layered shadow in the teal ink (`--shadow-soft`; `--shadow-lift` on hover and on the hero card), never black. Each workspace page may have one bold surface, the deep-teal `--hero` card (`bg-hero`, white text, `text-hero-muted` secondary, all AA-checked: 12.3:1, 8.5:1), used for the next step on Today. Clickable cards lift 2px on hover under `motion-safe`. Stat numbers are real counts only (no deltas, no trend arrows, no icon tiles). Overlays keep their existing shadows. Motion is brief state feedback (150-240ms) with the shared easing curve; reduced-motion preferences collapse transitions and animations.

## Shapes

The base radius is 8px: controls 8px, `xl` 12px, cards and panels `2xl` 16px, the hero card `3xl` 24px. Badges, status chips, meta chips and the small fit score are pills (`rounded-full`). `CompanyMark` is a 12px-radius initial tile with a fixed hue per company (six hues, `oklch` tint with dark text of the same hue; dark theme inverts); it is decorative and always sits beside the written company name. Tab lists stay segmented tracks with 8px radius.

## Components

### Landing (Persuade surface)

The public page persuades; the app operates. Section order: skip link, hero, three steps (numbered text columns; the tour carries the sample panels, so the steps do not repeat them), static tagline, tour, data and control, FAQ, closing, footer. Every public page (landing, feature, info, manual) uses one `PublicHeader`: Features menu, How it works, Data & connections, Manual, then Log in and Get started (Open app when signed in). Feature, info and manual lists are one bordered card with divided rows and a serif teal numeral, never grids of cards or icon tiles. The page has one primary action (create account, or open app when signed in), repeated unchanged in the hero and the closing card; the only other hero action is a text link. The tagline is a static two-tone statement between hairlines (muted first line, foreground second), with no scroll animation. The tour is a vertical index (Up and Down keys) beside one panel, never a pill strip and never a card inside a card. Objections are answered in a FAQ ledger of native `details` rows. The one authored motion is the hero demo card, played once on `--ease-out`; reduced motion shows its end state. No icon tiles, no pills outside the list above, no shadows on page cards, no gradient text. Proof comes only from true product facts and real UI states: no statistics, testimonials, logos, user counts, prices, awards or odds. Footer links go only to pages that exist.

### Buttons

Use `components/ui/button.tsx`; `components/Button.tsx` is its compatibility adapter. Material-style anatomy, heights below `lg` / from `lg` / coarse pointer: default 44 / 40 / 48; `sm` 44 / 36 / 44; `lg` 48 (16px text, 20px icons); `icon` square 44 / 40 / 48; `icon-sm` square 44 / 36 / 44. Radius 8px, gap 8px, 14px text at weight 500. Default is solid primary; outline is a card surface with the `border-strong` hairline; ghost shows the `--nav-hover` tint. A pressed outline button shows `accent` fill plus a primary border. Preserve the visible focus ring and disabled state.

### Segmented control

`.segmented` is a muted track holding buttons or tabs; the active one (`aria-pressed="true"` or `data-state="active"`) is a `card` segment with a `border-strong` hairline. Used for view switches, mode switches, theme and language switches and `TabsList`. Settings keeps underline tabs in navy.

### Page title block

`components/PageHeader.tsx`: an outline icon in the page's stage hue, the serif title, a muted lede (16px, max 42rem; title 30px, 36px from 768px, line-height 1.35) and actions on the right. Existing back links stay above it.

### Status dot and stage chip

`.stage-dot` (8px) sits beside a written status label; application status badges are muted badges with that dot. `CompanyMark` is a decorative initial-letter square (32, 40 or 48px, `bg-muted`) always beside the written company name. `.stage-chip` (36px) is the tinted stage icon tile in journey and getting-started steps; active is solid stage colour. Step indicators use a 24px circle: done is filled with a check, the current step is filled with its stage colour like a done step plus a "next" badge, upcoming steps are dimmed.

### Kanban and lists

Board columns are `muted` trays with a status dot, label and count; cards are white with a hairline above the meta row. Lists are one bordered card with divided rows and a 12px muted column header. Drop zones are dashed.

### Inputs / Forms

Use the shared Input, Select, and Textarea primitives. Inputs have a card background, stronger input border, 16px text, and a visible focus ring. Keep labels and helper or error text associated with their controls. Input and Select are 44 / 40 / 48 tall with an 8px radius and `px-3`; `aria-invalid` turns the border destructive with a 2px destructive/30 ring. Checkbox and radio are 20px with the primary accent. `Alert` (`ui/alert.tsx`) is a borderless tinted row: `rounded-lg px-4 py-2`, 20px severity icon, optional end action; error uses `role="alert"`, others `role="status"`. Compact account forms remain compact; do not turn simple settings into oversized panels.

### Cards / Badges / Status

Cards use a bordered card surface with 12px radius and no shadow. Badges are 24px-high (`min-h-6`), 6px-radius chips with a 4px gap with written status and semantic colour; the default badge is a 10% primary tint. Announce meaningful asynchronous updates through the existing status regions. Dialogs default to `max-w-xl` with `p-6 gap-4` (confirm dialogs pass `max-w-md`), titles semibold, actions `flex flex-wrap justify-end gap-2`. Menu items are 40px (44 coarse) with 16px icons in a `min-w-40 p-1` menu. `Progress` is 4px high. A progress indicator must reflect an actual value.

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
- Use serif below 20px (the 14px header wordmark is the one exception), or on Markdown output.
- Use black or near-black for any colour, shadow or button.
