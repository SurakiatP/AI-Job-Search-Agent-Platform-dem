# UI Redesign for Client Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementers: Sonnet 5.5, high effort (owner instruction).

**Goal:** Replace the frontend's visual layer with a polished modern-minimal indigo design that works against the real backend for the 2026-10-08 client demo.

**Architecture:** Keep React Router routes, API calls, i18n, drafts and SSE logic. Replace tokens and the app shell, add shadcn-style primitives under `src/components/ui/`, rebuild the hero-path pages, and add two pages (Overview, Job search preview). Legacy class names in `routes.css` are re-skinned with the new tokens so untouched pages inherit the theme.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI, class-variance-authority, tailwind-merge, lucide-react, react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-redesign-design.md`

## Global Constraints

- Frontend only. No file under `backend/` changes.
- One accent hue: indigo. Green / amber / red only for fit score and status.
- Light / Dark / System via existing `ThemeProvider` (`document.documentElement.dataset.theme`), stored under `ui.theme`.
- Fonts: Noto Sans Thai for UI and body; Noto Serif Thai only for the landing headline; Manrope for English documents. Headings never italic.
- Every colour and font goes through a CSS variable. No raw hex/oklch outside `src/styles.css`.
- Motion: CSS only (no motion library). Animate `transform` and `opacity` only. Everything disabled under `prefers-reduced-motion: reduce`.
- Honest copy: no invented metrics, testimonials, user counts or employer logos. Sample data is visibly labelled as sample.
- Text contrast ≥ 4.5:1 in both themes; visible `:focus-visible`; no horizontal scroll at 375px.
- Thai and English: every new string has both languages. New pages may use an inline `copy = { th: {...}, en: {...} }` object (existing ChatPage pattern) so parallel tasks do not edit shared locale files.
- Only one new npm dependency is allowed: `@radix-ui/react-tabs` (pinned exact). Run `npm audit` after adding it.
- Keep `useResource`, `apiRequest`, `useDraft`, `useRun`, `useLocale`, `useTheme` APIs unchanged.
- Fit score is the API's `evaluation_result.score` on a 0–5 scale and may be `null`.

## Review Focus

1. Project with no CV, no jobs, no runs: Overview, Evaluate and Job detail render empty states with a next-step link, never a blank card or crash. — Task 4/5/6 browser check with a fresh project.
2. `evaluation_result.score === null` or run without `job_revision_id`: FitScore shows "—" with label "No score", job lists skip the run. — Task 1 FitScore, Task 4 mapping.
3. Long Thai titles and company names at 375px: wrap inside cards, no horizontal scroll. — every page check at 375px.
4. Dark theme contrast for muted text, badges and fit colours. — Task 1 token values; final browser pass.
5. Provider not configured: Evaluate shows the Settings notice and disables submit; Job search "Evaluate this job" still saves the job and routes to Evaluate where the notice is visible. — Task 5/8.

## File Ownership Map

| Task | Owns (exclusive) |
|---|---|
| 1 | `frontend/package.json`, `frontend/package-lock.json`, `frontend/components.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/src/styles.css`, `frontend/src/app/routes.css`, `frontend/src/lib/utils.ts`, `frontend/src/components/ui/*`, `frontend/src/components/Button.tsx`, `frontend/src/components/FitScore.tsx`, `frontend/src/components/StatusBadge.tsx`, `DESIGN.md` |
| 2 | `frontend/src/components/{AppShell,Header,ProjectSidebar,MobileDrawer,AppearanceControl,EmptyState}.tsx`, `frontend/src/app/router.tsx`, `frontend/src/locales/common.{th,en}.json`, `frontend/src/features/projects/PageStates.tsx` |
| 3 | `frontend/src/features/landing/*` |
| 4 | `frontend/src/features/overview/*` |
| 5 | `frontend/src/features/chat/*` |
| 6 | `frontend/src/features/jobs/*` |
| 7 | `frontend/src/features/documents/*` |
| 8 | `frontend/src/features/search/*` |
| 9 | `docs/demo/*` |

Waves: **W1** = Task 1 then Task 2 (sequential). **W2** = Tasks 3, 4 in parallel. **W3** = Tasks 5, 6, 7 in parallel. **W4** = Tasks 8, 9 in parallel. Root reviews and verifies in the browser after each wave.

Verification for every task (the frontend has no unit-test runner; build is the type gate):

```sh
rtk npm run build --prefix frontend
```

Expected: `tsc -b` and `vite build` finish with exit code 0.

---

### Task 1: Tokens, primitives and DESIGN.md

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (add `@radix-ui/react-tabs`)
- Create: `frontend/components.json`, `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/ui/{button,card,badge,input,textarea,label,tabs,skeleton,progress,separator}.tsx`
- Create: `frontend/src/components/FitScore.tsx`, `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/styles.css`, `frontend/src/app/routes.css`, `frontend/src/components/Button.tsx`, `frontend/tsconfig.json`, `frontend/vite.config.ts`
- Modify: `DESIGN.md`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `src/lib/utils.ts`.
- Produces: shadcn-style components exported by name: `Button` (variants `default | secondary | outline | ghost | destructive | link`, sizes `default | sm | lg | icon`, `asChild`), `Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`, `Badge` (variants `default | secondary | outline | success | warning | danger`), `Input`, `Textarea`, `Label`, `Tabs, TabsList, TabsTrigger, TabsContent`, `Skeleton`, `Progress({ value: number })`, `Separator`.
- Produces: `FitScore({ score: number | null; size?: 'sm' | 'lg'; locale: 'th' | 'en' })` — ring for 0–5 score, colour band ≥4 success, ≥2.5 warning, else danger; `null` renders "—" and "ยังไม่มีคะแนน / No score".
- Produces: `StatusBadge({ status: RunStatus | 'saved' | 'applied'; locale: 'th' | 'en' })`.
- Keeps: `components/Button.tsx` signature `variant?: 'primary' | 'secondary' | 'plain'`, now rendering `ui/button` (`primary→default`, `secondary→outline`, `plain→ghost`) and still defaulting `type="button"`.
- Path alias `@/*` → `src/*` in tsconfig and vite.

- [ ] **Step 1: Add the Tabs dependency and alias**

```sh
rtk npm install --prefix frontend --save-exact @radix-ui/react-tabs
rtk npm audit --prefix frontend
```

Expected: install succeeds; record audit summary for the Hub. A High/Critical finding stops the task and is reported.

`vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

`tsconfig.json` compilerOptions additions: `"baseUrl": "."`, `"paths": { "@/*": ["src/*"] }`.

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "ui": "@/components/ui", "utils": "@/lib/utils", "lib": "@/lib", "hooks": "@/hooks" },
  "iconLibrary": "lucide"
}
```

`src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Replace tokens in `src/styles.css`**

Keep the existing `@fontsource` imports and `@import 'tailwindcss';` at the top. Replace the `:root` blocks with:

```css
/* Hallmark · macrostructure: Workbench · genre: modern-minimal · tone: utilitarian-calm · anchor hue: indigo 277 */
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

:root {
  --radius: 0.75rem;
  --background: oklch(0.985 0.003 275);
  --foreground: oklch(0.22 0.02 275);
  --card: oklch(1 0 0);
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.51 0.23 277);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.955 0.012 275);
  --secondary-foreground: oklch(0.28 0.03 275);
  --muted: oklch(0.965 0.006 275);
  --muted-foreground: oklch(0.48 0.02 275);
  --accent: oklch(0.95 0.03 277);
  --accent-foreground: oklch(0.38 0.17 277);
  --destructive: oklch(0.55 0.21 27);
  --success: oklch(0.55 0.14 155);
  --warning: oklch(0.62 0.14 70);
  --border: oklch(0.91 0.008 275);
  --input: oklch(0.88 0.01 275);
  --ring: oklch(0.51 0.23 277);
  --sidebar: oklch(0.975 0.004 275);
  --font-sans: 'Noto Sans Thai', Manrope, sans-serif;
  --font-serif: 'Noto Serif Thai', serif;
  --font-document: Manrope, 'Noto Sans Thai', sans-serif;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 150ms;
  --dur-base: 240ms;
  --dur-slow: 900ms;
  /* legacy aliases used by routes.css and untouched pages */
  --surface: var(--card);
  --surface-subtle: var(--muted);
  color-scheme: light;
}
:root[data-theme='dark'] {
  --background: oklch(0.17 0.012 275);
  --foreground: oklch(0.96 0.005 275);
  --card: oklch(0.21 0.014 275);
  --primary: oklch(0.72 0.15 277);
  --primary-foreground: oklch(0.18 0.04 277);
  --secondary: oklch(0.26 0.016 275);
  --secondary-foreground: oklch(0.94 0.005 275);
  --muted: oklch(0.24 0.014 275);
  --muted-foreground: oklch(0.74 0.015 275);
  --accent: oklch(0.29 0.06 277);
  --accent-foreground: oklch(0.88 0.06 277);
  --destructive: oklch(0.7 0.17 25);
  --success: oklch(0.74 0.14 155);
  --warning: oklch(0.8 0.13 75);
  --border: oklch(0.3 0.014 275);
  --input: oklch(0.34 0.016 275);
  --ring: oklch(0.72 0.15 277);
  --sidebar: oklch(0.19 0.013 275);
  color-scheme: dark;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { border-color: var(--border); }
  html, body { overflow-x: clip; }
  body { margin: 0; min-width: 320px; background: var(--background); color: var(--foreground); font-family: var(--font-sans); font-size: 16px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4 { font-style: normal; overflow-wrap: anywhere; min-width: 0; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
}

@keyframes page-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.page-enter { animation: page-enter var(--dur-base) var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
```

Keep the remaining existing helper classes from `styles.css` (`.muted`, `.landing-headline`, `.chat-text`, `.document-english`, `.skip-link`, mobile drawer rules) but rewrite their colour/font values to the variables above. Delete old `.button*` rules only after Step 4 makes `Button.tsx` use `ui/button`. Delete `.app-header`, `.app-layout`, `.desktop-sidebar`, `.nav-link`, `.project-sidebar` rules — Task 2 replaces them with Tailwind classes.

- [ ] **Step 3: Re-skin `src/app/routes.css`**

Keep every selector (untouched pages use them). Change values only: cards use `background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 1px 2px oklch(0 0 0 / 0.04);`; muted text uses `var(--muted-foreground)`; notices use `background: var(--accent); color: var(--accent-foreground)`; form controls use `border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); background: var(--card)` and `:focus-visible` ring `var(--ring)`; page wraps `max-width: 72rem; margin-inline: auto`. Remove any hard-coded hex value.

- [ ] **Step 4: Add `src/components/ui/*` and adapt `Button.tsx`**

Write each primitive in the current shadcn "new-york" form using `cn`, `cva`, `@radix-ui/react-slot` (button), `@radix-ui/react-tabs` (tabs). `Progress` is a plain `div` with `role="progressbar"`, `aria-valuenow`, and an inner bar using `transform: translateX(-${100 - value}%)` with `transition: transform var(--dur-base) var(--ease-out)`. `Badge` adds variants:

```ts
success: 'border-transparent bg-success/15 text-success',
warning: 'border-transparent bg-warning/15 text-warning',
danger: 'border-transparent bg-destructive/15 text-destructive',
```

Every interactive primitive has hover, `focus-visible:ring-2 ring-ring`, active, `disabled:opacity-50 disabled:pointer-events-none`. Buttons have `min-h-10` (44px for `lg`).

`components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { Button as UiButton } from './ui/button';

const variants = { primary: 'default', secondary: 'outline', plain: 'ghost' } as const;

export function Button({ variant = 'secondary', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'plain' }) {
  return <UiButton type={type} variant={variants[variant]} {...props} />;
}
```

`aria-pressed="true"` on `UiButton` must render as selected: add `aria-pressed:bg-accent aria-pressed:text-accent-foreground` to the base class.

- [ ] **Step 5: FitScore and StatusBadge**

`src/components/FitScore.tsx`:

```tsx
import { cn } from '@/lib/utils';

export function fitBand(score: number | null) {
  if (score === null) return 'none';
  if (score >= 4) return 'success';
  if (score >= 2.5) return 'warning';
  return 'danger';
}

const stroke = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--destructive)', none: 'var(--border)' } as const;

export function FitScore({ score, size = 'sm', locale }: { score: number | null; size?: 'sm' | 'lg'; locale: 'th' | 'en' }) {
  const band = fitBand(score);
  const dimension = size === 'lg' ? 112 : 56;
  const radius = dimension / 2 - (size === 'lg' ? 8 : 5);
  const circumference = 2 * Math.PI * radius;
  const ratio = score === null ? 0 : Math.max(0, Math.min(score, 5)) / 5;
  const label = score === null ? (locale === 'th' ? 'ยังไม่มีคะแนน' : 'No score') : `${score.toFixed(1)} / 5`;
  return <div className="inline-flex flex-col items-center gap-1" role="img" aria-label={`${locale === 'th' ? 'คะแนนความเหมาะสม' : 'Fit score'}: ${label}`}>
    <div className="relative" style={{ width: dimension, height: dimension }}>
      <svg width={dimension} height={dimension} viewBox={`0 0 ${dimension} ${dimension}`} className="-rotate-90" aria-hidden="true">
        <circle cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={size === 'lg' ? 10 : 6} />
        <circle className="fit-ring" cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" stroke={stroke[band]} strokeWidth={size === 'lg' ? 10 : 6} strokeLinecap="round"
          strokeDasharray={circumference} style={{ ['--ring-circumference' as string]: `${circumference}`, strokeDashoffset: circumference * (1 - ratio) }} />
      </svg>
      <span className={cn('absolute inset-0 grid place-items-center font-semibold tabular-nums', size === 'lg' ? 'text-2xl' : 'text-sm')}>{score === null ? '—' : score.toFixed(1)}</span>
    </div>
    {size === 'lg' && <span className="text-sm text-muted-foreground">{label}</span>}
  </div>;
}
```

Add to `styles.css`: `@keyframes ring-fill { from { stroke-dashoffset: var(--ring-circumference, 400); } } .fit-ring { animation: ring-fill var(--dur-slow) var(--ease-out) both; }` (stroke-dashoffset is an SVG paint property, not layout; reduced-motion rule disables it).

`src/components/StatusBadge.tsx` maps: `completed`, `applied` → success; `running`, `queued` → default (indigo); `waiting_approval` → warning; `failed`, `interrupted` → danger; `cancelled`, `saved` → secondary. Labels in Thai/English: queued คิวรอ/Queued, running กำลังทำงาน/Running, waiting_approval รออนุมัติ/Needs approval, completed เสร็จแล้ว/Completed, failed ล้มเหลว/Failed, cancelled ยกเลิกแล้ว/Cancelled, interrupted หยุดกลางทาง/Interrupted, saved บันทึกไว้/Saved, applied สมัครแล้ว/Applied.

- [ ] **Step 6: Rewrite `DESIGN.md`**

Keep its section headings and the page table (add Overview and Job search `Preview` rows; update Landing and Sidebar description to the spec). Replace "สี" table with the token names and light/dark oklch values above, the rule "indigo accent only; success/warning/destructive only for score and status", and replace "ไม่มี animation" with the motion rules in Global Constraints. Typography table keeps current sizes. Set status line to "เจ้าของอนุมัติ redesign spec 2026-10-07".

- [ ] **Step 7: Build and commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend DESIGN.md && rtk git commit -m "feat(ui): add indigo token system and shadcn primitives"
```

Expected: build exit 0. Existing pages still render (legacy classes re-skinned).

---

### Task 2: App shell, sidebar and routes

**Files:**
- Modify: `frontend/src/components/{AppShell,Header,ProjectSidebar,MobileDrawer,AppearanceControl,EmptyState}.tsx`, `frontend/src/features/projects/PageStates.tsx`, `frontend/src/app/router.tsx`, `frontend/src/locales/common.{th,en}.json`
- Create: `frontend/src/features/overview/OverviewPage.tsx` (placeholder export only; Task 4 replaces body), `frontend/src/features/search/SearchPage.tsx` (placeholder export only; Task 8 replaces body)

**Interfaces:**
- Consumes: Task 1 primitives, `useTheme`, `useLocale`.
- Produces routes: `/app/projects/:projectId/overview` → `OverviewPage`, `/app/projects/:projectId/search` → `SearchPage`. `ProjectHome` and `AppStart` (no session case and session case both) redirect to `/overview`. Sidebar project `href` becomes `/app/projects/${id}/overview`.
- Produces: `AppShell` props unchanged (`projects, projectId, sessionId, children`). `Header` props unchanged (`menu, actions`) so Landing can keep using it.
- Produces: `LoadingState` renders `Skeleton` blocks; `ErrorState({ onRetry })` and `MissingResource` keep names.
- Placeholder bodies: `export function OverviewPage() { return null; }` and `export function SearchPage() { return null; }`.

- [ ] **Step 1: Sidebar layout**

Desktop: fixed-width 264px left column, `bg-sidebar border-r`, full height, sticky. Contents top to bottom:
1. Wordmark: small indigo square mark with lucide `Sparkles` icon + "AI Job Search Agent Platform" (wraps, never truncated).
2. Project switcher: `DropdownMenu` (existing `@radix-ui/react-dropdown-menu`) showing the current project name; items list all projects + "All projects" (`/app/projects`) + "New project" (`/app/projects/new`). When no project is selected, show the "Projects" link instead.
3. When a project is selected, nav items with lucide icons, each a `Link` with `aria-current="page"` when active (`bg-accent text-accent-foreground font-medium`): Overview `LayoutDashboard` → `overview`; Evaluate `MessagesSquare` → first session or `profile` if none, with the session list nested beneath (indented, small text) ; Saved jobs `Bookmark` → `jobs`; Job search `Search` → `search` with `Badge variant="outline"` "Preview"; Documents `FileText` → `documents`; CV & preferences `UserRound` → `profile`.
4. Bottom: Settings `Settings` → `/app/settings`; a 3-option segmented control for appearance (lucide `Sun`, `Moon`, `Monitor`, `aria-pressed`, labels via `aria-label`); ไทย / EN segmented control.

Mobile (<1024px): top bar with menu button opening existing `MobileDrawer` that renders the same sidebar content. Main content: `min-w-0 px-6 py-8 lg:px-10 max-w-6xl mx-auto w-full page-enter`.

Header (still used by Landing and gate screens): wordmark left; right side `actions`, appearance icon toggle and ไทย/EN.

- [ ] **Step 2: Locale keys**

Add to both `common.th.json` and `common.en.json` (TH / EN): `nav.overview` ภาพรวม / Overview, `nav.evaluate` ประเมินงาน / Evaluate, `nav.savedJobs` งานที่บันทึก / Saved jobs, `nav.search` ค้นหางาน / Job search, `nav.preview` Preview / Preview, `nav.documents` เอกสาร / Documents, `nav.cv` CV และเงื่อนไข / CV & preferences, `nav.allProjects` ทุก Project / All projects, `nav.newProject` สร้าง Project ใหม่ / New project, `appearance.light` สว่าง / Light, `appearance.dark` มืด / Dark, `appearance.system` ตามระบบ / System.

- [ ] **Step 3: Routes**

In `router.tsx` add inside the `/app/projects/:projectId` route: `<Route path="overview" element={<OverviewPage />} />` and `<Route path="search" element={<SearchPage />} />`. `ProjectHome` → `Navigate to overview`. `AppStart` → navigate to `/app/projects/${firstProjectId}/overview` once projects are ready (drop the sessions lookup). Sidebar `href` → `/overview`. Owner-gate error screen uses `Card` with a clear heading.

- [ ] **Step 4: Build, browser check, commit**

```sh
rtk npm run build --prefix frontend
```

Root browser check: sidebar active states, project switcher, theme toggle in Light/Dark/System, ไทย/EN, mobile drawer at 375px.

```sh
rtk git add frontend/src && rtk git commit -m "feat(ui): new app shell, sidebar and overview/search routes"
```

---

### Task 3: Landing (Workbench)

**Files:**
- Modify: `frontend/src/features/landing/LandingPage.tsx`
- Create: `frontend/src/features/landing/LandingPreview.tsx`, `frontend/src/features/landing/copy.ts`

**Interfaces:**
- Consumes: `Header`, `Button`/`ui/button` (`asChild` with `Link`), `Card`, `Badge`, `Tabs`, `FitScore`, `StatusBadge`, `useLocale`.
- Produces: `LandingPage` (same export name used by router).

- [ ] **Step 1: Copy**

`copy.ts` exports `landingCopy: Record<'th' | 'en', {...}>` with:
- headline TH "สมัครงานให้ตรงจุด ด้วย AI ที่ทำงานบนเครื่องคุณ" / EN "Apply with precision, with an AI that runs on your machine"
- sub TH "ใส่ CV กับประกาศงาน แล้วรับผลประเมินความเหมาะสมและเอกสารสมัครงานที่ปรับให้ตรงตำแหน่ง — คุณตรวจและส่งเองทุกครั้ง" / EN "Add your CV and a job posting, get a fit evaluation and tailored application documents — you review and submit every time."
- cta TH "เริ่มใช้งาน" / EN "Get started"; secondary "ดูวิธีทำงาน" / "See how it works" (anchors `#how`)
- tabs: "ประเมินงาน / Evaluate", "เอกสาร / Documents", "ค้นหางาน / Job search"
- steps (3): "ใส่ CV / Add your CV" — "เก็บ CV ต้นฉบับแยกจากเอกสารที่สร้างใหม่ทุกฉบับ"; "ประเมินความเหมาะสม / Evaluate the fit" — "AI อ่านประกาศงานเทียบกับ CV แล้วให้คะแนนพร้อมเหตุผล"; "รับเอกสารที่ปรับแล้ว / Get tailored documents" — "ร่าง CV และ Cover letter ตามตำแหน่ง ให้คุณตรวจก่อนใช้"
- privacy heading "ข้อมูลของคุณอยู่กับคุณ / Your data stays with you" and three points: "รันบนเครื่องของคุณ / Runs on your machine", "คีย์ AI เก็บใน Keychain ของ macOS / AI keys live in macOS Keychain", "ไม่ส่งใบสมัครแทนคุณ / Never submits applications for you"; footnote "ข้อมูล CV ที่จำเป็นจะถูกส่งไปยังผู้ให้บริการ AI ที่คุณเลือก / CV content needed for a request goes to the AI provider you choose."
- closing CTA heading "พร้อมเริ่มสมัครงานแบบตรงจุดหรือยัง / Ready to apply with precision?"

- [ ] **Step 2: Layout**

Sections in order, max width 72rem, centred:
1. `Header` with `actions` = primary `Button asChild` → `/app`.
2. Hero, two columns at ≥1024px (`grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`), stacked below: left = headline (`font-serif`, `text-4xl lg:text-5xl`, weight 500, line-height 1.4), sub, CTA row; right = `LandingPreview`.
3. `#how`: three steps as a horizontal row of numbered cards (number in an indigo circle, not an eyebrow label).
4. Privacy: one wide `Card` with lucide icons `Laptop`, `KeyRound`, `ShieldCheck` and the footnote.
5. Closing CTA band (`bg-accent`), then a single-line footer with app name and year from `new Date().getFullYear()`.

- [ ] **Step 3: LandingPreview**

`Tabs` with three panels rendered from real primitives and fictional sample data, each panel inside a `Card` with a small `Badge variant="outline"` "ตัวอย่าง / Sample":
- Evaluate: a job row "Frontend Developer · บริษัทตัวอย่าง จำกัด" with `FitScore score={4.2} size="lg"`, three short reason bullets, `StatusBadge status="completed"`.
- Documents: two document rows (CV ฉบับปรับสำหรับตำแหน่ง / Cover letter) with revision badges and a "ดาวน์โหลด" ghost button (disabled).
- Job search: three compact job cards with location, salary range, and small `FitScore`.
No fake browser chrome, no fake window dots.

- [ ] **Step 4: Build, check at 1440 and 375, commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/landing && rtk git commit -m "feat(ui): workbench landing page with live component preview"
```

---

### Task 4: Overview dashboard

**Files:**
- Modify: `frontend/src/features/overview/OverviewPage.tsx` (replace Task 2 placeholder)
- Create: `frontend/src/features/overview/latestEvaluations.ts`

**Interfaces:**
- Consumes: `useResource`, `RunView`, `JobRevisionView`, `DocumentView`, `ApprovalView` from `lib/api-types`, `FitScore`, `StatusBadge`, `Card*`, `Button`, `Skeleton`, `LoadingState`, `ErrorState`.
- API: `GET /projects/:id/cv` → `{ id, revision, original_filename?, mime_type?, size_bytes?, created_at? }[]`; `GET /jobs`; `GET /documents`; `GET /runs` (newest first); `GET /approvals` → `ApprovalView[]`; `GET /sessions`.
- Produces: `latestEvaluations(runs: RunView[]): Map<string, RunView>` — for each `job_revision_id`, the newest `operation === 'evaluate_job'` run with `status === 'completed'`; runs without `job_revision_id` are skipped.

- [ ] **Step 1: Mapping helper**

```ts
import type { RunView } from '@/lib/api-types';

export function latestEvaluations(runs: RunView[]): Map<string, RunView> {
  const latest = new Map<string, RunView>();
  for (const run of runs) {
    if (run.operation !== 'evaluate_job' || run.status !== 'completed' || !run.job_revision_id) continue;
    const current = latest.get(run.job_revision_id);
    if (!current || run.created_at > current.created_at) latest.set(run.job_revision_id, run);
  }
  return latest;
}
```

- [ ] **Step 2: Page layout**

- Heading row: project name (from `GET /projects/:id`), muted subtitle, primary action "ประเมินงานใหม่ / Evaluate a new job" → first session (`/sessions/:id`) or `profile` when no session exists (profile page creates sessions).
- Row of 3 summary cards (real counts only): saved jobs count, applied count, documents count.
- Grid `lg:grid-cols-3`:
  - Left 2 columns: **Saved jobs** card — list jobs (max 6) each with small `FitScore` (score from `latestEvaluations`, else `null`), title, company, `StatusBadge` saved/applied, link to job detail; footer link "ดูทั้งหมด / View all". Below it **Latest documents** (max 4) with type, revision, link.
  - Right column: **Your CV** card — latest revision filename, revision number, upload date (`Intl.DateTimeFormat(locale)`), file size, buttons "อัปเดต CV / Update CV" → `profile`; empty state "ยังไม่มี CV / No CV yet" + button "เพิ่ม CV / Add CV". Then **Agent activity**: runs with status `queued | running | waiting_approval` (max 5) with `StatusBadge` and link to their session; pending approvals count (`decision === null && consumed_at === null`) with link to the session of the run. Empty: "ไม่มีงานที่กำลังทำ / Nothing running".
- Loading uses `Skeleton` card shapes; any resource error shows `ErrorState` with retry for all.

- [ ] **Step 3: Build, browser check (fresh empty project and seeded project), commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/overview && rtk git commit -m "feat(ui): project overview dashboard with CV, jobs, documents and agent activity"
```

---

### Task 5: Evaluate (chat) page

**Files:**
- Modify: `frontend/src/features/chat/{ChatPage,RunResults,RunTimeline,ApprovalCard,Composer}.tsx`
- Do not modify: `frontend/src/features/chat/useRun.ts`

**Interfaces:**
- Consumes: `useRun` return value unchanged, `FitScore`, `StatusBadge`, `Progress`, `Card*`, `Badge`, `Button`, `Textarea`.
- Produces: same component names and props as today.

- [ ] **Step 1: Layout**

Two-column at ≥1280px: main transcript column + right document panel (toggle kept). Notices (no provider, no CV, no job) become `Card` alerts with an icon and a primary link button. Messages: user messages right-aligned `bg-primary text-primary-foreground` bubbles; assistant messages left-aligned `bg-card border` with a small indigo avatar mark; preserve `plain-content` whitespace and `chat-text` line-height.

- [ ] **Step 2: Agent timeline**

`RunTimeline`: card header with operation label (ประเมินงาน / ร่างเอกสาร) and `StatusBadge`; `Progress` bound to the latest event `progress_percent` (hide when null); vertical list of events with a dot (indigo for current, muted for past) and the existing translated message text. Keep current `cancellationPending` text.

- [ ] **Step 3: Results**

`RunResults`: when `evaluation_result` exists, show `FitScore size="lg"` next to a heading and a collapsible report using native `<details open>` with a styled `<summary>`; keep `data-testid="evaluation-report"` on the report element. Documents produced by the run render as cards with title, partial badge and a link to document detail. Download links become outline buttons with lucide `Download`.

- [ ] **Step 4: Approval and composer**

`ApprovalCard`: amber-bordered `Card` with lucide `ShieldAlert`, action description, expiry, Approve (primary) / Reject (outline) buttons; same callbacks. `Composer`: sticky bottom card with job `select` styled like `Input`, operation choice as segmented buttons, `Textarea` auto height, primary submit with lucide `Send`. All existing labels and disabled logic unchanged.

- [ ] **Step 5: Build, browser check with a real run if a provider is configured, commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/chat && rtk git commit -m "feat(ui): structured evaluate page with fit score, agent timeline and approvals"
```

---

### Task 6: Saved jobs and Job detail

**Files:**
- Modify: `frontend/src/features/jobs/JobsPage.tsx`

**Interfaces:**
- Consumes: `useResource`, `GET /runs` + `latestEvaluations` from `@/features/overview/latestEvaluations` (Task 4), `FitScore`, `StatusBadge`, `Card*`, `Input`, `Textarea`, `Label`, `Button`.
- Produces: `JobsPage`, `JobDetailPage` (same names).

- [ ] **Step 1: JobsPage**

Header row with title and "เพิ่มงาน / Add job" button that toggles the existing add-job form inside a `Card` (form fields, drafts and validation unchanged). Job list as cards in `md:grid-cols-2`: small `FitScore`, title link, company, `StatusBadge`, revision, `ApplicationStatusControl` as a compact outline button.

- [ ] **Step 2: JobDetailPage**

Back link "← งานที่บันทึก / Saved jobs". Header: title, company, source link (lucide `ExternalLink`), `StatusBadge`. Two columns ≥1024px: left = latest evaluation report (`<details open>`, `plain-content`) or empty state "ยังไม่ได้ประเมินงานนี้ / Not evaluated yet" with button to Evaluate (first session); below it the job description in a `Card` (`data-testid="job-description"` kept). Right = `FitScore size="lg"`, application status control, documents whose revisions reference this job (link to Documents page if none can be matched), button "ร่างเอกสารสำหรับงานนี้ / Draft documents for this job" → Evaluate.

- [ ] **Step 3: Build, browser check, commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/jobs && rtk git commit -m "feat(ui): saved jobs and job detail with fit score"
```

---

### Task 7: Documents and Document detail

**Files:**
- Modify: `frontend/src/features/documents/DocumentsPage.tsx`

**Interfaces:**
- Consumes: existing resources in the file, `Card*`, `Badge`, `Button`, `Tabs` (optional for revisions), lucide icons.
- Produces: `DocumentsPage`, `DocumentDetailPage` (same names).

- [ ] **Step 1: DocumentsPage**

Filter chips by type (All / CV / Cover letter / Other) using `aria-pressed` buttons; cards in `md:grid-cols-2 xl:grid-cols-3` with type icon (`FileUser`, `Mail`, `File`), title, language badge, revision badge, partial `Badge variant="warning"`. Empty state with link to Evaluate.

- [ ] **Step 2: DocumentDetailPage**

Back link. Two columns ≥1024px: left = reading surface `Card` with `max-w-[68ch]`, `document-english` class when `output_language === 'en'`, preserved whitespace; right = metadata card (type, language, revision, created date), revision list (newest first, current highlighted), download button (existing download URL logic), "ขอแก้ไข / Request changes" → Evaluate session. Keep every existing `data-testid` and provenance text present in the file today.

- [ ] **Step 3: Build, browser check, commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/documents && rtk git commit -m "feat(ui): documents library and reading view"
```

---

### Task 8: Job search preview

**Files:**
- Modify: `frontend/src/features/search/SearchPage.tsx` (replace Task 2 placeholder)
- Create: `frontend/src/features/search/sampleJobs.ts`

**Interfaces:**
- Consumes: `sendJson` (`POST /projects/:id/jobs` with `{ title, description, company, source_url: null }`), `useResource` for sessions, `Card*`, `Badge`, `Input`, `Label`, `Button`.
- Produces: `SearchPage`; `sampleJobs: SampleJob[]` where `type SampleJob = { id: string; title: string; company: string; province: string; salaryMin: number; salaryMax: number; remote: 'onsite' | 'hybrid' | 'remote'; tags: string[]; description: string }`.

- [ ] **Step 1: Sample data**

Eight fictional jobs in Thailand (Bangkok, Chiang Mai, Khon Kaen, Phuket, Nonthaburi), company names clearly fictional and ending "(ตัวอย่าง)", salaries in THB per month, realistic multi-paragraph Thai descriptions (responsibilities + requirements) long enough for evaluation (≥ 600 characters each). Roles: Frontend Developer, Full-stack Developer, Data Analyst, UX/UI Designer, Product Manager, QA Engineer, DevOps Engineer, Backend Developer.

- [ ] **Step 2: Page**

Top banner `Card` with `bg-accent`: "นี่คือตัวอย่างหน้าค้นหางาน ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ระบบค้นหาจริงอยู่ระหว่างพัฒนา / This is a preview with fictional data. Real job search is in development." Search `Input` (title/company, client-side). Left filter column (≥1024px; collapsible `<details>` on mobile): province checkboxes, salary minimum select, work mode checkboxes, "ล้างตัวกรอง / Clear". Results count + cards: title, company, province, salary range formatted with `Intl.NumberFormat(locale)`, work-mode badge, tags. Each card has "ประเมินงานนี้ / Evaluate this job": POST the job, then navigate to the first session (`/sessions/:id`) or `profile` if none; button shows a spinner while saving and an inline error on failure. Empty-filter state with "ล้างตัวกรอง".

- [ ] **Step 3: Build, browser check (filter, evaluate creates job visible in Saved jobs), commit**

```sh
rtk npm run build --prefix frontend
rtk git add frontend/src/features/search && rtk git commit -m "feat(ui): job search preview with sample data and real evaluate hand-off"
```

---

### Task 9: Demo data

**Files:**
- Create: `docs/demo/README.md`, `docs/demo/cv-th.html`, `docs/demo/cv-en.html`, `docs/demo/cv-th.pdf`, `docs/demo/cv-en.pdf`, `docs/demo/jobs.md`

**Interfaces:**
- Produces: files only; no application code.

- [ ] **Step 1: Persona CV**

Fictional persona: "ณัฐวุฒิ ใจดี (Nattawut Jaidee)", Frontend Developer, 4 years, Bangkok; fictional employers marked "(สมมติ)"; skills React, TypeScript, Next.js, Tailwind, testing; education; projects; email `nattawut@example.com`, phone `000-000-0000`. Clean single-page HTML using Noto Sans Thai from Google Fonts with print CSS (A4).

- [ ] **Step 2: PDF**

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=docs/demo/cv-th.pdf docs/demo/cv-th.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --print-to-pdf=docs/demo/cv-en.pdf docs/demo/cv-en.html
```

Expected: both PDFs exist; open one and confirm Thai glyphs render (not boxes). If Chrome is unavailable, keep HTML and also write `cv-th.txt` / `cv-en.txt` (accepted upload type) and report it.

- [ ] **Step 3: Jobs and runbook**

`jobs.md`: three fictional postings (good fit: Senior Frontend Developer; medium: Full-stack Developer; weak: Data Engineer) with title, company "(ตัวอย่าง)", description. `README.md`: demo runbook — start infra + app commands from `docs/engineering/local-operation.md`, Settings → OpenRouter key (owner only), create project, upload `cv-th.pdf`, add the three jobs, pre-run evaluations, demo order: Landing → Overview → Evaluate (live run) → Job detail → Document → Job search preview. State that all data is fictional.

- [ ] **Step 4: Commit**

```sh
rtk git add docs/demo && rtk git commit -m "docs: add fictional demo CV, jobs and demo runbook"
```

---

## Final verification (root)

- [ ] `rtk npm run build --prefix frontend` exit 0.
- [ ] Restart app: `rtk uv run --locked --project backend python scripts/run_local.py --build-frontend --open-browser` with `CORE02_PRIVATE_DIR=$HOME/.cache/job-search-platform/core02-runtime-20261003`.
- [ ] Browser pass on every page: Light and Dark, ไทย and EN, 1440px and 375px, no horizontal scroll, focus ring visible.
- [ ] Hero path with real backend: new project → upload demo CV → add job → (owner key present) evaluate → job detail score → document.
- [ ] `rtk npm test --prefix tests` run once; record failures in Hub as post-demo work.
- [ ] Update Hub TRACKING / WORKING_LOG with UI-002 status, branch-base exception and npm audit result.
