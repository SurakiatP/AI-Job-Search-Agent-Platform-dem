# Assessment B — หลักฐานภาพแนวคิด 22 หน้า

วันที่: 2026-10-17 (Asia/Bangkok). ผู้ตรวจ: **GPT-6.1 Sol / high**; agent `/root/page_review_evidence_b`.

ตรวจอย่างอิสระจาก Assessment A: ไม่เปิดรายงานหรือคะแนน A; parent แจ้งว่า A เสร็จแล้วก่อนเผยแพร่ผล B. รายงานนี้ตรวจ artifact, detector และตัวอย่างภาพเสี่ยงสูง ไม่ให้คะแนน heuristic แทน A.

เป้าหมายคือ **generated static desktop/light/English concepts** ตาม [snapshot ที่ตรึง 22 ภาพ](codex_gen_page/review-snapshot-2026-10-17.json) ไม่ใช่แอปปัจจุบัน. Worktree: `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`.

อ่าน DESIGN.md และบริบท/สัญญาที่เกี่ยวข้องแล้ว; ใช้ Impeccable critique workflow ในขอบเขต Assessment B. ข้อกำหนด source pairing, owner approval, project-scoped grants และ manual submission เป็นข้อจำกัดในการอ่านภาพ. ไม่แก้แอป, tests, checklist, DESIGN.md หรือ Hub.

## ผลตรวจ artifact

| รายการ | ผลที่สังเกตได้ |
|---|---|
| Selected pages / unique IDs / unique images | 22 / 22 / 22 |
| SHA256 เทียบ snapshot และ manifest | ตรงกัน 22/22 |
| Image dimensions เทียบ manifest | ตรงกัน 22/22: 1513×1040 จำนวน 10, 1513×1039 จำนวน 9, 1512×1040 จำนวน 3 |
| PNG signature / chunk CRC | ผ่านทุก PNG ที่ตรวจ 23/23 |
| Embedded `impeccable:prompt` ที่ไม่ว่าง | 22/22 selected; 23/23 PNG ทั้ง directory |
| Handoff + manifest identity | ครบและตรงกัน 22/22 |
| Local Markdown links ใน handoff 22 หน้า | resolve ได้ 99/99 references รวมรายการซ้ำ |
| Status จาก snapshot + manifests + checklist | owner-approved 6; draft-awaiting-owner-review 16; checklist 22 rows |
| ภาพ page04 | เลือก **v2**; v1 เป็นภาพเก่าที่เก็บไว้ จึงมี PNG รวม 23 |
| Source baseline `/tmp/jsp-page-mock-source-baseline.json` | 403/403 hashes ตรง; ไม่พบ baseline file หายหรือเปลี่ยน |
| `rtk git diff --check` | exit 0 ไม่มีข้อความผิดพลาด |

คำว่า Approved คือสถานะที่เจ้าของอนุมัติภาพตาม record; ไม่ใช่การอนุมัติ implementation. ทั้ง 22 manifests ระบุ `implemented: false`. Baseline เทียบกับ checkpoint ของรอบภาพ ไม่ใช่กับ Git HEAD; source ที่ผู้ใช้แก้ไว้ก่อน checkpoint ยังอยู่.

### Identity ของภาพที่ตรวจ

Hash ในตารางเป็น prefix 12 ตัวเพื่ออ่านง่าย; SHA256 เต็มและ target identity อยู่ใน snapshot ที่ตรวจเทียบจริง.

| # | Handoff | Selected PNG | SHA256 prefix | Dimensions | Owner status |
|---|---|---|---|---|---|
| 01 | [Overview / Dashboard](01_OVERVIEW_DESIGN.md) | [01-overview-desktop-light-v1.png](codex_gen_page/01-overview-desktop-light-v1.png) | `7364dbf108ed` | 1513×1040 | Approved |
| 02 | [Job Search Workspace](02_JOB_SEARCH_DESIGN.md) | [02-job-search-desktop-light-v1.png](codex_gen_page/02-job-search-desktop-light-v1.png) | `b5383db7828c` | 1513×1039 | Approved |
| 03 | [Evaluation Sessions index](03_EVALUATION_SESSIONS_DESIGN.md) | [03-evaluation-sessions-desktop-light-v1.png](codex_gen_page/03-evaluation-sessions-desktop-light-v1.png) | `52f6824e4874` | 1513×1040 | Approved |
| 04 | [Evaluation Session Workspace](04_EVALUATION_WORKSPACE_DESIGN.md) | [04-evaluation-workspace-desktop-light-v2.png](codex_gen_page/04-evaluation-workspace-desktop-light-v2.png) | `3bcc9bfd33c7` | 1513×1039 | Approved |
| 05 | [Applications](05_APPLICATIONS_DESIGN.md) | [05-applications-list-desktop-light-v1.png](codex_gen_page/05-applications-list-desktop-light-v1.png) | `279694432a32` | 1512×1040 | Approved |
| 06 | [Job Detail](06_JOB_DETAIL_DESIGN.md) | [06-job-detail-desktop-light-v1.png](codex_gen_page/06-job-detail-desktop-light-v1.png) | `be1473745a15` | 1513×1040 | Approved |
| 07 | [CV & Experience](07_CV_EXPERIENCE_DESIGN.md) | [07-cv-experience-desktop-light-v1.png](codex_gen_page/07-cv-experience-desktop-light-v1.png) | `06d196807989` | 1513×1040 | Awaiting review |
| 08 | [Documents library](08_DOCUMENTS_DESIGN.md) | [08-documents-desktop-light-v1.png](codex_gen_page/08-documents-desktop-light-v1.png) | `634e7bedfff5` | 1513×1039 | Awaiting review |
| 09 | [Document Detail](09_DOCUMENT_DETAIL_DESIGN.md) | [09-document-detail-desktop-light-v1.png](codex_gen_page/09-document-detail-desktop-light-v1.png) | `21f376eacb11` | 1513×1039 | Awaiting review |
| 10 | [Agent Activity / Console](10_AGENT_ACTIVITY_DESIGN.md) | [10-agent-activity-desktop-light-v1.png](codex_gen_page/10-agent-activity-desktop-light-v1.png) | `0093a0b4cfd8` | 1513×1040 | Awaiting review |
| 11 | [Settings](11_SETTINGS_DESIGN.md) | [11-settings-desktop-light-v1.png](codex_gen_page/11-settings-desktop-light-v1.png) | `6bc429311b03` | 1513×1039 | Awaiting review |
| 12 | [Projects](12_PROJECTS_DESIGN.md) | [12-projects-desktop-light-v1.png](codex_gen_page/12-projects-desktop-light-v1.png) | `2469fc59677b` | 1513×1040 | Awaiting review |
| 13 | [New Project](13_NEW_PROJECT_DESIGN.md) | [13-new-project-desktop-light-v1.png](codex_gen_page/13-new-project-desktop-light-v1.png) | `a8aab2dd26ca` | 1512×1040 | Awaiting review |
| 14 | [Public Landing](14_LANDING_DESIGN.md) | [14-landing-desktop-light-v1.png](codex_gen_page/14-landing-desktop-light-v1.png) | `0c3cd284d388` | 1513×1039 | Awaiting review |
| 15 | [Login](15_LOGIN_DESIGN.md) | [15-login-desktop-light-v1.png](codex_gen_page/15-login-desktop-light-v1.png) | `853352a94133` | 1512×1040 | Awaiting review |
| 16 | [Sign Up](16_SIGNUP_DESIGN.md) | [16-signup-desktop-light-v1.png](codex_gen_page/16-signup-desktop-light-v1.png) | `2639cd9cfb68` | 1513×1039 | Awaiting review |
| 17 | [Forgot Password](17_FORGOT_PASSWORD_DESIGN.md) | [17-forgot-password-desktop-light-v1.png](codex_gen_page/17-forgot-password-desktop-light-v1.png) | `7024ccd4367f` | 1513×1040 | Awaiting review |
| 18 | [Reset Password](18_RESET_PASSWORD_DESIGN.md) | [18-reset-password-desktop-light-v1.png](codex_gen_page/18-reset-password-desktop-light-v1.png) | `a6e2bfb0d339` | 1513×1040 | Awaiting review |
| 19 | [Verify Email](19_VERIFY_EMAIL_DESIGN.md) | [19-verify-email-desktop-light-v1.png](codex_gen_page/19-verify-email-desktop-light-v1.png) | `8912804a18dc` | 1513×1040 | Awaiting review |
| 20 | [Account](20_ACCOUNT_DESIGN.md) | [20-account-desktop-light-v1.png](codex_gen_page/20-account-desktop-light-v1.png) | `8f832f29e4ed` | 1513×1039 | Awaiting review |
| 21 | [OAuth Consent](21_OAUTH_CONSENT_DESIGN.md) | [21-oauth-consent-desktop-light-v1.png](codex_gen_page/21-oauth-consent-desktop-light-v1.png) | `7d35779e5b6a` | 1513×1040 | Awaiting review |
| 22 | [Digest Unsubscribe](22_DIGEST_UNSUBSCRIBE_DESIGN.md) | [22-digest-unsubscribe-desktop-light-v1.png](codex_gen_page/22-digest-unsubscribe-desktop-light-v1.png) | `a60c3c7fa107` | 1513×1039 | Awaiting review |

## Detector: รันจริง แต่ไม่ยืนยันคุณภาพ PNG

CLI: `/Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable`.
ทุก shell invocation มี `rtk`; detector ถูกเรียกด้วย argument vector ผ่าน Python subprocess เพื่อเก็บ exit/stdout/stderr โดยไม่ตัด error. Effective detector commands ที่ทำซ้ำได้จาก worktree ข้างต้น:

```sh
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable context --target docs/codex_gen_page
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json docs/codex_gen_page/06-job-detail-desktop-light-v1.png
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json docs/codex_gen_page
```

`context` exit 0. การรัน `detect` ได้ผล:

| Target | Exit | stdout | stderr / ความหมาย |
|---|---:|---|---|
| page06 PNG แบบ relative | 1 | `[]` | `Error: cannot scan ...: ENOENT: no such file or directory, open '.../docs/codex_gen_page/06-job-detail-desktop-light-v1.png'` |
| PNG directory แบบ relative | 0 | `[]` | ว่าง; ไม่รายงานจำนวน PNG ที่วิเคราะห์ |
| page06 PNG แบบ absolute | 1 | `[]` | error ENOENT เหมือนเดิม |
| PNG directory แบบ absolute | 0 | `[]` | ว่าง; ไม่รายงาน coverage |

Target แบบ absolute ที่รันคือ `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem/docs/codex_gen_page/06-job-detail-desktop-light-v1.png` และ directory parent เดียวกัน. PNG มีอยู่จริง: ตรวจ file existence, signature, dimensions, CRC และ SHA256 เทียบ manifest แยกแล้ว. จึงไม่สรุปจาก error ว่า artifact หาย และไม่ซ่อม detector นอกขอบเขต.

`detect --help` exit 0 อธิบายการ scan markup/CSS/JSX/TSX และ rendered URL; ไม่มีหลักฐานรองรับ raster semantic analysis ในผลรันนี้. **การวิเคราะห์ตัว PNG ไม่สำเร็จ / coverage ไม่ได้รับการยืนยัน**. Directory exit 0 + `[]` หมายถึงไม่มี primary findings ที่เครื่องมือรายงานในสิ่งที่มัน scan ได้; ใช้รับรอง PNG, accessibility หรือ functional app ไม่ได้. ไม่มี source-app detector run ที่นำมาอ้างแทนภาพชุดนี้.

Raw local records (scratch): `/tmp/jsp-page-review-b-context.json`, `/tmp/jsp-page-review-b-detect.json`, `/tmp/jsp-page-review-b-detect-help.txt`, `/tmp/jsp-page-review-b-artifacts.json`. เป็นหลักฐานชั่วคราว ไม่ใช่ application files.

## ตรวจภาพเสี่ยงสูงแยกต่างหาก

เปิด PNG จริงด้วย `view_image` จำนวน 7 ภาพ: 06, 10, 14, 19, 20, 21, 22. เปรียบเทียบ handoff ที่เกี่ยวข้องและ targeted source contracts (`AccountPage.tsx`, `AuthPages.tsx`, `TimelineTab.tsx`, `UnsubscribePage.tsx`) เท่าที่จำเป็น. นี่เป็นการอ่านภาพและสัญญา ไม่ได้กดใช้งาน flow.

| หน้า | หลักฐานที่เห็นและข้อสังเกต |
|---|---|
| 06 Job Detail | แยก AI-assisted estimate 4.2/5 กับ rule-based coverage 8/11; แสดง CV v4 + job rev3 และ “Fixed pairing for this result”; tracking-only และ mail-app helper ชัด. ภาพไม่มีหลักฐานว่า source lookup, mailto หรือ stage write ทำงานจริง. |
| 10 Agent Activity | **[P1 ก่อนนำไปทำจริง]** แถว “CV experience extraction” แสดง CV context แต่ปุ่มยังเป็น “Open session”. Run ที่ไม่มี evaluation session ต้องเปิด run/CV context ที่มีจริง. Handoff [page10](10_AGENT_ACTIVITY_DESIGN.md) จดข้อแก้นี้ไว้แล้ว; ภาพยังแสดง label ที่อาจชวนให้สร้าง destination ที่ไม่มี. Timeline completed/waiting เป็นเพียงตัวอย่าง ต้องผูก actual events. |
| 14 Landing | **[P1 ก่อนนำไปทำจริง]** preview แสดงผล evaluation พร้อมปุ่ม “Change” ใต้ CV และ job; ชวนให้เข้าใจว่าเปลี่ยน source ของผลเดิมได้. ใช้ immutable pairing และ new-session flow ตามสัญญา. Handoff [page14](14_LANDING_DESIGN.md) ระบุให้ตัดปุ่มนี้แล้ว. ข้อความ manual submission ที่ด้านล่างช่วยสื่อขอบเขตดี. Preview มี nav labels ต่างจาก workspace จริงด้วย; ใช้ labels ตาม handoff. |
| 19 Verify Email | **[P2]** “You'll choose or create a project next” สัญญาว่าปลายทางถัดไปแน่นอน ทั้งที่ verification สำเร็จไม่พิสูจน์ว่ามี signed-in session; source เรียก refresh session แล้ว navigate `/app` ซึ่งมี gate อีกชั้น. ใช้ข้อความเป็นกลางหรือแสดง helper เมื่อทราบ next destination จริง. ภาพนี้พิสูจน์ได้เฉพาะหน้าตา success state. |
| 20 Account | **[P1 ก่อนนำไปทำจริง]** Active grant แสดง expiry Nov 17, 2024 ซึ่งผ่านไปแล้ว ณ วันที่รายงาน; อีกแถว Expired ใช้วันที่เดียวกัน. ต้องสร้าง synthetic fixtures ด้วย frozen clock และ expiry/status ที่สอดคล้องกัน. Source คำนวณ revoked/expired/active จากข้อมูลเวลา ไม่คัดลอก badge จากภาพ. **[P2]** copy ว่าข้อมูลทั้งหมด/ทุก project จะถูกลบถาวรเป็น generated claim; ยืนยัน exact deletion consequences จาก contract ก่อนใช้. Handoff [page20](20_ACCOUNT_DESIGN.md) มีข้อจำกัดทั้งสองเรื่องแล้ว. |
| 21 OAuth Consent | แสดง client/return host, project, permissions, duration และ Deny/Allow; application write options ไม่ถูก precheck. เห็น helper ว่าไม่ mark job applied และ revoke ได้จาก Account. เป็นทิศทางที่สอดคล้องกับ handoff แต่ PNG ไม่พิสูจน์ server scope limits, redirect validation, expiry enforcement หรือ keyboard checkbox behavior. |
| 22 Digest Unsubscribe | ภาพเป็น confirmation ก่อนเปลี่ยนสถานะ มีขอบเขตเฉพาะ saved search และ login เป็น secondary action; ไม่บังคับ login ผ่านข้อความ. สอดคล้องกับ explicit confirm ใน source. Token validity, request, expired/error/success และ re-enable ไม่ได้ทดสอบจากภาพ. |

Priority เหล่านี้เป็นความเสี่ยงจากความหมายของภาพก่อน implementation ไม่ใช่ข้อสรุปว่าระบบที่รันอยู่มี defect เดียวกัน. ประเด็นที่ handoff จดไว้แล้วนับเป็นข้อแก้ที่ต้องรักษาในการส่งต่อ ไม่ใช่ findings ใหม่ที่ถูกแก้ในรอบ B.

## ทำซ้ำและขอบเขตความเชื่อมั่น

ใช้ `rtk proxy python3 /tmp/jsp-page-review-b-audit.py` เพื่อตรวจ snapshot, manifest, SHA256, PNG CRC/embedded prompt, local links, status และ source baseline; exit 0. ผลเครื่องอ่านได้อยู่ใน scratch JSON ข้างต้น. Audit นี้อ่าน PNG text chunk `impeccable:prompt` โดยตรง ไม่อนุมานจาก manifest flag.

ไม่มี browser/live DOM/overlay หรือ task-completion test เพราะเป้าหมายเป็น generated PNG. ไม่ได้รัน build หรือ tests ของแอปในรอบนี้. ไม่ได้วัด WCAG contrast, accessibility tree, screen-reader/keyboard behavior, click/submit, loading/error recovery, mobile/tablet, Thai, dark theme, motion หรือ Core Web Vitals. รูปภาพไม่พิสูจน์การส่งเมล, provider/backend delivery หรือ authorization.

**ผล B:** artifact identity/provenance/link/status และ source-baseline checks ผ่านในขอบเขตที่ระบุ; deterministic raster quality coverage ใช้งานยืนยันไม่ได้จาก detector run นี้. ส่งต่อได้เพื่อ review ภาพและแก้ interpretation notes ก่อนสร้าง implementation; ไม่ใช่ production approval.

Questions skipped: Assessment B เป็นหลักฐานสำหรับ parent synthesis; parent เป็นผู้ถามลำดับการปรับปรุงหลังรวม A/B.
