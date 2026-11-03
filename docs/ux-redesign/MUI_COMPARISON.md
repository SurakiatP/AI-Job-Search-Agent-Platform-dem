# MUI comparison

Source: the Material UI source on GitHub (`mui/material-ui`, `master`, packages/mui-material/src), read on 2026-11-03.
MUI is not installed; the table says which real value each of our components follows and where it deviates, and why.
Values the code computes (for example Button height) are derived by hand from the quoted padding, font size and line height, not measured in a browser.

## Default theme values (MUI)

| Item | MUI value | Ours |
|---|---|---|
| Shape radius | 4px | `--radius` 8px (owner asked for a little rounder than 4px); cards and dialogs 12px; `rounded-sm` 4px (chips, badges and avatars stay pills like MUI Chip/Badge) |
| Disabled | background `rgba(0,0,0,.12)`, text `.38` (contained uses `.26` text) | 12% / 38% (now matches) |
| Hover layer | 4% of the colour (8% in dark) | outlined and ghost buttons, nav items and tabs: primary 4% (dark mode not changed) |
| Pressed / focus layer | 12% | primary 12% on active |
| Selected layer | 8% (16% in dark) | nav items: 8% / 16%; selected chips still use `accent` |
| Durations | 150 / 200 / 250 / 300 / 375 ms | `--dur-fast` 150, `--dur-base` 200, `--dur-slow` 300 |
| Easing | standard `cubic-bezier(.4,0,.2,1)`, out `(0,0,.2,1)` | default transitions now standard; `--ease-out` is ours `(.22,1,.36,1)` |
| Elevation 1 | `0 2px 1px -1px .2, 0 1px 1px 0 .14, 0 1px 3px 0 .12` | `--shadow-soft` is exactly this |
| Body 1 / Body 2 / Caption | 16/1.5, 14/1.43, 12/1.66 | Tailwind `text-base` 16/1.5 and `text-sm` 14/1.43 already match; `text-xs` set to 1.66; the page body keeps 1.7 and Thai keeps 13px/1.625 for readability; MUI letter-spacing not applied |

## Components

| Component | MUI real values | Ours now | Status |
|---|---|---|---|
| Button medium | padding 6/16, 14px, line-height 1.75 gives about 36.5px; small about 30.75px; large about 42.25px; radius 4; uppercase | 40px desktop, 44px phone, 48px touch; sentence case | Deviation: our accessibility floor is 44px on phones; uppercase dropped (Thai has no case) |
| Button states | contained: elevation 2, hover 4, active 8; disabled flat; TouchRipple on press | filled buttons use shadows 2 / 4 / 8, disabled flat, ripple on every `Button` and tab | Matches (hover still 90% fill, not the dark shade) |
| Input (outlined) | small about 40px (padding 8.5/14, 23px line); medium 56px; border `.23`; hover border is the text colour; focus is a 2px primary border; label floats onto the border | 40px desktop; hover border is the text colour; focus is border plus 1px ring (2px total); floating label on the login, sign-up, forgot, reset and new-project fields only | Matches for small size; other forms keep a label above the field |
| Select | same outlined input plus menu; MenuItem min height 48, padding 6 | native `select` with the input style | Matches MUI's `NativeSelect`, not the `Select` menu (kept native: phone pickers and the tests that call `selectOption`) |
| Chip | height 32 (small 24), radius 16, 13px | 32px desktop, 44px phone | Matches on desktop |
| Badge | 20px high, min width 20, side padding 6, radius 10 | min height 20, side padding 6, pill | Matches |
| Alert (standard) | padding 6/16, icon 22px with 12px gap, message padding 8/0, body2 text | padding 6/16, message padding 8/0, icon 20px | Matches except icon 20px |
| Tab / Tabs | min height 48, padding 12/16, indicator 2px underline | underline tabs, min height 48, padding 12/16, one 2px indicator that slides (300 ms), 4% hover, ripple; the landing tour keeps a segmented list | Matches |
| Dialog | margin 32, radius 4, elevation 24, title padding 16/24, content 20/24, actions padding 8 | all dialogs: radius 4 and elevation 24; the filter dialog also follows the paddings | Paddings only in the filter dialog |
| IconButton | padding 8 around a 24px icon gives 40px; small about 28px | 40px desktop, 44px phone | Matches on desktop |
| Checkbox | 24px icon, padding 9 gives 42px target; hover halo 4%, focus 12% | 20px box, halo ring 9px at 4% hover and 12% keyboard focus | Halo matches; box size differs |
| Card / Paper | elevation 1, radius 4, overflow hidden | border, elevation 1 shadow, radius 4 | Border added by us |
| ListItemButton | padding 8/16, selected layer 8% | sidebar items: hover 4%, selected 8% (16% dark); padding is ours | Layers match, padding not |

## Not compared

Snackbar and Tooltip sources were downloaded but not analysed. Stepper, Pagination, Skeleton, Autocomplete and the rest of the component list were not fetched.

## Decisions that conflict with real MUI

1. Radius: the owner chose MUI's 4px over the HelpDesk soft-UI 12 to 24px (2026-11-03).
2. Touch size: MUI does not enlarge targets on phones by itself; we keep 44px.
3. Spacing: 6px steps are now allowed in Alert and Badge (DESIGN.md updated); Button and Menu paddings are not copied.
4. Snackbar surface uses the navy ink token, not MUI's #323232, because black or near-black UI colours are not allowed here.

## Not done

The Select menu (MenuItem list) and the floating label on the remaining forms (account, profile, builder, settings) are not implemented. Snackbar is used only for the application-board move notice.
