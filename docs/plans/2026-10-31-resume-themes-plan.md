# Plan: SPEC-RTH resume themes

Slices (each ends with passing tests, commit on `feat/resume-themes`):

1. **Model and render (backend, no DB).** `services/resume_themes.py`: tokens/file models (`extra=forbid`), 12 presets, contrast check, `validate_file`, `export_file`. `render_bundle(..., tokens=None)`. `common.typ` reads optional `font_pair`, `size`, `density`, `heading_style` with today's values as defaults. ACs 01, 02, 03 (service level), 04.
2. **Storage and API.** Migration `resume_themes`; endpoints list/save/import/export/delete/preview; `custom:<uuid>` accepted as `template_id`. ACs 03 (api), 05, 06, 07 (api).
3. **UI.** `features/themes` builder (impeccable), template picker shows 12 presets and custom themes. ACs 08, 09.

Rulings: Q-RTH-01 block delete while used; Q-RTH-02 six new presets reuse existing layouts with different tokens (ids paper, compact, banner, classic, portrait, studio), names approved by owner from screenshots; Q-RTH-03 no owner data in the file.
Assumption A-RTH-02 revised: no new `.typ` layout files in this spec; new presets are token variants of the existing layouts.
