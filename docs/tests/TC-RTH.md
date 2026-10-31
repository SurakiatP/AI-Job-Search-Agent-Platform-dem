# Test cases for SPEC-RTH (resume themes)

Spec: `docs/superpowers/specs/2026-10-31-resume-themes-design.md`. Data: invented only.

## TC-RTH-01 Old template ids render as before
AC: AC-RTH-01 · `P0` `regression` · Level: unit · Automate: yes
Pre-condition: sample CV from `tests/resume_samples.py`.
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Build the bundle for each of onyx, kakuna, ditgar, lotus, teak, saffron with accent teal, th and en | no theme tokens | `theme.json` has exactly the keys it had before this change; `main.typ` equals the template file |

## TC-RTH-02 Bad theme files are rejected whole
AC: AC-RTH-02 · `P0` `critical` · Level: unit and api · Automate: yes
Test data cases: extra key; accent `#FFFF00`; accent `red`; layout `../x`; unknown layout; font_pair `comic`; name empty; name 61 characters; body over 4096 bytes; not JSON; wrong `format`; wrong `version`.
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Import the file | each case | 422, error code `theme_invalid`, `rule` names the failing field, no row saved |

## TC-RTH-03 Export then import round trip
AC: AC-RTH-03 · `P0` · Level: unit and api · Automate: yes
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Export a saved custom theme | theme "My theme" | file has format `jsp-resume-theme`, version 1, no owner data |
| 2 | Import it | same file | new theme named "My theme 2" with equal layout and tokens |

## TC-RTH-04 All presets render
AC: AC-RTH-04 · `P1` · Level: integration (Docker + Hermes image) · Automate: yes
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Render each of the 12 presets | th long sample, en short sample | PDF starts with `%PDF-`, has the CV name and every non-empty section heading as text |

## TC-RTH-05 Delete blocked while used; owner isolation
AC: AC-RTH-05, AC-RTH-06 · `P1` · Level: api · Automate: yes
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Delete a theme used by 2 CVs | owner A | 409 `theme_in_use`, `used_by` 2, theme remains |
| 2 | Read A's theme as B | owner B | 404 |

## TC-RTH-06 Preview
AC: AC-RTH-07 · `P1` · Level: api · Automate: yes
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Preview with valid tokens | CV + theme | PDF bytes |
| 2 | Preview with invalid tokens | bad accent | 422, nothing rendered |

## TC-RTH-07 Builder screen
AC: AC-RTH-08, AC-RTH-09 · `P1` · Level: e2e + screenshots · Automate: yes (manual review of screenshots)
| # | Action | Input | Expected result |
|---|---|---|---|
| 1 | Open the builder at 1440 px and 390 px | test user | no horizontal overflow; focus ring visible on every control; no black or near-black colour |
| 2 | Select a non-ATS preset | teak | the note "not read in order for ATS" shows |
| 3 | Reduced motion on | media setting | no transition runs |
