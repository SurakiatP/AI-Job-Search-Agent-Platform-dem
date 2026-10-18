# Assessment B — Round 2 static concept evidence

วันที่ 2026-10-17 (Asia/Bangkok). ผู้ตรวจ **GPT-6.1 Sol / high**, agent `/root/page_review_evidence_b`. ทำงานแยกจาก A; ไม่อ่านรายงานหรือคะแนน Assessment A รอบ 2 และไม่เปลี่ยนคะแนน A.

เป้าหมายคือภาพแนวคิดใหม่ 22 ภาพใน [frozen snapshot](codex_gen_page/review-snapshot-round2-2026-10-17.json), SHA256 `8f157fc741e36f1fc738f6795ae3610566584c990e61ac27003567687f690133`. ใช้ JSON นี้เลือก version จริงทุกหน้า ไม่อนุมานว่าเป็น v2 ทั้งชุด. Worktree `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`. นี่เป็น **NO CODING / static desktop-light-English concept review**; เป้าหมาย 10/10 ไม่ใช่คะแนนที่ B รับรอง.

อ่าน [round 2 index](CODEX_ALL_PAGES_REDESIGN_V2.md), [motion/pixel contract](CODEX_PIXEL_MOTION_V2.md), DESIGN.md และ versioned handoffs ที่โยงกลับ functional contracts เดิม. B เขียนเฉพาะรายงานนี้กับ scratch `/tmp/jsp-round2-evidence-*`.

## หลักฐาน artifact

| Check | ผล |
|---|---|
| Selected pages / unique IDs / unique images | 22 / 22 / 22 |
| Version distribution | v2 = 11, v3 = 6, v4 = 5; page04 = v4 |
| SHA256 เทียบ snapshot + manifest | 22/22 ตรงกัน |
| Dimensions เทียบ manifest | 22/22 ตรงกัน: 1513×1040 = 8, 1513×1039 = 6, 1512×1040 = 7, 1514×1039 = 1 |
| Selected image ↔ manifest ↔ handoff ↔ version | 22/22 ตรงกัน |
| Local Markdown references ใน selected handoffs | resolve ได้ 198/198 รวมรายการซ้ำ |
| Embedded `impeccable:prompt` ไม่ว่าง | selected 22/22; PNG ทั้ง directory 60/60 |
| PNG signature / chunk CRC | ผ่าน 60/60 ที่ตรวจ |
| Current owner approvals | **0 approved, 22 draft-awaiting-owner-review** |
| Historical approvals | 6 จาก round เดิม; ไม่โอนมาอนุมัติภาพใหม่ |
| Manifest implementation claims | `implemented: false` และ `motion_implemented: false` ครบ 22/22 |
| Historical images | previous image ครบ 22/22; candidates และ superseded versions ยังเก็บอยู่ |
| Source baseline | 403/403 files SHA256 ตรงกับ `/tmp/jsp-page-mock-source-baseline.json`; ไม่พบเปลี่ยน/หาย |
| `rtk git diff --check` | exit 0, ไม่มี whitespace errors |

ภาพรวม 60 PNG รวม historical/candidates ไม่ใช่ selected pages 60 หน้า. ตรวจ prompt จาก PNG `tEXt` โดยตรง ไม่อนุมานจาก manifest flag. Baseline เป็น checkpoint ก่อนรอบภาพ; ไม่อ้างว่า working tree เท่ากับ Git HEAD หรือไม่มีการแก้ source ของผู้ใช้มาก่อน.

### Selected artifact identities

Hash prefix 12 ตัวในตาราง; SHA256 เต็มอยู่ใน frozen snapshot ที่เทียบจริง. ทุกแถวเป็น draft awaiting owner review.

| # | Handoff/version | Selected PNG | SHA256 prefix | Dimensions |
|---|---|---|---|---|
| 01 | [v2](01_OVERVIEW_DESIGN_V2.md) | [01-overview-desktop-light-v2.png](codex_gen_page/01-overview-desktop-light-v2.png) | `84f648c6ce37` | 1513×1040 |
| 02 | [v4](02_JOB_SEARCH_DESIGN_V4.md) | [02-job-search-desktop-light-v4.png](codex_gen_page/02-job-search-desktop-light-v4.png) | `90dc83df756a` | 1513×1039 |
| 03 | [v3](03_EVALUATION_SESSIONS_DESIGN_V3.md) | [03-evaluation-sessions-desktop-light-v3.png](codex_gen_page/03-evaluation-sessions-desktop-light-v3.png) | `4ccd9dda0b7e` | 1512×1040 |
| 04 | [v4](04_EVALUATION_WORKSPACE_DESIGN_V4.md) | [04-evaluation-workspace-desktop-light-v4.png](codex_gen_page/04-evaluation-workspace-desktop-light-v4.png) | `f74157247991` | 1513×1040 |
| 05 | [v2](05_APPLICATIONS_DESIGN_V2.md) | [05-applications-list-desktop-light-v2.png](codex_gen_page/05-applications-list-desktop-light-v2.png) | `ceeefca63acb` | 1513×1040 |
| 06 | [v4](06_JOB_DETAIL_DESIGN_V4.md) | [06-job-detail-desktop-light-v4.png](codex_gen_page/06-job-detail-desktop-light-v4.png) | `6aff57188a2b` | 1512×1040 |
| 07 | [v3](07_CV_EXPERIENCE_DESIGN_V3.md) | [07-cv-experience-desktop-light-v3.png](codex_gen_page/07-cv-experience-desktop-light-v3.png) | `fa2d172774ff` | 1512×1040 |
| 08 | [v2](08_DOCUMENTS_DESIGN_V2.md) | [08-documents-desktop-light-v2.png](codex_gen_page/08-documents-desktop-light-v2.png) | `824fa1ca0cf9` | 1513×1040 |
| 09 | [v4](09_DOCUMENT_DETAIL_DESIGN_V4.md) | [09-document-detail-desktop-light-v4.png](codex_gen_page/09-document-detail-desktop-light-v4.png) | `9cd5ba60ce33` | 1514×1039 |
| 10 | [v3](10_AGENT_ACTIVITY_DESIGN_V3.md) | [10-agent-activity-desktop-light-v3.png](codex_gen_page/10-agent-activity-desktop-light-v3.png) | `122001619998` | 1513×1040 |
| 11 | [v2](11_SETTINGS_DESIGN_V2.md) | [11-settings-desktop-light-v2.png](codex_gen_page/11-settings-desktop-light-v2.png) | `3a83fb8b726d` | 1513×1039 |
| 12 | [v3](12_PROJECTS_DESIGN_V3.md) | [12-projects-desktop-light-v3.png](codex_gen_page/12-projects-desktop-light-v3.png) | `5e291157f910` | 1512×1040 |
| 13 | [v2](13_NEW_PROJECT_DESIGN_V2.md) | [13-new-project-desktop-light-v2.png](codex_gen_page/13-new-project-desktop-light-v2.png) | `507c07c0e2d6` | 1513×1040 |
| 14 | [v3](14_LANDING_DESIGN_V3.md) | [14-landing-desktop-light-v3.png](codex_gen_page/14-landing-desktop-light-v3.png) | `4a4642cd136d` | 1512×1040 |
| 15 | [v2](15_LOGIN_DESIGN_V2.md) | [15-login-desktop-light-v2.png](codex_gen_page/15-login-desktop-light-v2.png) | `182469c7bf0e` | 1513×1039 |
| 16 | [v3](16_SIGNUP_DESIGN_V3.md) | [16-signup-desktop-light-v3.png](codex_gen_page/16-signup-desktop-light-v3.png) | `9c8f11843101` | 1512×1040 |
| 17 | [v2](17_FORGOT_PASSWORD_DESIGN_V2.md) | [17-forgot-password-desktop-light-v2.png](codex_gen_page/17-forgot-password-desktop-light-v2.png) | `3a38dbde624d` | 1513×1039 |
| 18 | [v2](18_RESET_PASSWORD_DESIGN_V2.md) | [18-reset-password-desktop-light-v2.png](codex_gen_page/18-reset-password-desktop-light-v2.png) | `c04f86bbc848` | 1513×1039 |
| 19 | [v2](19_VERIFY_EMAIL_DESIGN_V2.md) | [19-verify-email-desktop-light-v2.png](codex_gen_page/19-verify-email-desktop-light-v2.png) | `0a9375c34ab6` | 1513×1039 |
| 20 | [v2](20_ACCOUNT_DESIGN_V2.md) | [20-account-desktop-light-v2.png](codex_gen_page/20-account-desktop-light-v2.png) | `0bb7535aaed2` | 1513×1040 |
| 21 | [v4](21_OAUTH_CONSENT_DESIGN_V4.md) | [21-oauth-consent-desktop-light-v4.png](codex_gen_page/21-oauth-consent-desktop-light-v4.png) | `87a623a3d6f9` | 1512×1040 |
| 22 | [v2](22_DIGEST_UNSUBSCRIBE_DESIGN_V2.md) | [22-digest-unsubscribe-desktop-light-v2.png](codex_gen_page/22-digest-unsubscribe-desktop-light-v2.png) | `bcd857f829b5` | 1513×1040 |

## Detector attempt ที่รันจริง

เรียก CLI ด้วย Python subprocess และเก็บ command argument vector, cwd, exit, stdout, stderr ใน `/tmp/jsp-round2-evidence-detect.json`. Shell ใช้ `rtk proxy python3`; effective commands สำหรับทำซ้ำ:

```sh
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json /Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem/docs/codex_gen_page/04-evaluation-workspace-desktop-light-v4.png
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json /Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem/docs/codex_gen_page
```

| Target | Exit | stdout | stderr |
|---|---:|---|---|
| Selected page04 v4 PNG | 1 | `[]` | `Error: cannot scan .../04-evaluation-workspace-desktop-light-v4.png: ENOENT: no such file or directory, open '.../04-evaluation-workspace-desktop-light-v4.png'` |
| PNG directory | 0 | `[]` | ว่าง |

ไฟล์เป้าหมายมีอยู่จริงและผ่าน independent hash/signature/CRC checks. ดังนั้น error นี้ไม่ใช่หลักฐานว่า concept หาย. Detector ไม่ให้ usable raster design coverage ในรอบนี้; directory exit 0 และ `[]` ไม่ได้แปลว่าภาพปลอดปัญหาหรือผ่าน accessibility. ไม่ซ่อม detector, ไม่ scan source แอปอื่นแทน PNG และไม่เปิด live-app browser/DOM/overlay เพื่ออ้างผลของภาพใหม่.

## ภาพเสี่ยงสูงที่เปิดตรวจจริง

เปิด selected PNG ด้วย `view_image` 7 ภาพตาม snapshot: **04v4, 06v4, 09v4, 10v3, 14v3, 20v2, 21v4**. เปรียบเทียบ versioned handoff และ previous functional handoff ที่เกี่ยวข้อง; ไม่มีการทดสอบปุ่มหรือ flow.

| หน้า | สิ่งที่ภาพยืนยันได้ / ข้อจำกัด |
|---|---|
| 04v4 | Fixed CVv4 / Job rev3 อยู่ติดกัน; AI estimate 4.2/5 แยก rule-based 8/11; waiting-for-you กับ not-started ชัด; CTA บอกว่าเปิด review ไม่ใช่อนุมัติ/แทน CV. Cover letter ระบุ earlier completed run จึงไม่อ้างว่าผลงานของ current waiting run เสร็จแล้ว. ขั้น workflow ต้องมาจาก actual events ตาม handoff; PNG ไม่พิสูจน์ event mapping หรือ approval gates. |
| 06v4 | CV source v4 และ job rev3 เป็น read-only; document revision2/1 แยก identity; activity เป็น Stage updated / Email logged / Note added พร้อม Add note / Log email. มี tracking-only และ mail-app helper. ภาพไม่พิสูจน์ว่า latest evaluation lookup, history หรือ safe mailto ทำงานจริง. |
| 09v4 | ประกาศ historical document revision1/current revision2 ชัด; Download selected แยก Edit current; source panel ผูก CVv4/Jobrev3/Evaluation014; restore ระบุ creates new version, no overwrite. ต้อง resolve provenance ต่อ selected revision จริงและรักษา editor/restore/promote/trash gates เดิม; ไม่พิสูจน์ด้วยภาพ. |
| 10v3 | แยก Needs decision / Running / Finished; request บอก approve OR deny; CV extraction เปิด CV & facts แทน session ที่ไม่มี; failed มี label และ next action. Footer บอกสถานะมาจาก events และ waiting เป็น paused. นี่แก้ความกำกวมของภาพเดิมที่ action ของทุก run เป็น Open session; no runtime verification. |
| 14v3 | demo ติดป้าย illustrative/sample; fixed sources ไม่มี Change controls; manual submission ชัด; score/coverage แยกกันและ awaiting-review อยู่ต่างหาก. ยังต้องทำ demo affordances ให้ตรงการใช้งานจริงและรักษา useful below-viewport sections ตาม handoff. ไม่ถือ static preview ว่าเป็น working demo. |
| 20v2 | sample clock 17 Oct2026 ทำให้ Active expiry17 Nov2026 และ Expired1 Oct2026 สอดคล้องกัน. Delete เปลี่ยนเป็น Review account deletion พร้อม password/email next-step helper; ไม่มี expanded claim ว่าลบทุก file/project โดยอัตโนมัติ. Confirmation/revoke/auth behavior ยังไม่ทดสอบ. |
| 21v4 | หนึ่ง selected project, 7 existing capability choices, checked เฉพาะ Read generated results; privacy warning, AI-evaluation explanation และ never-marks-applied helper ชัด. Client/return origin, duration, Deny/Allow และ revoke location แสดงครบ. PNG ไม่พิสูจน์ requested-scope limits, defaults, expiry, redirect validation หรือ permission enforcement. |

ในตัวอย่าง 7 ภาพนี้ไม่พบความขัดแย้งเชิง source/approval/scope ที่ชัดระดับ P1 แบบที่ภาพเดิมมี; ข้อนี้ไม่ครอบคลุมทุก state ของ 22 หน้า และไม่ใช่ functional acceptance. ข้อพิจารณาก่อนทำจริง: ใช้ semantics ของ resource/run/revision ตาม handoff เสมอ ไม่สร้าง backend fields/events เพื่อให้ตรง raster.

## Motion และ pixel art เป็นสเปกเท่านั้น

Selected manifests ระบุ pixel-art proposal บน 01/04/07/10/12/13/14 เท่านั้น. Shared contract จำกัด decorative accent 24–32px (สูงสุด40px เมื่อมีพื้นที่), ไม่เป็น status/readiness/identity, ไม่ focusable/clickable/announced และไม่ใส่ใน auth/consent/account-security/unsubscribe decisions. ใน sample20/21 ไม่เห็น mascot/pixel decoration รบกวนการตัดสินใจ; sample10 มี compass accent ขนาดเล็ก. Accent บางภาพ เช่น04/14 ดูเรียบเป็น vector มากกว่าตระกูล pixel ของ10: ให้เลือก reusable pixel asset family เดียวก่อน implementation; `pixel_art: true` เป็น intent ไม่ใช่หลักฐานว่า asset ทุกภาพมี pixel rendition ที่ตรงกันแล้ว.

Motion contract ระบุ bounded greeting, actual-event transitions, static waiting approval, reduced-motion fallback, hidden-tab pause, reconnect deduplication และ stationary focus controls. ไม่ใช้ fake progress, endless pulse หรือ gamified sensitive decisions. ตรวจ selected handoffs 22/22 พบทั้ง `Not implemented`, `static concept`, other variants/states unproven และ `Motion specification — explanation only, no code`.

**ไม่มี animated asset/code ในขอบเขตหลักฐานนี้**; PNG พิสูจน์ animation timing, reduced-motion หรือ performance ไม่ได้. Contract นี้เป็นคำสั่งสำหรับรอบ implementation ในอนาคต ไม่ใช่ผล PASS ของ behavior ดังกล่าว.

## คำสั่งตรวจและสิ่งที่ไม่ได้วัด

```sh
rtk proxy python3 /tmp/jsp-round2-evidence-audit.py
rtk git diff --check
```

Audit script exit 0; raw artifact/doc checks อยู่ใน `/tmp/jsp-round2-evidence-artifacts.json` และ `/tmp/jsp-round2-evidence-docclaims.json`. สคริปต์และ JSON เป็น scratch local evidence. Snapshot พร้อม manifests/handoffs เก็บ identity ที่ใช้ทำซ้ำไว้ใน repo artifacts.

ไม่รัน application code/build/browser regression/user study ในรอบนี้. ไม่มีการวัด mobile/tablet, Thai/dark variants, WCAG contrast, accessibility tree, keyboard/screen-reader task completion, animation, Core Web Vitals หรือ real backend/provider delivery. ไม่รับรอง10/10จาก evidence checks. ผล B ยืนยัน artifact consistency และความตรงของคำอธิบาย static/text-only ในขอบเขตที่ตรวจ; ไม่ใช่ production approval.

Questions skipped: parent เป็นผู้รวม A/B และถามลำดับการปรับปรุงหลังรายงานทั้งสองพร้อม.
