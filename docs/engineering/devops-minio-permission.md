# ขอแก้สิทธิ์โฟลเดอร์ minio (jobsearch)

**สถานะวันที่ 2026-11-02: แก้แล้ว ปิดเรื่อง** devops ตอบว่าให้ทีมเราจัดการเองได้ ทีมเราเพิ่มงาน CI แบบกดรันเอง `fix-minio-permission` (เปลี่ยนเจ้าของ `${DATA_PATH}/minio` เป็น `65532:65532` เฉพาะโฟลเดอร์นี้) กดรันแล้วผ่าน หลังจากนั้น `minio` และ `web` ขึ้นปกติ (ตรวจด้วยงาน `show-logs`) เว็บ https://jobsearch.aiforthai.in.th ขึ้นแล้ว รุ่น `1.0.0-26` ไม่มีรหัสผ่านหรือ key ในเอกสารนี้

หลักฐานจาก log ก่อนแก้: `unable to create (/data/.minio.sys/tmp) file access denied` และ minio restart 2,563 ครั้ง ส่วนที่เหลือของเอกสารนี้คือข้อความเดิมก่อนแก้ เก็บไว้เป็นประวัติ

---

สถานะวันที่ 2026-10-31: deploy ผ่านแล้ว (pipeline #40083 บน `main`) แต่ `https://jobsearch.aiforthai.in.th` ยังขึ้น 502 เพราะ container `jobsearch-minio-1` crash วน (`Restarting (1)`) ไม่มีรหัสผ่านหรือ key ในเอกสารนี้

## สิ่งที่ตรวจพบ

จาก `docker compose ps` ท้าย deploy job:

| Container | สถานะ |
|---|---|
| postgres, litellm-db | Up (healthy) |
| meilisearch, litellm | Up |
| minio | Restarting (1) |
| web (พอร์ต 10360) | เพิ่งเริ่ม รอ minio |

- network `ai4thai_net`, docker socket และโฟลเดอร์ทั้ง 4 ใช้ได้ ไม่มีปัญหา
- สาเหตุที่น่าจะเป็นของ minio: image รันด้วยผู้ใช้ที่ไม่ใช่ root แต่ `/home/search/Thoughtmind/jobsearch/data/minio` เขียนไม่ได้ (ยังไม่ได้ยืนยันจาก log เพราะเราเข้าถึง log ของ container ไม่ได้)

## สิ่งที่ขอให้ devops ทำ

ทำอย่างใดอย่างหนึ่งกับโฟลเดอร์ `minio` (และ `meili` เพื่อความชัวร์):

1. `chmod 777 /home/search/Thoughtmind/jobsearch/data/minio` หรือ
2. `chown 65532:65532 /home/search/Thoughtmind/jobsearch/data/minio`

ถ้าได้ ช่วยส่งผลคำสั่งนี้มาด้วย เพื่อยืนยันสาเหตุ:

```text
docker logs jobsearch-minio-1 --tail 30
```

## หลังแก้แล้ว

- minio จะขึ้นเองภายในไม่กี่วินาที (restart policy `unless-stopped`) ไม่ต้อง deploy ใหม่
- ทีมเราจะตรวจหน้าเว็บ แล้วรัน job `create-test-users` เพื่อสร้างบัญชีทดสอบ
- ถ้าเว็บยังไม่ขึ้น ทีมเราจะตรวจสถานะ container อีกครั้งและแจ้งผล
