# คำขอ deploy โปรเจกต์ jobsearch (ถึงทีม devops)

เอกสารนี้ตอบตามคู่มือ "GitLab CI/CD: Deploy เมื่อ Push เข้า main" (`gitlab-ci-dind-deployment-guide-th.md`) ไม่มีรหัสผ่านหรือ key ของจริงในเอกสารนี้

## 1. ข้อมูลโปรเจกต์ (ตามคู่มือข้อ 1)

| หัวข้อ | ค่า |
|---|---|
| GitLab account | `park.outsource` |
| Repository | `gitlab.nectec.or.th/10service/jobsearch` |
| Branch ที่ deploy | `main` (ตั้งเป็น Protected แล้ว โค้ดล่าสุดอยู่ที่ `develop` และจะ merge เข้า `main` เมื่อพร้อม) |
| Domain | `jobsearch.aiforthai.in.th` |
| Data path (`DATA_PATH`) | `/home/search/Thoughtmind/jobsearch/data` |
| พอร์ต | host `10360` ไป container `8000` |
| รูปแบบ publish | `0.0.0.0:10360:8000` |
| Runner tag | `ai4thai-gpu1` |
| Network | `ai4thai_net` (external) |
| Image tag | `1.0.0-<เลข pipeline>` เช่น `1.0.0-1` |

ขอให้ตั้ง proxy และ TLS ของ `jobsearch.aiforthai.in.th` ไปที่พอร์ต `10360` ของเครื่องนั้น

## 2. สิ่งที่ขอให้เตรียมก่อน deploy ครั้งแรก

### 2.1 โฟลเดอร์ใต้ data path (4 โฟลเดอร์)

compose ตั้ง `create_host_path: false` จึงไม่สร้างโฟลเดอร์ให้เอง ขอให้สร้าง:

```text
/home/search/Thoughtmind/jobsearch/data/postgres
/home/search/Thoughtmind/jobsearch/data/minio
/home/search/Thoughtmind/jobsearch/data/meili
/home/search/Thoughtmind/jobsearch/data/litellm-db
```

ข้อควรระวัง:

- `minio` และ `meili` รันด้วยผู้ใช้ที่ไม่ใช่ root ต้องให้ container เขียนได้ ในการทดสอบของเรา สิทธิ์ 777 ใช้ได้ (ยังไม่ได้ยืนยัน uid ที่แน่ชัดของแต่ละ image ถ้า container ขึ้นแล้วล้มด้วย permission denied ให้ปรับสิทธิ์โฟลเดอร์นั้น)
- `postgres` และ `litellm-db` ให้ Postgres จัดการสิทธิ์เองตอนเริ่มครั้งแรก
- **ไม่ต้องสร้าง** `home` และ `private` แอปสร้างเอง ถ้าสร้างไว้แล้ว `private` ต้องเป็นสิทธิ์ 700 มิฉะนั้นแอปหยุดด้วย `maintenance_private_directory_permissions`

### 2.2 พื้นที่

| ส่วน | ที่ขอ | ที่มาของตัวเลข |
|---|---|---|
| ข้อมูลแอปใต้ data path | 40 GB | **ประมาณการ** ตามที่วัดบนเครื่องพัฒนา: postgres 306 MB, meili 242 MB, litellm-db 76 MB, source ของ agent ราว 2.8 GB และสมมติผู้ใช้ราว 100 คน คนละ 50 MB (ยังไม่ใช่ข้อมูลจริง) |
| Docker บนเครื่อง runner | เพิ่มราว 30 GB | **ประมาณการ** image แอป 0.9 GB, image agent 1.7 GB, image ระบบรวมราว 3 GB และ build cache ที่โตทุกครั้งที่ deploy |

ถ้ามีข้อจำกัดด้านพื้นที่ ขอให้แจ้ง เราจะปรับ

## 3. คำถามที่ต้องการคำตอบ (ตัดสินว่า deploy จะรอดหรือไม่)

1. **runner `ai4thai-gpu1` ต่อกับ Docker ที่รันถาวรบนเครื่องหรือไม่ และ job เข้าถึง data path ได้จริงหรือไม่** คู่มือเตือนว่า `docker:dind` อย่างเดียวไม่ทำให้ deployment ถาวร ถ้าเป็น DinD ชั่วคราว container จะหายเมื่อ job จบ
2. **อนุญาตให้แอปเมานต์ `/var/run/docker.sock` หรือไม่** แอปสร้าง container ชั่วคราวสำหรับงาน AI ผ่าน Docker ของเครื่อง (สิทธิ์ระดับสูงบนเครื่อง) และใช้ path เดียวกันทั้งในและนอก container ถ้าไม่อนุญาต ต้องออกแบบส่วนนี้ใหม่ ซึ่งเป็นงานใหญ่
3. **network `ai4thai_net` มีอยู่บนเครื่องนั้นหรือไม่** compose ประกาศเป็น external ถ้าไม่มี `docker compose up` จะล้มทันที
4. **runner รัน job บน protected branch (`main`) ได้หรือไม่** ตัวแปร `ENV_FILE` ของเราเป็น Protected

## 4. เครือข่ายขาออกที่เซิร์ฟเวอร์ต้องเข้าถึง

| ปลายทาง | ใช้ทำอะไร |
|---|---|
| Docker Hub | ดึง image ฐาน (node, python, postgres, meilisearch) |
| `ghcr.io` | ดึง image LiteLLM |
| `cgr.dev` | ดึง image MinIO |
| `github.com` | ดึง source ของ agent ตอนเริ่มครั้งแรก (ครั้งเดียว) |
| `openrouter.ai` | เรียกโมเดล AI |
| ที่เก็บแพ็กเกจของ Alpine, PyPI, npm | สร้าง image ของแอปและ agent |

รายการนี้รวบรวมจากไฟล์ compose, Dockerfile และสคริปต์เตรียม agent ยังไม่ได้ตรวจทุกโดเมนที่ระบบเรียก ถ้ามีไฟร์วอลล์ขาออก โปรดแจ้งเพื่อให้เราตรวจรายชื่อเพิ่ม

## 5. สิ่งที่ทีมเราจะทำ

1. ตั้งตัวแปร `ENV_FILE` ใน GitLab (ชนิด **File**, **Protected**, environment scope `production`, ปิด "Expand variable reference") ตามคู่มือข้อ 2
2. ตั้งตัวแปร `TEST_USERS` (ชนิด File, Protected, scope `production`) สำหรับบัญชีทดสอบของลูกค้า และ `ADMIN_USERS` (ชนิด File รูปแบบเดียวกัน บรรทัดละ `<อีเมล> <รหัสผ่าน>`) สำหรับบัญชีผู้ดูแลระบบ
3. merge `develop` เข้า `main` pipeline จะรันเทสต์ แล้ว deploy อัตโนมัติ (คัดลอก `ENV_FILE` เป็น `.env`, `docker compose config`, `build --pull`, `up -d --remove-orphans`, `ps`)
4. ครั้งแรกใช้เวลาหลายนาที เพราะแอปเตรียมเครื่องมือของ agent ครั้งเดียว
5. หลัง deploy ผ่าน กดรัน job `create-test-users` (manual) เพื่อสร้างบัญชีทดสอบ และ job `create-admin-users` (manual) เพื่อสร้างบัญชีผู้ดูแลระบบ
6. ปิดการส่งอีเมลไว้ก่อนตามที่ลูกค้าแจ้ง ผู้ใช้จึงสมัครเองและรีเซ็ตรหัสผ่านทางอีเมลไม่ได้ เราสร้างบัญชีทดสอบให้

## 6. ผลการซ้อม deploy บนเครื่องพัฒนาของเรา

ซ้อมด้วย `docker compose` จริง (พอร์ต 10361, โฟลเดอร์ข้อมูลชั่วคราว, Docker ในเครื่อง ยังไม่ใช่เครื่องของลูกค้า)

| รายการ | ผล |
|---|---|
| สร้าง image แอป | ผ่าน |
| service ทั้งชุด (postgres, minio, meilisearch, litellm-db, litellm, แอป) | ขึ้นครบ |
| สร้างโมเดล `ai-analyze` ใน LiteLLM | ผ่าน |
| เตรียม agent runtime ครั้งแรก | ผ่านหลังแก้ 2 จุดด้านล่าง |
| หน้าเว็บ `/health` และหน้า login | ตอบ 200 |
| สร้างบัญชีทดสอบ, ล็อกอินถูก/ผิด, ซ้ำ | ผ่าน (รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร) |
| เรียก AI จริง 1 ครั้งผ่าน LiteLLM ไป OpenRouter | ผ่าน |
| ส่งออก PDF ภาษาไทยในคอนเทนเนอร์ agent | ผ่าน |

ปัญหาที่เจอระหว่างซ้อมและแก้แล้ว:

1. image ของ agent build ไม่ผ่าน เพราะ Alpine ลบแพ็กเกจ chromium เวอร์ชันที่ล็อกไว้ ปรับเป็นไม่ล็อกเวอร์ชันของแพ็กเกจ apk (image ฐานยังล็อก digest)
2. ไฟล์ใน image อ่านไม่ได้โดยผู้ใช้ที่ไม่มีสิทธิ์พิเศษ เพราะ umask 077 แก้โดยกำหนดสิทธิ์อ่านให้ชัดเจน

## 7. สิ่งที่ยังไม่ได้ทดสอบ

- docker socket และ network `ai4thai_net` บนเครื่องลูกค้า (รอคำตอบข้อ 3.2 และ 3.3)
- pipeline จริงของ GitLab และการตรวจด้วย CI Lint
- การเข้าผ่านโดเมน https และ proxy (คุกกี้ล็อกอินกำหนดเป็น `Secure` ต้องเข้าผ่าน https)
- งาน AI แบบเต็มจากหน้าเว็บ (ประเมินงาน, ปรับ CV ฯลฯ) ทดสอบเฉพาะการเรียกโมเดลและการส่งออก PDF

## 8. ความเสี่ยง

- ถ้า devops ไม่อนุญาต docker socket (ข้อ 3.2) การ deploy จะรันงาน AI ไม่ได้ และต้องออกแบบใหม่
- ตัวเลขพื้นที่เป็นประมาณการ ควรติดตามการใช้พื้นที่จริงหลังเปิดใช้งาน
