# Claude Code — latest UX/UI handoff

Packaged:2026-10-17 (Asia/Bangkok).

ชุดนี้มีภาพที่เลือกใช้ล่าสุดครบ22หน้า พร้อม Markdown รายหน้า สเปก motion/pixel art และรายงานตรวจ ไม่รวมภาพร่างระหว่างทาง ภาพทุกภาพเป็น English/Desktop/Light แบบนิ่ง; ไม่มีการเขียนโค้ดแอปหรือ animation ในรอบนี้

## Start here

1. [Current index and mandatory implementation guardrails](CODEX_ALL_PAGES_REDESIGN_V2.md)
2. [All22 selected images](CODEX_REDESIGN_V2_GALLERY.md)
3. [Motion and pixel art requirements](CODEX_PIXEL_MOTION_V2.md)
4. [Latest GPT-6.1 Sol High review and page scores](CODEX_22_PAGE_DESIGN_REVIEW_V2.md)
5. [Artifact evidence and limitations](CODEX_22_PAGE_REVIEW_EVIDENCE_V2.md)
6. [Page checklist](CODEX_PAGE_DESIGN_CHECKLIST.md)

## Instructions for Claude Code

- Read the current index, then the selected versioned page specification and its PNG. The version varies by page; do not assumev2 is always latest. Use the bundled snapshot/manifest to identify it.
- Actual application checkout: `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`. Preserve existing uncommitted changes and follow actual AGENTS, PRODUCT.md, DESIGN.md and delivery/testing instructions before implementation.
- This directory is a handoff bundle, not a second application. Use the existing React/Vite frontend and current REST/SSE/session/run/approval contracts. Do not change backend behavior or invent capabilities from incidental raster details.
- Functional contracts and historical evidence not copied into this bundle remain linked to their original files in the same checkout. Those relative links are intentional. Keep this bundle under the current docs directory when using them; it is not an isolated application/source archive.
- Current corrected specifications and actual source override historical prototype guesses. All existing tabs/forms/actions and security boundaries must remain.
- Motion is written specification only. Pixel accents are small decorative directions; these PNGs are not production sprite assets. Support reduced motion and never invent progress/status.
- Expert review mean:7.8→8.6/10. No10/10 or production-ready claim. Six P2 acceptance areas02/04/05/06/14/21 are listed in the index and review. All22 new versions await owner review; old approvals do not automatically approve new images.
- After actual implementation, run required build/type checks, fixture-backed regression journeys, responsive/i18n/theme/keyboard/state checks and inspect real screenshots. These static concepts do not prove runtime behavior.

## Contents

-22 latest page Markdown handoffs at this directory root.
-22 selected PNGs and their manifests in `codex_gen_page/`.
- Shared index/gallery/motion/review/checklist Markdown and selected-image snapshot/score JSON.
- `bundle-manifest.json` records source and bundled SHA256 values. Images are byte-for-byte copies with embedded prompts preserved; Markdown only has local-link adjustments.

Original files remain unchanged.
